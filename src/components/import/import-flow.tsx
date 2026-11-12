import type { QueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PrepareOutput, StepOutput } from "#/application/import-apply";
import type { RoomSuggestion, TeacherSuggestion } from "#/application/import-mappings";
import type { BatchView } from "#/application/import-report";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Callout, Notice } from "#/components/page";
import { SemesterForm } from "#/components/semesters/semester-form";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { type ImportBatch, pendingTotal } from "#/domain/import-batch";
import { classifyImportConflict } from "#/domain/import-conflicts";
import { blocksFromPeriods } from "#/domain/semester";
import type { AdminResponse } from "#/server/admin-actions";
import type { ImportTargets } from "#/server/import-flow";
import { applyImportBatchFn, getImportTargetsFn, suggestMappingsFn } from "#/server/import-fns";
import type { PreviewView } from "#/server/import-preview-view";
import { BatchCounts } from "./batch-counts";
import { BatchRows } from "./batch-rows";
import { ConflictNotice } from "./conflict-notice";
import {
  applySentence,
  BATCH_STATUS_LABELS,
  formatDate,
  formatInstant,
  termsWithoutDates,
  type VersionView,
} from "./flow-helpers";
import { loadImportRows } from "./load-rows";
import { RoomMappingStep, TeacherMappingStep } from "./mapping-steps";
import { runSteps, type StepResponse } from "./run-steps";
import { VersionOverview, VersionResult } from "./version-overview";

/** Blocos por chamada: ~1500 linhas no preparo e ~600 na aplicação, abaixo do orçamento do Workers. */
const PREPARE_CALLS = 20;
const APPLY_CHUNKS = 20;
const MAX_STEPS = 300;
const MAX_STALLS = 3;

const NETWORK_ERROR = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

async function postPrepare(
  file: File,
  semesterId: string,
  signal: AbortSignal,
): Promise<AdminResponse<PrepareOutput>> {
  try {
    const response = await fetch(
      `/api/import-prepare?semesterId=${encodeURIComponent(semesterId)}&maxCalls=${PREPARE_CALLS}`,
      { method: "POST", headers: { "Content-Type": "application/xml" }, body: file, signal },
    );
    return (await response.json()) as AdminResponse<PrepareOutput>;
  } catch {
    return { ok: false, status: 400, message: NETWORK_ERROR };
  }
}

function Step({
  number,
  title,
  children,
  hidden = false,
}: {
  number: number;
  title: string;
  children: ReactNode;
  hidden?: boolean;
}) {
  return (
    <section hidden={hidden} className="mt-8 grid gap-3" aria-labelledby={`passo-${number}`}>
      <h2 id={`passo-${number}`} className="text-lg font-semibold tracking-tight">
        <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="grid gap-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(done, total)}
        aria-valuetext={`${done} de ${total}`}
        className="h-3 w-full overflow-hidden rounded-full border bg-surface-2"
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm" aria-live="polite">
        {label}… {done} de {total}
      </p>
    </div>
  );
}

type Progress = { label: string; done: number; total: number };

function ErrorBox({
  message,
  conflict,
  onRetry,
}: {
  message: string;
  conflict: boolean;
  onRetry: () => void;
}) {
  return (
    <Callout tone="error" role="alert" className="grid gap-2">
      <p>{message}</p>
      {conflict && (
        <p className="text-sm">
          Outra operação mexeu neste lote ao mesmo tempo. Nada foi perdido: tente de novo.
        </p>
      )}
      <Button variant="outline" className="justify-self-start" onClick={onRetry}>
        Tentar de novo
      </Button>
    </Callout>
  );
}

type Failure = { message: string; conflict: boolean; again: () => void };

