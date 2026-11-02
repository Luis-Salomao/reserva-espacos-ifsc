import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { PrepareOutput, StepOutput } from "#/application/import-apply";
import type { RoomSuggestion, TeacherSuggestion } from "#/application/import-mappings";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { type ImportBatch, pendingTotal } from "#/domain/import-batch";
import type { AdminResponse } from "#/server/admin-actions";
import type { ImportTargets } from "#/server/import-flow";
import { applyImportBatchFn, getImportTargetsFn, suggestMappingsFn } from "#/server/import-fns";
import type { PreviewView } from "#/server/import-preview-view";
import { BatchCounts } from "./batch-counts";
import { BatchRows } from "./batch-rows";
import { BATCH_STATUS_LABELS, formatDate, termsWithoutDates } from "./flow-helpers";
import { loadImportRows } from "./load-rows";
import { RoomMappingStep, TeacherMappingStep } from "./mapping-steps";
import { runSteps, type StepResponse } from "./run-steps";

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

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-8 grid gap-3" aria-labelledby={`passo-${number}`}>
      <h2 id={`passo-${number}`} className="text-xl font-semibold">
        <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
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
    <div role="alert" className="grid gap-2 rounded-lg border bg-occ-conflict p-4">
      <p>{message}</p>
      {conflict && (
        <p className="text-sm">
          Outra operação mexeu neste lote ao mesmo tempo. Nada foi perdido: tente de novo.
        </p>
      )}
      <Button variant="outline" className="justify-self-start" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}

type Props = { view: PreviewView; file: File };

/**
 * Fluxo da importação depois da prévia: semestre, de-para de salas e docentes, conferência
 * (preparo em passos) e aplicação (em passos), terminando no resultado por linha.
 */
