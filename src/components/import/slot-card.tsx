import type { SlotView } from "#/server/import-preview-view";
import { SLOT_STATUS_LABEL } from "./weekdays";

/** Bloco de um horário importado: cor de ocupação importada e sempre com texto. */
export function SlotCard({ slot, showRooms = false }: { slot: SlotView; showRooms?: boolean }) {
  return (
    <div className="min-w-0 break-words rounded-[10px] border-l-4 border-line-imported bg-occ-imported px-2.5 py-1.5 text-sm text-foreground">
      <p className="font-medium">{slot.subject}</p>
      <p>
        {slot.start}–{slot.end}
      </p>
      {slot.classes !== "" && <p>Turma: {slot.classes}</p>}
      {slot.teachers !== "" && <p>Docente: {slot.teachers}</p>}
      {showRooms && slot.rooms.length > 0 && <p>Salas: {slot.rooms.join(", ")}</p>}
      <p className="text-xs">
        {SLOT_STATUS_LABEL[slot.status]} · {slot.termsLabel}
      </p>
    </div>
  );
}