/** Falha de preparo/aplicação: conflitos tipados (outro lote em andamento, versão defasada) têm aviso próprio. */
function FailureBox({
  failure,
  semesterId,
  disabled,
  onResume,
  onCleared,
}: {
  failure: Failure;
  semesterId: string;
  disabled: boolean;
  onResume: (batchId: string, total: number) => void;
  onCleared: () => void;
}) {
  const kind = classifyImportConflict(failure.message);
  if (kind !== null) {
    return (
      <ConflictNotice
        kind={kind}
        message={failure.message}
        semesterId={semesterId}
        disabled={disabled}
        onResume={onResume}
        onCleared={onCleared}
      />
    );
  }
  return <ErrorBox message={failure.message} conflict={failure.conflict} onRetry={failure.again} />;
}

type FlowCache = {
  activeStep: number;
  semesterId: string;
  batch: ImportBatch | null;
  reused: boolean;
  supersededAt: string | null;
  versionView: VersionView | "";
  rowsBatch: BatchView | null;
  refreshKey: number;
  roomChoices: Record<string, string>;
  teacherChoices: Record<string, string>;
};

type Props = {
  view: PreviewView;
  file: File;
  timeZone: string;
  sessionId?: number;
  queryClient?: QueryClient;
};

/**
 * Fluxo da importação depois da prévia: semestre, de-para de salas e docentes, conferência
 * (preparo em passos) e aplicação (em passos), terminando no resultado por linha.
 */