export function ImportFlow({ view, file }: Props) {
  const [targets, setTargets] = useState<ImportTargets | null>(null);
  const [suggestions, setSuggestions] = useState<{
    rooms: RoomSuggestion[];
    teachers: TeacherSuggestion[];
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState("");
  const [roomsDirty, setRoomsDirty] = useState(false);
  const [teachersDirty, setTeachersDirty] = useState(false);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [reused, setReused] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failure, setFailure] = useState<{
    message: string;
    conflict: boolean;
    again: () => void;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);
  // Ao sair da página, o laço de passos é interrompido (nada mais é chamado no servidor).
  useEffect(() => () => abort.current?.abort(), []);

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
    if (first !== undefined) setSemesterId((current) => current || first.id);
  }, [view]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const invalidate = useCallback(() => {
    setBatch(null);
    setProgress(null);
    setFailure(null);
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
    setBatch(outcome.last.batch);
    setReused(outcome.last.reused);
    setRefreshKey((key) => key + 1);
  }

  async function apply() {
    if (batch === null || running.current) return;
    running.current = true;
    const controller = new AbortController();
    abort.current = controller;
    const batchId = batch.id;
    setFailure(null);
    const total = pendingTotal(batch.summary.counts);
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
          setBatch(output.batch);
          setProgress({ label: "Aplicando", done: Math.max(total - output.remaining, 0), total });
        },
      },
    );
    running.current = false;
    if (controller.signal.aborted) return;
    setProgress(null);
    setRefreshKey((key) => key + 1);
    if (!outcome.ok) {
      if (outcome.last !== null) setBatch(outcome.last.batch);
      setFailure({ ...outcome.failure, again: () => void apply() });
    }
  }

  if (loadError !== null) {
    return (
      <div role="alert" className="mt-8 grid gap-2 rounded-lg border bg-occ-conflict p-4">
        <p>{loadError}</p>
        <Button variant="outline" className="justify-self-start" onClick={() => void loadTargets()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  if (targets === null || suggestions === null) {
    return <p className="mt-8 text-muted-foreground">Carregando semestres e vínculos…</p>;
  }

  const readyToApply =
    batch !== null && batch.status !== "aplicado" && batch.status !== "preparando";
  const pendingCount = batch === null ? 0 : pendingTotal(batch.summary.counts);

  return (
    <>
      <Step number={1} title="Semestre">
        {targets.semesters.length === 0 ? (
          <p>
            Ainda não há semestres.{" "}
            <Link to="/semestres" className="font-medium text-accent-text underline">
              Cadastre um semestre
            </Link>{" "}
            com as datas das durações e volte aqui.
          </p>
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
              className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring outline-none"
            >
              {targets.semesters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({formatDate(item.start)} a {formatDate(item.end)})
                </option>
              ))}
            </select>
          </div>
        )}
        {semester !== undefined && missing !== null && missing.positions.length > 0 && (
          <div role="alert" className="grid gap-1 rounded-lg border bg-occ-conflict p-4">
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
          </div>
        )}
      </Step>

      <Step number={2} title="Salas">
        <p className="text-sm text-muted-foreground">
          Escolha o espaço de cada sala do arquivo. Sala sem vínculo deixa suas aulas não
          aplicáveis; nada é inventado.
        </p>
        <RoomMappingStep
          rooms={view.rooms}
          suggestions={suggestions.rooms}
          spaces={targets.spaces}
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

      <Step number={3} title="Docentes">
        <p className="text-sm text-muted-foreground">
          O responsável pela ocupação é a conta do primeiro docente da aula que tiver vínculo. A
          sugestão usa a sigla do docente igual ao código da conta.
        </p>
        <TeacherMappingStep
          teachers={view.teachers}
          suggestions={suggestions.teachers}
          accounts={targets.accounts}
          onSaved={invalidate}
          onDirtyChange={setTeachersDirty}
        />
      </Step>

      <Step number={4} title="Conferência">
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
        {progress !== null && progress.label === "Preparando" && (
          <ProgressBar label={progress.label} done={progress.done} total={progress.total} />
        )}
        {failure !== null && progress === null && batch === null && (
          <ErrorBox message={failure.message} conflict={failure.conflict} onRetry={failure.again} />
        )}
        {batch !== null && (
          <div className="grid gap-3">
            <p className="text-sm">
              Lote {batch.fileHash.slice(0, 8)} · {BATCH_STATUS_LABELS[batch.status]}
            </p>
            {reused && batch.status === "aplicado" && (
              <p role="status" className="rounded-lg border bg-occ-imported p-4">
                Este arquivo já foi importado neste semestre. Nada foi duplicado.
              </p>
            )}
            <BatchCounts summary={batch.summary} />
          </div>
        )}
      </Step>

      {batch !== null && (
        <Step number={5} title="Aplicação">
          {readyToApply ? (
            <>
              <p className="text-sm text-muted-foreground">
                Cria as ocupações das {pendingCount} linhas pendentes. Conflitos e linhas não
                aplicáveis não são gravados. Se for interrompido, aplique de novo: continua de onde
                parou, sem duplicar.
              </p>
              <Button className="justify-self-start" onClick={() => void apply()} disabled={busy}>
                {batch.status === "rascunho" ? "Aplicar importação" : "Continuar aplicação"}
              </Button>
            </>
          ) : (
            <p>
              Importação concluída: <strong>{batch.summary.counts.aplicada}</strong> ocupações
              criadas.
            </p>
          )}
          {progress !== null && progress.label === "Aplicando" && (
            <ProgressBar label={progress.label} done={progress.done} total={progress.total} />
          )}
          {failure !== null && progress === null && (
            <ErrorBox
              message={failure.message}
              conflict={failure.conflict}
              onRetry={failure.again}
            />
          )}
        </Step>
      )}

      {batch !== null && (
        <section className="mt-8 grid gap-3" aria-labelledby="resultado">
          <h2 id="resultado" className="text-xl font-semibold">
            Resultado por linha
          </h2>
          <BatchRows batchId={batch.id} load={loadImportRows} refreshKey={refreshKey} />
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
