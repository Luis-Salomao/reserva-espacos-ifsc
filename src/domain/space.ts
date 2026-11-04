import type { SpaceEquipment } from "./equipment";

/**
 * Espaço reservável. `capacity` null = não informado. `equipment` só vem nas consultas que leem
 * os equipamentos; ausente não quer dizer "sem equipamentos".
 */
export type Space = {
  id: string;
  name: string;
  capacity: number | null;
  equipment?: SpaceEquipment;
};
