import { DoorClosed } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";

export type RoomSelectorProps = {
  spaces: Space[];
  selectedSpaceId: string;
  onSelectSpace: (spaceId: string) => void;
  variant: "vertical" | "chips";
};

export function RoomSelector({
  spaces,
  selectedSpaceId,
  onSelectSpace,
  variant,
}: RoomSelectorProps) {
  const activeChipRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll da sala selecionada no carrossel mobile
  useEffect(() => {
    if (variant === "chips" && activeChipRef.current) {
      void selectedSpaceId;
      activeChipRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [selectedSpaceId, variant]);

  if (variant === "vertical") {
    return (
      <div className="grid gap-px">
        {spaces.map((space) => {
          const isSelected = space.id === selectedSpaceId;
          return (
            <button
              key={space.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectSpace(space.id)}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
                isSelected
                  ? "bg-surface-2 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground",
              )}
            >
              <DoorClosed
                className={cn(
                  "size-3.5 shrink-0",
                  isSelected ? "text-foreground" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 truncate">{space.name}</span>
              {space.capacity !== null && (
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                  {space.capacity}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Mobile horizontal chip carousel
  return (
    <fieldset
      aria-label="Salas disponíveis"
      className="-mx-4 flex min-w-0 gap-2 border-0 m-0 overflow-x-auto px-4 py-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {spaces.map((space) => {
        const isSelected = space.id === selectedSpaceId;
        return (
          <button
            key={space.id}
            ref={isSelected ? activeChipRef : null}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectSpace(space.id)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors",
              isSelected
                ? "border-foreground/25 bg-surface-2 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {space.name}
          </button>
        );
      })}
    </fieldset>
  );
}
