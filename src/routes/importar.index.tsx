import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { AppShell } from "#/components/app-shell";
import { ImportFlow } from "#/components/import/import-flow";
import { ImportSummary } from "#/components/import/import-summary";
import { ImportUpload } from "#/components/import/import-upload";
import { OverlapList } from "#/components/import/overlap-list";
import { SlotList } from "#/components/import/slot-list";
import { TermsList } from "#/components/import/terms-list";
import { WarningList } from "#/components/import/warning-list";
import { WeeklyGrid } from "#/components/import/weekly-grid";
import { Label } from "#/components/ui/label";
import type { PreviewImportResult } from "#/server/import-preview";
import type { PreviewView } from "#/server/import-preview-view";

export const Route = createFileRoute("/importar/")({
  component: ImportPage,
});

const SEND_ERROR = "Não foi possível enviar o arquivo. Tente novamente em instantes.";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 grid gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function RoomGrid({ view }: { view: PreviewView }) {
  const [roomId, setRoomId] = useState(view.rooms[0]?.id ?? "");
  const room = view.rooms.find((candidate) => candidate.id === roomId) ?? view.rooms[0];
  if (room === undefined) {
    return <p className="text-muted-foreground">Nenhuma sala encontrada no arquivo.</p>;
  }
  return (
    <div className="grid gap-3">
      <div className="grid w-full min-w-0 max-w-xs gap-2">
        <Label htmlFor="room-select">Sala</Label>
        <select
          id="room-select"
          value={room.id}
          onChange={(event) => setRoomId(event.target.value)}
          className="h-9 w-full min-w-0 truncate rounded-md border bg-background px-3 text-sm"
        >
          {view.rooms.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.short}
              {candidate.name && candidate.name !== candidate.short ? ` – ${candidate.name}` : ""} (
              {candidate.slots.length})
            </option>
          ))}
        </select>
      </div>
      <WeeklyGrid room={room} periods={view.periods} />
    </div>
  );
}

function PreviewResult({ view }: { view: PreviewView }) {
  return (
    <>
      {view.partial && (
        <p role="alert" className="mt-4 rounded-lg border bg-occ-conflict p-4">
          Prévia parcial: o arquivo tem mais cards do que o limite, e só os primeiros foram lidos.
        </p>
      )}
      <Section title="Resumo">
        <ImportSummary view={view} />
      </Section>
      <Section title="Avisos">
        <WarningList warnings={view.warnings} />
      </Section>
      <Section title="Sobreposições internas">
        <OverlapList
          overlaps={view.overlaps}
          detail={view.overlapsDetail}
          truncated={view.overlapsTruncated}
        />
      </Section>
      <Section title="Grade por sala">
        <RoomGrid view={view} />
      </Section>
      <Section title="Aulas sem sala">
        <SlotList slots={view.withoutRoom} empty="Nenhuma aula sem sala." />
      </Section>
      <Section title="Aulas com várias salas">
        <SlotList slots={view.multipleRooms} empty="Nenhuma aula com várias salas." />
      </Section>
      <Section title="Durações">
        <TermsList terms={view.termsUsed} />
      </Section>
    </>
  );
}

function ImportPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PreviewView | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [runId, setRunId] = useState(0);
  const { session } = Route.useRouteContext();

  async function handleSubmit(upload: File) {
    setPending(true);
    setError(null);
    try {
      // O corpo é o próprio XML: o servidor confere o tamanho antes de ler o conteúdo.
      const response = await fetch("/api/import-preview", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: upload,
      });
      const result = (await response.json()) as PreviewImportResult;
      if (result.ok) {
        setView(result.preview);
        setFile(upload);
        setRunId((id) => id + 1);
      } else {
        setView(null);
        setError(result.message);
      }
    } catch {
      setView(null);
      setError(SEND_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell wide>
      <h1 className="text-2xl font-semibold">Importar grade</h1>
      <p className="mt-1 mb-4 text-muted-foreground">
        Envie o XML exportado do aSc Horários para ver uma prévia. Nada é salvo nesta etapa; o
        arquivo não é guardado, só o resumo e o resultado de cada lote.{" "}
        <Link to="/importar/lotes" className="font-medium text-accent-text underline">
          Ver lotes anteriores
        </Link>
      </p>
      <ImportUpload pending={pending} onSubmit={handleSubmit} />
      {error !== null && (
        <p role="alert" className="mt-4 rounded-lg border bg-occ-conflict p-4">
          {error}
        </p>
      )}
      {view !== null && <PreviewResult view={view} />}
      {view !== null && file !== null && !view.partial && (
        <ImportFlow key={runId} view={view} file={file} timeZone={session.timeZone} />
      )}
    </AppShell>
  );
}
