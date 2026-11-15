import type { BookingsDeps, People } from "#/application/bookings/types";
import { localNow } from "#/domain/availability";
import type { User } from "#/domain/user";

const NO_PEOPLE: People = new Map();

/** Dependências e consultas auxiliares compartilhadas pelas operações do serviço de reservas. */
export type BookingsContext = BookingsDeps & {
  nowLocal: () => string;
  peopleFor: (viewer: User | null) => Promise<People>;
  spaceName: (spaceId: string) => Promise<string | null>;
};

export function createContext(deps: BookingsDeps): BookingsContext {
  const { users, spaces, clock, timeZone } = deps;
  return {
    ...deps,
    nowLocal: () => localNow(clock.now(), timeZone),
    /** Nomes só para quem está logado; o visitante nem dispara a consulta. */
    async peopleFor(viewer) {
      if (viewer === null) return NO_PEOPLE;
      const all = await users.list();
      return new Map(
        all.map((user) => [
          user.id,
          { name: user.name, code: user.code, placeholder: user.placeholder, active: user.active },
        ]),
      );
    },
    async spaceName(spaceId) {
      const found = (await spaces.list()).find((space) => space.id === spaceId);
      return found?.name ?? null;
    },
  };
}
