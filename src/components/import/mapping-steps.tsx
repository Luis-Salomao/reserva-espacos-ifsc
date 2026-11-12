import { useEffect, useId, useState } from "react";
import type { RoomSuggestion, TeacherSuggestion } from "#/application/import-mappings";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { DataTable, TABLE } from "#/components/ds";
import { Card } from "#/components/page";
import { Button } from "#/components/ui/button";
import {
  createImportSpaceFn,
  saveRoomMappingsFn,
  saveTeacherMappingsFn,
} from "#/server/import-fns";
import {
  CREATE_VALUE,
  IGNORE_VALUE,
  PLACEHOLDER_VALUE,
  roomChoiceOf,
  roomMappingsToSave,
  roomsToCreate,
  spaceValue,
  teacherChoiceOf,
  teacherMappingsToSave,
  userValue,
} from "./flow-helpers";

const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring outline-none";

type RoomFilter = "todas" | "pendentes" | "sugestoes" | "salvas";

type Space = { id: string; name: string };
type Account = { id: string; name: string; code: string | null };

type RoomProps = {
  rooms: ReadonlyArray<{
    id: string;
    short: string;
    name: string;
    slotCount: number;
    slots: unknown[];
  }>;
  suggestions: readonly RoomSuggestion[];
  spaces: readonly Space[];
  initialChoices?: Record<string, string>;
  onSpacesCreated: (created: Space[]) => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onChoicesChange?: (choices: Record<string, string>) => void;
};

function baselineOf(suggestions: readonly RoomSuggestion[]): Record<string, string> {
  const baseline: Record<string, string> = {};
  for (const item of suggestions) {
    baseline[item.sourceId] =
      item.saved === null ? "" : roomChoiceOf({ ...item, suggestion: null });
  }
  return baseline;
}

