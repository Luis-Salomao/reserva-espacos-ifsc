import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { AppShell } from "#/components/app-shell";
import { ImportSummary } from "#/components/import/import-summary";
import { ImportUpload } from "#/components/import/import-upload";
import { OverlapList } from "#/components/import/overlap-list";
import { SlotList } from "#/components/import/slot-list";
import { TermsList } from "#/components/import/terms-list";
import { WarningList } from "#/components/import/warning-list";
import { WeeklyGrid } from "#/components/import/weekly-grid";
import { Label } from "#/components/ui/label";
import { previewImport } from "#/server/import-preview";
import type { PreviewView } from "#/server/import-preview-view";

export const Route = createFileRoute("/importar")({
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
  const room = view.rooms.find((candidate) => candidate.id === roomId);
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
      <Section title="Resumo">
        <ImportSummary view={view} />
      </Section>
      <Section title="Avisos">
        <WarningList warnings={view.warnings} />
      </Section>
      <Section title="Sobreposições internas">
        <OverlapList overlaps={view.overlaps} detail={view.overlapsDetail} />
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

  async function handleSubmit(file: File) {
    setPending(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("file", file);
      const result = await previewImport({ data });
      if (result.ok) setView(result.preview);
      else {
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
        Envie o XML exportado do aSc Horários para ver uma prévia. Nada é salvo nesta etapa.
      </p>
      <ImportUpload pending={pending} onSubmit={handleSubmit} />
      <div aria-live="polite" className="mt-4">
        {pending && <p>Processando o arquivo…</p>}
        {error !== null && (
          <p role="alert" className="rounded-lg border bg-occ-conflict p-4">
            {error}
          </p>
        )}
      </div>
      {view !== null && <PreviewResult view={view} />}
    </AppShell>
  );
}
