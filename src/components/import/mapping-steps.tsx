import { useEffect, useId, useState } from "react";
import type { RoomSuggestion, TeacherSuggestion } from "#/application/import-mappings";
import { runAdminAction } from "#/components/admin/use-admin-action";
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

type Space = { id: string; name: string };
type Account = { id: string; name: string; code: string | null };

type RoomProps = {
  rooms: ReadonlyArray<{ id: string; short: string; name: string; slots: unknown[] }>;
  suggestions: readonly RoomSuggestion[];
  spaces: readonly Space[];
  onSpacesCreated: (created: Space[]) => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
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
  onSpacesCreated,
  onSaved,
  onDirtyChange,
}: RoomProps) {
  const uid = useId();
  const [baseline, setBaseline] = useState(() => baselineOf(suggestions));
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(suggestions.map((item) => [item.sourceId, roomChoiceOf(item)])),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const dirty = !sameChoices(choices, baseline);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

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

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {rooms.map((room) => {
          const id = `${uid}-${room.id}`;
          const origin = origins.get(room.id);
          return (
            <li key={room.id}>
              <Card
                compact
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] sm:items-center shadow-none"
              >
                <label htmlFor={id} className="grid min-w-0 gap-0.5">
                  <span className="break-words font-medium">
                    {room.short}
                    {room.name && room.name !== room.short ? ` – ${room.name}` : ""}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {room.slots.length} {room.slots.length === 1 ? "horário" : "horários"}
                    {origin !== undefined && choices[room.id] !== "" && baseline[room.id] === ""
                      ? " · sugestão, confirme salvando"
                      : ""}
                  </span>
                </label>
                <select
                  id={id}
                  value={choices[room.id] ?? ""}
                  onChange={(event) => setChoices({ ...choices, [room.id]: event.target.value })}
                  className={SELECT_CLASS}
                >
                  <option value="">Sem vínculo (aulas não aplicáveis)</option>
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
              </Card>
            </li>
          );
        })}
      </ul>
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
  teachers: ReadonlyArray<{ id: string; short: string }>;
  suggestions: readonly TeacherSuggestion[];
  accounts: readonly Account[];
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

/** Passo 3: de-para de docentes (sugestão pela sigla = código da conta; escolha manual; sem vínculo). */
export function TeacherMappingStep({
  teachers,
  suggestions,
  accounts,
  onSaved,
  onDirtyChange,
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
    Object.fromEntries(suggestions.map((item) => [item.sourceId, teacherChoiceOf(item)])),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const dirty = !sameChoices(choices, baseline);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

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
                  {teacher.short}
                </label>
                <select
                  id={id}
                  value={choices[teacher.id] ?? ""}
                  onChange={(event) => setChoices({ ...choices, [teacher.id]: event.target.value })}
                  className={SELECT_CLASS}
                >
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
