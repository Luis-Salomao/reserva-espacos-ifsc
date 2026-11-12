import type { QueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "#/components/app-shell";
import { ImportFlow } from "#/components/import/import-flow";
import { ImportSummary } from "#/components/import/import-summary";
import { ImportUpload } from "#/components/import/import-upload";
import { OverlapList } from "#/components/import/overlap-list";
import { RoomScheduleOverview } from "#/components/import/room-schedule-overview";
import { ImportRoomsOverview } from "#/components/import/rooms-overview";
import { SlotList } from "#/components/import/slot-list";
import { TermsList } from "#/components/import/terms-list";
import { WarningList } from "#/components/import/warning-list";
import { WeeklyGrid } from "#/components/import/weekly-grid";
import { Notice, PageHeader, PageSection } from "#/components/page";
import { Label } from "#/components/ui/label";
import type { PreviewImportResult } from "#/server/import-preview";
import type { PreviewView } from "#/server/import-preview-view";

export const Route = createFileRoute("/importar/")({
  component: ImportPage,
});

const SEND_ERROR = "Não foi possível enviar o arquivo. Tente novamente em instantes.";
const IMPORT_DRAFT_KEY = ["import-session", "draft"] as const;

type ImportDraftCache = { view: PreviewView; file: File; runId: number };

function RoomGrid({ view }: { view: PreviewView }) {
  const [roomId, setRoomId] = useState(view.rooms[0]?.id ?? "");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const room = view.rooms.find((candidate) => candidate.id === roomId) ?? view.rooms[0];
  if (room === undefined) {
    return <p className="text-muted-foreground">Nenhuma sala encontrada no arquivo.</p>;
  }
  return (
    <div className="grid gap-3">
      <ImportRoomsOverview
        rooms={view.rooms}
        overlaps={view.overlapsDetail}
        truncated={view.overlapsTruncated}
        onShowRoom={(id) => {
          setRoomId(id);
          setDetailsOpen(true);
        }}
      />
      <RoomScheduleOverview rooms={view.rooms} />
      <details
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        className="grid gap-3 rounded-xl border bg-surface-2 p-3"
      >
        <summary className="cursor-pointer font-medium">
          Grade detalhada por sala (opcional)
        </summary>
        <div className="grid gap-3">
          <div className="grid w-full min-w-0 max-w-xs gap-2">
            <Label htmlFor="room-select">Sala</Label>
            <select
              id="room-select"
              value={room.id}
              onChange={(event) => setRoomId(event.target.value)}
              className="h-10 w-full min-w-0 truncate rounded-lg border bg-background px-3 text-sm"
            >
              {view.rooms.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.short}
                  {candidate.name && candidate.name !== candidate.short
                    ? ` – ${candidate.name}`
                    : ""}{" "}
                  ({candidate.slots.length})
                </option>
              ))}
            </select>
          </div>
          <WeeklyGrid room={room} periods={view.periods} />
        </div>
      </details>
    </div>
  );
}

function PreviewResult({ view }: { view: PreviewView }) {
  return (
    <>
      {view.partial && (
        <Notice tone="error" role="alert" className="mt-4">
          Prévia parcial: o arquivo tem mais cards do que o limite, e só os primeiros foram lidos.
        </Notice>
      )}
      <PageSection title="Resumo">
        <ImportSummary view={view} />
      </PageSection>
      <PageSection title="Avisos">
        <WarningList warnings={view.warnings} />
      </PageSection>
      <PageSection title="Sobreposições internas">
        <OverlapList
          overlaps={view.overlaps}
          detail={view.overlapsDetail}
          truncated={view.overlapsTruncated}
        />
      </PageSection>
      <PageSection title="Salas no arquivo">
        <RoomGrid view={view} />
      </PageSection>
      <PageSection title="Aulas sem sala">
        <SlotList slots={view.withoutRoom} empty="Nenhuma aula sem sala." />
      </PageSection>
      <PageSection title="Aulas com várias salas">
        <SlotList slots={view.multipleRooms} empty="Nenhuma aula com várias salas." />
      </PageSection>
      <PageSection title="Durações">
        <TermsList terms={view.termsUsed} />
      </PageSection>
    </>
  );
}

function ImportPage() {
  const { session, queryClient } = Route.useRouteContext();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cached = queryClient.getQueryData<ImportDraftCache>(IMPORT_DRAFT_KEY);
  const [view, setView] = useState<PreviewView | null>(cached?.view ?? null);
  const [file, setFile] = useState<File | null>(cached?.file ?? null);
  const [runId, setRunId] = useState(cached?.runId ?? 0);

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
        const nextRunId = runId + 1;
        const draft = { view: result.preview, file: upload, runId: nextRunId };
        queryClient.setQueryData(IMPORT_DRAFT_KEY, draft);
        queryClient.removeQueries({ queryKey: ["import-session", "flow"] });
        setView(result.preview);
        setFile(upload);
        setRunId(nextRunId);
      } else {
        queryClient.removeQueries({ queryKey: IMPORT_DRAFT_KEY, exact: true });
        setView(null);
        setFile(null);
        setError(result.message);
      }
    } catch {
      queryClient.removeQueries({ queryKey: IMPORT_DRAFT_KEY, exact: true });
      setView(null);
      setFile(null);
      setError(SEND_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell wide>
      <PageHeader
        title="Importar grade"
        description={
          <>
            Envie o XML exportado do aSc Horários para ver uma prévia. Nada é salvo nesta etapa; o
            arquivo não é guardado, só o resumo e o resultado de cada lote.{" "}
            <Link
              to="/importar/lotes"
              className="font-medium text-accent-text underline underline-offset-4"
            >
              Ver lotes anteriores
            </Link>
          </>
        }
      />
      <ImportUpload pending={pending} onSubmit={handleSubmit} />
      {error !== null && (
        <Notice tone="error" role="alert" className="mt-4">
          {error}
        </Notice>
      )}
      {view !== null && <PreviewResult view={view} />}
      {view !== null && file !== null && !view.partial && (
        <ImportFlow
          key={runId}
          view={view}
          file={file}
          timeZone={session.timeZone}
          sessionId={runId}
          queryClient={queryClient as QueryClient}
        />
      )}
    </AppShell>
  );
}
