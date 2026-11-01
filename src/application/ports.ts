import type { Space } from "#/domain/space";

export interface SpaceRepository {
  list(): Promise<Space[]>;
  create(input: { name: string; capacity: number | null }): Promise<Space>;
}
