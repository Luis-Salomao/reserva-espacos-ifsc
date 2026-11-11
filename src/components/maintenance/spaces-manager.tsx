import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Notice } from "#/components/page";
import { SpaceDetails, SpaceDetailsLegend } from "#/components/spaces/space-details";
import { Button } from "#/components/ui/button";
import type { Space } from "#/domain/space";
import { groupSpaces } from "#/domain/space-groups";
import { SpaceInfoDialog } from "./space-info-dialog";

/** Lista de espaços da tela de manutenção, com diálogo de atualização restrita por espaço. */
export function MaintenanceSpacesManager({ spaces }: { spaces: Space[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Space | undefined>(undefined);
  const [status, setStatus] = useState("");

  async function reload(message: string) {
    setStatus("");
    await router.invalidate();
    setStatus(message);
  }

  const groups = groupSpaces(spaces);
  return (
    <div className="grid gap-4">
      <SpaceDetailsLegend />
      <div role="status">{status !== "" && <Notice tone="ok">{status}</Notice>}</div>
      {spaces.length === 0 ? (
        <Notice>Nenhum espaço cadastrado.</Notice>
      ) : (
        groups.map((block) => (
          <section key={block.label} aria-label={block.label} className="grid min-w-0 gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{block.label}</h2>
            {block.floors.map((floor) => (
              <div key={floor.label} className="grid min-w-0 gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">{floor.label}</h3>
                <ul className="grid gap-3 md:grid-cols-2">
                  {floor.spaces.map((space) => (
                    <li key={space.id} className="min-w-0">
                      <Card className="flex h-full flex-col gap-3">
                        <div className="min-w-0">
                          <p className="font-medium wrap-anywhere">{space.name}</p>
                          <SpaceDetails space={space} compact />
                        </div>
                        <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(space)}
                          >
                            Atualizar informações<span className="sr-only"> de {space.name}</span>
                          </Button>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
      <SpaceInfoDialog
        space={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          void reload("Informações atualizadas.");
        }}
      />
    </div>
  );
}
