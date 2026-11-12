import { Info } from "lucide-react";
import { useState } from "react";
import { SpaceDetails } from "#/components/spaces/space-details";
import { Button } from "#/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import type { Space } from "#/domain/space";

type Props = {
  space: Space | undefined;
  roomName: string;
};

/**
 * Botão de informação que abre um popover acessível (nome da sala, Esc fecha, foco volta ao
 * botão) com `SpaceDetails` completo. Sem o espaço no índice, mostra aviso de indisponibilidade.
 */
export function RoomDetailsButton({ space, roomName }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Detalhes de ${roomName}`}
          title={`Detalhes de ${roomName}`}
          className="size-7 shrink-0 rounded-full"
        >
          <Info className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`Detalhes de ${roomName}`}
        className="max-h-[80vh] w-80 overflow-y-auto"
      >
        {space ? (
          <SpaceDetails space={space} />
        ) : (
          <p className="text-sm text-muted-foreground">Detalhes indisponíveis</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