function sameChoices(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

/**
 * Passo 2: de-para de salas. Cada sala do arquivo vai para um espaço existente, para um espaço
 * novo com o mesmo nome ou é ignorada. Vínculos salvos e sugestões vêm pré-preenchidos, mas só
 * valem depois de "Salvar vínculos"; sala sem escolha deixa as aulas não aplicáveis.
 */
export function RoomMappingStep({
  rooms,
  suggestions,
  spaces,
  initialChoices,
  onSpacesCreated,
  onSaved,
  onDirtyChange,
  onChoicesChange,
}: RoomProps) {
  const uid = useId();
  const [baseline, setBaseline] = useState(() => baselineOf(suggestions));
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      suggestions.map((item) => [
        item.sourceId,
        initialChoices?.[item.sourceId] ?? roomChoiceOf(item),
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<RoomFilter>("todas");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const dirty = !sameChoices(choices, baseline);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onChoicesChange?.(choices), [choices, onChoicesChange]);

  async function save() {
    setPending(true);
    setMessage(null);
    const current = { ...choices };
    const created = new Map<string, string>();
    const newSpaces: Space[] = [];
    for (const item of roomsToCreate(rooms, current)) {
      const result = await runAdminAction(() => createImportSpaceFn({ data: { name: item.name } }));
      if (!result.ok) {
        const text =
          result.status === 409
            ? `Já existe um espaço chamado “${item.name}”. Escolha-o na lista em vez de criar.`
            : result.message;
        if (newSpaces.length > 0) onSpacesCreated(newSpaces);
        setChoices(current);
        setMessage({ kind: "error", text });
        setPending(false);
        return;
      }
      created.set(item.sourceId, result.data.id);
      newSpaces.push(result.data);
      current[item.sourceId] = spaceValue(result.data.id);
    }
    if (newSpaces.length > 0) onSpacesCreated(newSpaces);
    const items = roomMappingsToSave(rooms, current, created);
    const saved = await runAdminAction(() => saveRoomMappingsFn({ data: { items } }));
    setPending(false);
    setChoices(current);
    if (!saved.ok) {
      setMessage({ kind: "error", text: saved.message });
      return;
    }
    setBaseline(current);
    setMessage({ kind: "ok", text: "Vínculos de salas salvos." });
    onSaved();
  }

  const origins = new Map(
    suggestions.map((item) => [
      item.sourceId,
      item.saved === null ? item.suggestion?.origin : undefined,
    ]),
  );
  const suggestionById = new Map(suggestions.map((item) => [item.sourceId, item]));
  const statusOf = (roomId: string) => {
    const choice = choices[roomId] ?? "";
    if (choice === "") return "pendentes" as const;
    if (choice === IGNORE_VALUE || choice === CREATE_VALUE) return "outra" as const;
    if (baseline[roomId] === choice) return "salvas" as const;
    const item = suggestionById.get(roomId);
    return item?.saved === null && item?.suggestion !== null && choice === roomChoiceOf(item)
      ? ("sugestoes" as const)
      : ("outra" as const);
  };
  const counts = {
    todas: rooms.length,
    pendentes: rooms.filter((room) => statusOf(room.id) === "pendentes").length,
    sugestoes: rooms.filter((room) => statusOf(room.id) === "sugestoes").length,
    salvas: rooms.filter((room) => statusOf(room.id) === "salvas").length,
  };
  const visibleRooms = rooms.filter((room) => filter === "todas" || statusOf(room.id) === filter);

  const destinationOf = (roomId: string): string => {
    const choice = choices[roomId] ?? "";
    if (choice === "") return "Sem vínculo";
    if (choice === IGNORE_VALUE) return "Ignorar esta sala";
    if (choice === CREATE_VALUE) {
      const room = rooms.find((item) => item.id === roomId);
      return `Criar espaço: ${room?.name || room?.short || "sala"}`;
    }
    const id = choice.startsWith("space:") ? choice.slice("space:".length) : "";
    return spaces.find((space) => space.id === id)?.name ?? "Espaço selecionado";
  };

  const statusLabelOf = (roomId: string): string => {
    const status = statusOf(roomId);
    if (status === "pendentes") return "Sem vínculo: os horários não serão aplicáveis";
    if (status === "sugestoes") return "Sugestão: confirme salvando";
    if (status === "salvas") return "Vínculo salvo";
    const choice = choices[roomId] ?? "";
    if (choice === IGNORE_VALUE) return "Ignorada: os horários não serão aplicáveis";
    if (choice === CREATE_VALUE) return "Novo espaço: salve para criar";
    return "Alteração não salva";
  };

  return (
    <div className="grid gap-3">
      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <legend className="sr-only">Resumo dos vínculos de salas</legend>
        {(
          [
            ["Todas", counts.todas, "todas"],
            ["Sem vínculo", counts.pendentes, "pendentes"],
            ["Sugestões", counts.sugestoes, "sugestoes"],
            ["Vínculos salvos", counts.salvas, "salvas"],
          ] as const
        ).map(([label, count, value]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-xl border p-2 text-left focus-visible:ring-[3px] focus-visible:ring-ring ${
              filter === value ? "border-primary bg-occ-imported" : "bg-surface-2"
            }`}
          >
            <span className="block text-xs text-muted-foreground">{label}</span>
            <span className="text-lg font-semibold">{count}</span>
          </button>
        ))}
      </fieldset>
      <p className="text-sm text-muted-foreground">
        A sala do XML só vira ocupação do IFSC depois que o destino é salvo. Sugestões precisam de
        confirmação; “Sem vínculo” e “Ignorar” deixam os horários não aplicáveis. A contagem inclui
        aulas que listam mais de uma sala.
      </p>
      <DataTable label="Vínculos das salas do arquivo">
        <table className={TABLE.table}>
          <caption className="sr-only">Vínculos das salas do arquivo</caption>
          <thead>
            <tr className={TABLE.head}>
              <th scope="col" className={TABLE.th}>
                Sala no XML
              </th>
              <th scope="col" className={TABLE.th}>
                Ocorrências no XML
              </th>
              <th scope="col" className={TABLE.th}>
                Espaço do IFSC
              </th>
              <th scope="col" className={TABLE.th}>
                Situação
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRooms.map((room) => {
              const id = `${uid}-${room.id}`;
              const origin = origins.get(room.id);
              return (
                <tr key={room.id} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {room.short}
                    {room.name && room.name !== room.short && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {room.name}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2 text-sm">
                    {room.slotCount} {room.slotCount === 1 ? "ocorrência" : "ocorrências"}
                  </td>
                  <td className="min-w-56 px-3 py-2">
                    <label htmlFor={id} className="sr-only">
                      Espaço do IFSC para {room.short}
                    </label>
                    <select
                      id={id}
                      value={choices[room.id] ?? ""}
                      disabled={pending}
                      onChange={(event) =>
                        setChoices({ ...choices, [room.id]: event.target.value })
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="">Sem vínculo</option>
                      <option value={CREATE_VALUE}>Criar espaço com este nome</option>
                      <option value={IGNORE_VALUE}>Ignorar esta sala</option>
                      <optgroup label="Espaços existentes">
                        {spaces.map((space) => (
                          <option key={space.id} value={spaceValue(space.id)}>
                            {space.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {destinationOf(room.id)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {statusLabelOf(room.id)}
                    {origin !== undefined && statusOf(room.id) === "sugestoes" && (
                      <span className="block text-xs text-muted-foreground">
                        Sugestão por {origin}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>
      {visibleRooms.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma sala neste filtro.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={pending || !dirty}>
          {pending ? "Salvando…" : "Salvar vínculos de salas"}
        </Button>
        {dirty && !pending && (
          <span className="text-sm text-muted-foreground">Há alterações não salvas.</span>
        )}
      </div>
      {message !== null && (
        <p role={message.kind === "error" ? "alert" : "status"} className="text-sm">
          {message.text}
        </p>
      )}
    </div>
  );
}

type TeacherProps = {
  teachers: ReadonlyArray<{ id: string; short: string; name: string }>;
  suggestions: readonly TeacherSuggestion[];
  accounts: readonly Account[];
  initialChoices?: Record<string, string>;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onChoicesChange?: (choices: Record<string, string>) => void;
};

/**
 * Passo 3: de-para de docentes (sugestão pela sigla = código da conta; escolha manual; sem vínculo;
 * criar conta fantasma, que vem marcado para o docente sem vínculo salvo e sem sugestão).
 */
export function TeacherMappingStep({
  teachers,
  suggestions,
  accounts,
  initialChoices,
  onSaved,
  onDirtyChange,
  onChoicesChange,
}: TeacherProps) {
  const uid = useId();
  const [baseline, setBaseline] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      suggestions.map((item) => [
        item.sourceId,
        item.saved === null ? "" : teacherChoiceOf({ ...item, suggestion: null }),
      ]),
    ),
  );
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      suggestions.map((item) => [
        item.sourceId,
        initialChoices?.[item.sourceId] ?? teacherChoiceOf(item),
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const dirty = !sameChoices(choices, baseline);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onChoicesChange?.(choices), [choices, onChoicesChange]);

  async function save() {
    setPending(true);
    setMessage(null);
    const items = teacherMappingsToSave(teachers, choices);
    const result = await runAdminAction(() => saveTeacherMappingsFn({ data: { items } }));
    setPending(false);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.message });
      return;
    }
    setBaseline({ ...choices });
    setMessage({ kind: "ok", text: "Vínculos de docentes salvos." });
    onSaved();
  }

  if (teachers.length === 0) {
    return <p className="text-muted-foreground">O arquivo não tem docentes.</p>;
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {teachers.map((teacher) => {
          const id = `${uid}-${teacher.id}`;
          return (
            <li key={teacher.id}>
              <Card
                compact
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] sm:items-center shadow-none"
              >
                <label htmlFor={id} className="break-words font-medium">
                  {teacher.name && teacher.name !== teacher.short
                    ? `${teacher.name} (${teacher.short})`
                    : teacher.short}
                </label>
                <select
                  id={id}
                  value={choices[teacher.id] ?? ""}
                  onChange={(event) => setChoices({ ...choices, [teacher.id]: event.target.value })}
                  className={SELECT_CLASS}
                >
                  <option value={PLACEHOLDER_VALUE}>Criar conta fantasma</option>
                  <option value="">Sem vínculo (aula sem responsável)</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={userValue(account.id)}>
                      {account.name}
                      {account.code ? ` (${account.code})` : ""}
                    </option>
                  ))}
                </select>
              </Card>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={pending || !dirty}>
          {pending ? "Salvando…" : "Salvar vínculos de docentes"}
        </Button>
        {dirty && !pending && (
          <span className="text-sm text-muted-foreground">Há alterações não salvas.</span>
        )}
      </div>
      {message !== null && (
        <p role={message.kind === "error" ? "alert" : "status"} className="text-sm">
          {message.text}
        </p>
      )}
    </div>
  );
}
