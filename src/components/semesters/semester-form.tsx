import { useRouter } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { FieldError } from "#/components/admin/field-error";
import {
  fieldError,
  generalError,
  runAdminAction,
  useFocusInvalidField,
} from "#/components/admin/use-admin-action";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  blocksFromPeriods,
  MAX_BLOCK_NAME,
  MAX_BLOCK_SHORT,
  MAX_BLOCKS,
  MAX_TERM_POSITION,
  type Semester,
} from "#/domain/semester";
import { createSemesterFn, updateSemesterFn } from "#/server/admin";
import type { AdminResponse } from "#/server/admin-actions";
import type { PreviewImportResult } from "#/server/import-preview";

type BlockDraft = {
  key: number;
  number: string;
  name: string;
  short: string;
  start: string;
  end: string;
};
type TermDraft = { start: string; end: string };

const POSITIONS = Array.from({ length: MAX_TERM_POSITION }, (_, index) => index + 1);
const XML_ERROR = "Não foi possível ler o arquivo. Tente novamente em instantes.";

let nextKey = 0;
function newKey(): number {
  nextKey += 1;
  return nextKey;
}

function toBlockDrafts(blocks: Semester["blocks"]): BlockDraft[] {
  return blocks.map((block) => ({
    key: newKey(),
    number: String(block.number),
    name: block.name,
    short: block.short,
    start: block.start,
    end: block.end,
  }));
}

function toTermDrafts(terms: Semester["terms"]): TermDraft[] {
  return POSITIONS.map((position) => {
    const term = terms.find((candidate) => candidate.position === position);
    return { start: term?.start ?? "", end: term?.end ?? "" };
  });
}

type FieldProps = {
  id: string;
  label: string;
  error: string | undefined;
  children: (props: {
    id: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  }) => ReactNode;
};

/** Campo com rótulo e erro anunciado, ligado ao controle por `aria-describedby`. */
function Field({ id, label, error, children }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-invalid": error === undefined ? undefined : true,
        "aria-describedby": error === undefined ? undefined : errorId,
      })}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

type XmlLoaderProps = { onBlocks: (blocks: Semester["blocks"]) => void };

/** "Usar blocos do XML": envia o XML à prévia existente e só preenche o formulário. */
function XmlLoader({ onBlocks }: XmlLoaderProps) {
  const uid = useId();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function load(file: File) {
    setPending(true);
    setStatus(null);
    try {
      // O corpo é o próprio XML, como em /importar.
      const response = await fetch("/api/import-preview", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: file,
      });
      const result = (await response.json()) as PreviewImportResult;
      if (!result.ok) {
        setStatus({ ok: false, message: result.message });
      } else if (result.preview.periods.length === 0) {
        setStatus({ ok: false, message: "O arquivo não tem blocos de horário (períodos)." });
      } else {
        const blocks = blocksFromPeriods(result.preview.periods);
        onBlocks(blocks);
        setStatus({
          ok: true,
          message: `${blocks.length} blocos carregados do arquivo. Revise e clique em Salvar para gravar.`,
        });
      }
    } catch {
      setStatus({ ok: false, message: XML_ERROR });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border bg-surface-2 p-3">
      <Label htmlFor={`${uid}-xml`}>Usar blocos do XML (opcional)</Label>
      <Input
        id={`${uid}-xml`}
        type="file"
        accept=".xml,text/xml,application/xml"
        disabled={pending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void load(file);
        }}
      />
      <p className="text-sm text-muted-foreground">
        Preenche os blocos abaixo com os períodos do arquivo. Nada é salvo até clicar em Salvar.
      </p>
      {pending && <p role="status">Lendo o arquivo…</p>}
      {status !== null && (
        <p role={status.ok ? "status" : "alert"} className="text-sm">
          {status.message}
        </p>
      )}
    </div>
  );
}

type Props = { semester: Semester | null; onSaved?: (semester: Semester) => void };