export function ImportFlow({ view, file, timeZone, sessionId = 0, queryClient }: Props) {
  const cacheKey = useMemo(() => ["import-session", "flow", sessionId] as const, [sessionId]);
  const cached = queryClient?.getQueryData<FlowCache>(cacheKey);
  const [targets, setTargets] = useState<ImportTargets | null>(null);
  const [suggestions, setSuggestions] = useState<{
    rooms: RoomSuggestion[];
    teachers: TeacherSuggestion[];
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState(cached?.semesterId ?? "");
  const [activeStep, setActiveStep] = useState(
    Math.min(
      cached?.activeStep ?? 1,
      cached?.batch === null || cached?.batch === undefined ? 4 : 5,
    ),
  );
  const [roomChoices, setRoomChoices] = useState(cached?.roomChoices ?? {});
  const [teacherChoices, setTeacherChoices] = useState(cached?.teacherChoices ?? {});
  const [roomsDirty, setRoomsDirty] = useState(false);
  const [teachersDirty, setTeachersDirty] = useState(false);
  const [batch, setBatch] = useState<ImportBatch | null>(cached?.batch ?? null);
  const [reused, setReused] = useState(cached?.reused ?? false);
  const [supersededAt, setSupersededAt] = useState<string | null>(cached?.supersededAt ?? null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [versionView, setVersionView] = useState<VersionView | "">(cached?.versionView ?? "");
  const [rowsBatch, setRowsBatch] = useState<BatchView | null>(cached?.rowsBatch ?? null);
  const [refreshKey, setRefreshKey] = useState(cached?.refreshKey ?? 0);
  const [reviewRowsOpen, setReviewRowsOpen] = useState(false);

  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);
  // Ao sair da página, o laço de passos é interrompido (nada mais é chamado no servidor).
  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    queryClient?.setQueryData<FlowCache>(cacheKey, {
      activeStep,
      semesterId,
      batch,
      reused,
      supersededAt,
      versionView,
      rowsBatch,
      refreshKey,
      roomChoices,
      teacherChoices,
    });
  }, [
    activeStep,
    batch,
    cacheKey,
    queryClient,
    refreshKey,
    reused,
    roomChoices,
    rowsBatch,
    semesterId,
    supersededAt,
    teacherChoices,
    versionView,
  ]);

  const loadTargets = useCallback(async () => {
    setLoadError(null);
    const [targetsResult, suggestionsResult] = await Promise.all([
      runAdminAction(() => getImportTargetsFn()),
      runAdminAction(() =>
        suggestMappingsFn({
          data: {
            classrooms: view.rooms.map(({ id, short, name }) => ({ id, short, name })),
            teachers: view.teachers,
          },
        }),
      ),
    ]);
    if (!targetsResult.ok) return setLoadError(targetsResult.message);
    if (!suggestionsResult.ok) return setLoadError(suggestionsResult.message);
    setTargets(targetsResult.data);
    setSuggestions(suggestionsResult.data);
    const [first] = targetsResult.data.semesters;
    if (first !== undefined) {
      setSemesterId((current) =>
        targetsResult.data.semesters.some((item) => item.id === current) ? current : first.id,
      );
    }
  }, [view]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const invalidate = useCallback(() => {
    setBatch(null);
    setProgress(null);
    setFailure(null);
    setActiveStep((current) => Math.min(current, 4));
  }, []);

  const semester = targets?.semesters.find((item) => item.id === semesterId);
  const missing = semester === undefined ? null : termsWithoutDates(view.termsUsed, semester);
  const busy = progress !== null;
  const unsaved = roomsDirty || teachersDirty;

  async function prepare() {
    // Reentrada (clique duplo): a ref vale já neste tick, antes de qualquer estado re-renderizar.
    if (semester === undefined || running.current) return;
    running.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setFailure(null);
    setBatch(null);
    setProgress({ label: "Preparando", done: 0, total: 0 });
    const outcome = await runSteps<PrepareOutput>(
      () =>
        postPrepare(file, semester.id, controller.signal) as Promise<StepResponse<PrepareOutput>>,
      {
        signal: controller.signal,
        maxSteps: MAX_STEPS,
        maxStalls: MAX_STALLS,
        onProgress: (output) => {
          const total = output.batch.summary.rows;
          setProgress({ label: "Preparando", done: Math.max(total - output.remaining, 0), total });
        },
      },
    );
    running.current = false;
    if (controller.signal.aborted) return;
    setProgress(null);
    if (!outcome.ok) {
      setFailure({ ...outcome.failure, again: () => void prepare() });
      return;
    }
    // Nomes dos responsáveis afetados vêm junto do lote (sem piscar depois das linhas).
    if (outcome.last.batch.summary.version !== undefined) {
      const loaded = await loadImportRows({ batchId: outcome.last.batch.id, limit: 1, offset: 0 });
      setRowsBatch(loaded.ok ? loaded.data.batch : null);
    }
    setBatch(outcome.last.batch);
    setVersionView("");
    setReused(outcome.last.reused);
    setSupersededAt(outcome.last.superseded?.appliedAt ?? null);
    setRefreshKey((key) => key + 1);
  }

  /** Aplica em passos; "track" = o lote é o da conferência (senão é a retomada de outro lote em andamento). */
  async function runApply(batchId: string, total: number, track: boolean) {
    if (running.current) return;
    running.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setFailure(null);
    setProgress({ label: "Aplicando", done: 0, total });
    const outcome = await runSteps<StepOutput>(
      () =>
        runAdminAction(() =>
          applyImportBatchFn({ data: { batchId, maxChunks: APPLY_CHUNKS } }),
        ) as Promise<StepResponse<StepOutput>>,
      {
        signal: controller.signal,
        maxSteps: MAX_STEPS,
        maxStalls: MAX_STALLS,
        onProgress: (output) => {
          if (track) setBatch(output.batch);
          setProgress({ label: "Aplicando", done: Math.max(total - output.remaining, 0), total });
        },
      },
    );
    running.current = false;
    if (controller.signal.aborted) return;
    setProgress(null);
    setRefreshKey((key) => key + 1);
    if (!outcome.ok) {
      if (track && outcome.last !== null) setBatch(outcome.last.batch);
      setFailure({ ...outcome.failure, again: () => void runApply(batchId, total, track) });
    }
  }

  function apply() {
    if (batch === null) return;
    void runApply(batch.id, pendingTotal(batch.summary.counts), true);
  }

  if (loadError !== null) {
    return (
      <Callout tone="error" role="alert" className="mt-8 grid gap-2">
        <p>{loadError}</p>
        <Button variant="outline" className="justify-self-start" onClick={() => void loadTargets()}>
          Tentar de novo
        </Button>
      </Callout>
    );
  }
  if (targets === null || suggestions === null) {
    return <p className="mt-8 text-muted-foreground">Carregando semestres e vínculos…</p>;
  }

  const readyToApply =
    batch !== null && batch.status !== "aplicado" && batch.status !== "preparando";
  const pendingCount = batch === null ? 0 : pendingTotal(batch.summary.counts);
  const version = batch?.summary.version;
  const resumeOther = (batchId: string, total: number) => void runApply(batchId, total, false);
  const clearFailure = () => setFailure(null);
  const flowSteps = ["Semestre", "Salas", "Docentes", "Conferência", "Aplicação"];
  const stepCount = batch === null ? 4 : 5;

  return (
    <>
      <div className="mt-8 grid gap-3 rounded-xl border bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold" aria-live="polite">
            Etapa {activeStep} de {stepCount}: {flowSteps[activeStep - 1]}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveStep((step) => Math.max(step - 1, 1))}
              disabled={activeStep === 1 || busy}
            >
              Voltar
            </Button>
            <Button
              size="sm"
              onClick={() => setActiveStep((step) => Math.min(step + 1, stepCount))}
              disabled={
                busy ||
                (activeStep === 1 && semester === undefined) ||
                (activeStep === 3 && unsaved) ||
                (activeStep === 4 && batch === null)
              }
            >
              {activeStep === 4 ? "Ir para aplicação" : "Continuar"}
            </Button>
          </div>
        </div>
        <ol
          className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
          aria-label="Etapas da importação"
        >
          {flowSteps.slice(0, stepCount).map((label, index) => (
            <li key={label}>
              <button
                type="button"
                className={
                  activeStep === index + 1 ? "font-semibold text-foreground underline" : "underline"
                }
                aria-current={activeStep === index + 1 ? "step" : undefined}
                disabled={busy || (index === 4 && batch === null)}
                onClick={() => setActiveStep(index + 1)}
              >
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <Step number={1} title="Semestre" hidden={activeStep !== 1}>
        {targets.semesters.length === 0 ? (
          <Callout tone="info" className="grid gap-3">
            <p>
              Ainda não há semestres. Crie um aqui. O XML pode preencher blocos e horários, mas não
              informa as datas do semestre nem das durações.
            </p>
            <SemesterForm
              semester={null}
              initialBlocks={blocksFromPeriods(view.periods)}
              onSaved={(created) => {
                setTargets((current) =>
                  current === null
                    ? current
                    : { ...current, semesters: [created, ...current.semesters] },
                );
                setSemesterId(created.id);
              }}
            />
          </Callout>
        ) : (
          <div className="grid max-w-md gap-2">
            <Label htmlFor="import-semester">Semestre da importação</Label>
            <select
              id="import-semester"
              value={semesterId}
              disabled={busy}
              onChange={(event) => {
                setSemesterId(event.target.value);
                invalidate();
              }}
              className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring outline-none"
            >
              {targets.semesters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({formatDate(item.start)} a {formatDate(item.end)})
                </option>
              ))}
            </select>
            <details className="mt-2 rounded-xl border p-3">
              <summary className="cursor-pointer font-medium">Criar semestre nesta tela</summary>
              <div className="mt-3 grid gap-3">
                <p className="text-sm text-muted-foreground">
                  Os blocos de horário são pré-preenchidos pelo XML. Informe manualmente as datas do
                  semestre e das durações.
                </p>
                <SemesterForm
                  semester={null}
                  initialBlocks={blocksFromPeriods(view.periods)}
                  onSaved={(created) => {
                    setTargets((current) =>
                      current === null
                        ? current
                        : { ...current, semesters: [created, ...current.semesters] },
                    );
                    setSemesterId(created.id);
                  }}
                />
              </div>
            </details>
          </div>
        )}
        {semester !== undefined && missing !== null && missing.positions.length > 0 && (
          <Callout tone="error" role="alert" className="grid gap-1">
            <p>
              O arquivo usa {missing.positions.length === 1 ? "a duração" : "as durações"}{" "}
              {missing.positions.join(", ")}, sem datas neste semestre. {missing.slots}{" "}
              {missing.slots === 1 ? "horário ficará" : "horários ficarão"} não aplicáveis (“Duração
              sem datas no semestre”).
            </p>
            <Link
              to="/semestres/$id"
              params={{ id: semester.id }}
              className="font-medium text-accent-text underline"
            >
              Configurar as datas do semestre
            </Link>
          </Callout>
        )}
      </Step>

      <Step number={2} title="Salas" hidden={activeStep !== 2}>
        <p className="text-sm text-muted-foreground">
          Escolha o espaço de cada sala do arquivo. Sala sem vínculo deixa suas aulas não
          aplicáveis; nada é inventado.
        </p>
        <RoomMappingStep
          rooms={view.rooms}
          suggestions={suggestions.rooms}
          spaces={targets.spaces}
          initialChoices={roomChoices}
          onChoicesChange={setRoomChoices}
          onSpacesCreated={(created) =>
            setTargets((current) =>
              current === null
                ? current
                : {
                    ...current,
                    spaces: [...current.spaces, ...created].sort((a, b) =>
                      a.name.localeCompare(b.name, "pt-BR"),
                    ),
                  },
            )
          }
          onSaved={invalidate}
          onDirtyChange={setRoomsDirty}
        />
      </Step>

      <Step number={3} title="Docentes" hidden={activeStep !== 3}>
        <p className="text-sm text-muted-foreground">
          O responsável pela ocupação é a conta do primeiro docente da aula que tiver vínculo. A
          sugestão usa a sigla do docente igual ao código da conta.
        </p>
        <TeacherMappingStep
          teachers={view.teachers}
          suggestions={suggestions.teachers}
          accounts={targets.accounts}
          initialChoices={teacherChoices}
          onChoicesChange={setTeacherChoices}
          onSaved={invalidate}
          onDirtyChange={setTeachersDirty}
        />
      </Step>

      <Step number={4} title="Conferência" hidden={activeStep !== 4}>
        <p className="text-sm text-muted-foreground">
          Confere o que seria aplicado, o que não se aplica (com o motivo) e os conflitos. Nada é
          gravado como ocupação ainda.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void prepare()}
            disabled={busy || semester === undefined || unsaved}
          >
            {batch === null ? "Conferir importação" : "Conferir de novo"}
          </Button>
          {unsaved && (
            <span className="text-sm text-muted-foreground">
              Salve os vínculos de salas e docentes antes de conferir.
            </span>
          )}
        </div>
        {progress !== null && (progress.label === "Preparando" || batch === null) && (
          <ProgressBar label={progress.label} done={progress.done} total={progress.total} />
        )}
        {failure !== null && progress === null && batch === null && (
          <FailureBox
            failure={failure}
            semesterId={semesterId}
            disabled={busy}
            onResume={resumeOther}
            onCleared={clearFailure}
          />
        )}
        {batch !== null && (
          <div className="grid gap-3">
            <p className="text-sm">
              Importação do arquivo {batch.fileHash.slice(0, 8)} ·{" "}
              {BATCH_STATUS_LABELS[batch.status]}
            </p>
            {reused && batch.status === "aplicado" && supersededAt !== null && (
              <Notice tone="info" role="status">
                Este arquivo corresponde a uma versão anterior da grade, substituída em{" "}
                {formatInstant(supersededAt, timeZone).slice(0, 10)}. Voltar a uma versão anterior
                ainda não é suportado; para reaplicá-la, gere uma nova exportação.
              </Notice>
            )}
            {reused && batch.status === "aplicado" && supersededAt === null && (
              <Notice tone="info" role="status">
                Este arquivo já foi importado neste semestre. Nada foi duplicado.
              </Notice>
            )}
            {version !== undefined && (
              <VersionOverview
                version={version}
                affectedNames={rowsBatch?.affectedNames ?? []}
                active={versionView}
                onSelect={setVersionView}
              />
            )}
            <BatchCounts summary={batch.summary} spaces={targets.spaces} />
            <details
              className="grid gap-3 rounded-xl border bg-surface-2 p-3"
              onToggle={(event) => setReviewRowsOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer font-medium">Revisar linhas do lote</summary>
              <p className="text-sm text-muted-foreground">
                Filtre por estado, motivo ou busque aula, turma e sala. Use “Pendente” para revisar
                o que pode ser aplicado, “Duração sem datas no semestre” para ajustar o calendário
                do semestre e os filtros de conflito para conferir sobreposições.
              </p>
              {reviewRowsOpen && (
                <BatchRows
                  batchId={batch.id}
                  load={loadImportRows}
                  refreshKey={refreshKey}
                  view={versionView}
                  onBatchLoaded={setRowsBatch}
                />
              )}
            </details>
          </div>
        )}
      </Step>

      {batch !== null && (
        <Step number={5} title="Aplicação" hidden={activeStep !== 5}>
          {readyToApply ? (
            <>
              {version === undefined ? (
                pendingCount === 0 ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Nenhuma ocupação está pendente para aplicação. Confira os motivos de não
                    aplicabilidade na etapa de conferência; o sistema não gravará uma importação
                    vazia.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Cria as ocupações das {pendingCount} linhas pendentes. Conflitos e linhas não
                    aplicáveis não são gravados. Se for interrompido, aplique de novo: continua de
                    onde parou, sem duplicar.
                  </p>
                )
              ) : (
                <div className="grid gap-1 text-sm">
                  <p>{applySentence(batch.summary.counts)}</p>
                  <p className="text-muted-foreground">
                    Alterações bloqueadas e conflitos não são gravados. A versão anterior é
                    preservada: nada é apagado, só cancelado. Se for interrompido, aplique de novo:
                    continua de onde parou, sem duplicar.
                  </p>
                </div>
              )}
              <Button
                className="justify-self-start"
                onClick={apply}
                disabled={busy || pendingCount === 0}
              >
                {version !== undefined
                  ? "Aplicar mudanças"
                  : batch.status === "rascunho"
                    ? "Aplicar importação"
                    : "Continuar aplicação"}
              </Button>
            </>
          ) : version === undefined ? (
            <p>
              Importação concluída: <strong>{batch.summary.counts.aplicada}</strong> ocupações
              criadas.
            </p>
          ) : (
            <div className="grid gap-2">
              <p>Nova versão aplicada.</p>
              <VersionResult counts={batch.summary.counts} />
            </div>
          )}
          {progress !== null && progress.label === "Aplicando" && (
            <ProgressBar label={progress.label} done={progress.done} total={progress.total} />
          )}
          {failure !== null && progress === null && (
            <FailureBox
              failure={failure}
              semesterId={semesterId}
              disabled={busy}
              onResume={resumeOther}
              onCleared={clearFailure}
            />
          )}
        </Step>
      )}

      {batch !== null && activeStep === 5 && (
        <section className="mt-8 grid gap-3" aria-labelledby="resultado">
          <h2 id="resultado" className="text-lg font-semibold tracking-tight">
            Resultado por linha
          </h2>
          <BatchRows
            batchId={batch.id}
            load={loadImportRows}
            refreshKey={refreshKey}
            view={versionView}
            onBatchLoaded={setRowsBatch}
          />
          <Link
            to="/importar/lotes/$id"
            params={{ id: batch.id }}
            className="justify-self-start text-sm font-medium text-accent-text underline"
          >
            Abrir esta página do lote
          </Link>
        </section>
      )}
    </>
  );
}
