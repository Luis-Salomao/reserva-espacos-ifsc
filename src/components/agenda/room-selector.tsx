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
      <div className="grid gap-1">
        {spaces.map((space) => {
          const isSelected = space.id === selectedSpaceId;
          return (
            <button
              key={space.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectSpace(space.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                isSelected
                  ? "bg-surface-2 font-semibold text-foreground shadow-[inset_3px_0_0_var(--accent)]"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <DoorClosed
                className={cn(
                  "size-4 shrink-0",
                  isSelected ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 truncate">{space.name}</span>
              {space.capacity !== null && (
                <span className="ml-auto text-xs text-muted-foreground">{space.capacity} lug.</span>
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
      className="-mx-4 flex gap-2 border-0 m-0 overflow-x-auto px-4 py-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-border bg-background text-foreground hover:bg-surface-2",
            )}
          >
            {space.name}
          </button>
        );
      })}
    </fieldset>
  );
}