export function SemesterForm({ semester, onSaved }: Props) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(semester?.name ?? "");
  const [start, setStart] = useState(semester?.start ?? "");
  const [end, setEnd] = useState(semester?.end ?? "");
  const [terms, setTerms] = useState<TermDraft[]>(toTermDrafts(semester?.terms ?? []));
  const [blocks, setBlocks] = useState<BlockDraft[]>(toBlockDrafts(semester?.blocks ?? []));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<Semester> | null>(null);
  const [saved, setSaved] = useState(false);
  useFocusInvalidField(result, uid);

  function changeTerm(index: number, patch: Partial<TermDraft>) {
    setTerms(terms.map((term, i) => (i === index ? { ...term, ...patch } : term)));
  }

  function changeBlock(key: number, patch: Partial<BlockDraft>) {
    setBlocks(blocks.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  }

  function addBlock() {
    const last = blocks[blocks.length - 1];
    const number = last === undefined ? 1 : (Number.parseInt(last.number, 10) || 0) + 1;
    setBlocks([
      ...blocks,
      { key: newKey(), number: String(number), name: "", short: "", start: "", end: "" },
    ]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    const data = {
      name,
      start,
      end,
      terms: terms.map((term, index) => ({ position: index + 1, ...term })),
      blocks: blocks.map(({ key: _key, ...block }) => block),
    };
    const response = await runAdminAction(() =>
      semester === null
        ? createSemesterFn({ data })
        : updateSemesterFn({ data: { id: semester.id, ...data } }),
    );
    setPending(false);
    setResult(response);
    if (!response.ok) return;
    setSaved(true);
    if (semester === null) {
      setName("");
      setStart("");
      setEnd("");
      setTerms(toTermDrafts([]));
      setBlocks([]);
    } else {
      setTerms(toTermDrafts(response.data.terms));
      setBlocks(toBlockDrafts(response.data.blocks));
    }
    await router.invalidate();
    onSaved?.(response.data);
  }

  const general = generalError(result);
  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {general !== undefined && (
        <p role="alert" className="rounded-lg border bg-occ-conflict p-3 text-sm">
          {general}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-lg border bg-surface-2 p-3 text-sm">
          Semestre salvo.
        </p>
      )}

      <Field id={`${uid}-name`} label="Nome" error={fieldError(result, "name")}>
        {(props) => (
          <Input
            {...props}
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-base font-semibold">Vigência</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${uid}-start`} label="Início" error={fieldError(result, "start")}>
            {(props) => (
              <Input
                {...props}
                type="date"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            )}
          </Field>
          <Field id={`${uid}-end`} label="Fim" error={fieldError(result, "end")}>
            {(props) => (
              <Input
                {...props}
                type="date"
                required
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-base font-semibold">Durações do aSc (opcional)</legend>
        <div id={`${uid}-terms`} tabIndex={-1} className="grid gap-3 outline-none">
          <p className="text-sm text-muted-foreground">
            Datas de cada duração, dentro da vigência. Deixe em branco as que não se aplicam; elas
            podem se sobrepor.
          </p>
          <FieldError id={`${uid}-terms-error`} message={fieldError(result, "terms")} />
          {POSITIONS.map((position) => {
            const term = terms[position - 1] ?? { start: "", end: "" };
            return (
              <div key={position} className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr] sm:items-start">
                <p className="pt-2 text-sm font-medium">Duração {position}</p>
                <Field
                  id={`${uid}-term-${position}-start`}
                  label={`Início da duração ${position}`}
                  error={fieldError(result, `term-${position}-start`)}
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="date"
                      value={term.start}
                      onChange={(event) => changeTerm(position - 1, { start: event.target.value })}
                    />
                  )}
                </Field>
                <Field
                  id={`${uid}-term-${position}-end`}
                  label={`Fim da duração ${position}`}
                  error={fieldError(result, `term-${position}-end`)}
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="date"
                      value={term.end}
                      onChange={(event) => changeTerm(position - 1, { end: event.target.value })}
                    />
                  )}
                </Field>
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-base font-semibold">Blocos de horário</legend>
        <XmlLoader onBlocks={(loaded) => setBlocks(toBlockDrafts(loaded))} />
        <FieldError id={`${uid}-blocks-error`} message={fieldError(result, "blocks")} />
        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum bloco configurado.</p>
        )}
        <ul className="grid gap-3">
          {blocks.map((block, index) => (
            <li key={block.key} className="grid gap-3 rounded-lg border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Bloco {index + 1}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Remover bloco ${index + 1}`}
                  onClick={() => setBlocks(blocks.filter((other) => other.key !== block.key))}
                >
                  Remover
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id={`${uid}-block-${index}-number`}
                  label="Número"
                  error={fieldError(result, `block-${index}-number`)}
                >
                  {(props) => (
                    <Input
                      {...props}
                      inputMode="numeric"
                      value={block.number}
                      onChange={(event) => changeBlock(block.key, { number: event.target.value })}
                    />
                  )}
                </Field>
                <Field
                  id={`${uid}-block-${index}-short`}
                  label="Sigla"
                  error={fieldError(result, `block-${index}-short`)}
                >
                  {(props) => (
                    <Input
                      {...props}
                      maxLength={MAX_BLOCK_SHORT}
                      value={block.short}
                      onChange={(event) => changeBlock(block.key, { short: event.target.value })}
                    />
                  )}
                </Field>
              </div>
              <Field
                id={`${uid}-block-${index}-name`}
                label="Nome"
                error={fieldError(result, `block-${index}-name`)}
              >
                {(props) => (
                  <Input
                    {...props}
                    maxLength={MAX_BLOCK_NAME}
                    value={block.name}
                    onChange={(event) => changeBlock(block.key, { name: event.target.value })}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id={`${uid}-block-${index}-start`}
                  label="Início"
                  error={fieldError(result, `block-${index}-start`)}
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="time"
                      value={block.start}
                      onChange={(event) => changeBlock(block.key, { start: event.target.value })}
                    />
                  )}
                </Field>
                <Field
                  id={`${uid}-block-${index}-end`}
                  label="Fim"
                  error={fieldError(result, `block-${index}-end`)}
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="time"
                      value={block.end}
                      onChange={(event) => changeBlock(block.key, { end: event.target.value })}
                    />
                  )}
                </Field>
              </div>
            </li>
          ))}
        </ul>
        <Button
          id={`${uid}-blocks`}
          type="button"
          size="sm"
          variant="outline"
          disabled={blocks.length >= MAX_BLOCKS}
          onClick={addBlock}
          className="justify-self-start"
        >
          Adicionar bloco
        </Button>
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:justify-self-start">
        {pending ? "Salvando…" : semester === null ? "Criar semestre" : "Salvar"}
      </Button>
    </form>
  );
}
