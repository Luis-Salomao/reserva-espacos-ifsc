import type {
  Clock,
  RoomMappingRepository,
  SpaceRepository,
  TeacherMappingRepository,
  UserRepository,
} from "#/application/ports";
import { fail, ok, parseText, type Result } from "#/application/validation";
import type { RoomMapping, TeacherMapping } from "#/domain/import-batch";

const MAX_ITEMS = 500;
const MAX_SOURCE_ID = 100;
const MAX_SOURCE_SHORT = 100;

export type RoomTargetView = { spaceId: string | null; ignored: boolean };

export type RoomSuggestion = {
  sourceId: string;
  short: string;
  name: string;
  /** Vínculo já salvo para esta id de sala (usado na importação). */
  saved: RoomTargetView | null;
  /** Só sugestão: nunca é aplicada sem o usuário confirmar. */
  suggestion: { target: RoomTargetView; origin: "sigla" | "nome" } | null;
};

export type TeacherSuggestion = {
  sourceId: string;
  short: string;
  saved: { userId: string | null } | null;
  suggestion: { userId: string; origin: "sigla" | "codigo" } | null;
};

function same(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
}

function hasTarget(mapping: RoomMapping): boolean {
  return mapping.spaceId !== null || mapping.ignored;
}

export function createMappingsService(deps: {
  rooms: RoomMappingRepository;
  teachers: TeacherMappingRepository;
  spaces: SpaceRepository;
  users: UserRepository;
  clock: Clock;
}) {
  const { rooms, teachers, spaces, users, clock } = deps;

  /** Destino único entre os vínculos salvos com a mesma sigla (ambíguo = nenhum). */
  function targetByShort(saved: readonly RoomMapping[], short: string): RoomTargetView | null {
    const targets = saved
      .filter((mapping) => hasTarget(mapping) && same(mapping.sourceShort, short))
      .map((mapping) => ({ spaceId: mapping.spaceId, ignored: mapping.ignored }));
    const [first] = targets;
    if (first === undefined) return null;
    const unanimous = targets.every(
      (target) => target.spaceId === first.spaceId && target.ignored === first.ignored,
    );
    return unanimous ? first : null;
  }

  return {
    /**
     * Para cada sala do arquivo: o vínculo salvo pela id e, sem ele, uma sugestão (mesma sigla de
     * um vínculo salvo de outra exportação, ou espaço de mesmo nome). A id do aSc pode mudar entre
     * exportações; por isso a sigla só sugere, nunca aplica.
     */
    async suggestRooms(
      classrooms: ReadonlyArray<{ id: string; short: string; name: string }>,
    ): Promise<RoomSuggestion[]> {
      const [saved, allSpaces] = await Promise.all([rooms.list(), spaces.list()]);
      return classrooms.map((room) => {
        const own = saved.find((mapping) => mapping.sourceRoomId === room.id);
        const base = { sourceId: room.id, short: room.short, name: room.name };
        if (own !== undefined) {
          return {
            ...base,
            saved: { spaceId: own.spaceId, ignored: own.ignored },
            suggestion: null,
          };
        }
        const byShort = targetByShort(saved, room.short);
        if (byShort !== null) {
          return { ...base, saved: null, suggestion: { target: byShort, origin: "sigla" } };
        }
        const space = allSpaces.find(
          (item) => same(item.name, room.name) || same(item.name, room.short),
        );
        return {
          ...base,
          saved: null,
          suggestion:
            space === undefined
              ? null
              : { target: { spaceId: space.id, ignored: false }, origin: "nome" },
        };
      });
    },

    async suggestTeachers(
      list: ReadonlyArray<{ id: string; short: string }>,
    ): Promise<TeacherSuggestion[]> {
      const [saved, accounts] = await Promise.all([teachers.list(), users.list()]);
      const active = accounts.filter((user) => user.active && user.code !== null);
      return list.map((teacher) => {
        const base = { sourceId: teacher.id, short: teacher.short };
        const own = saved.find((mapping) => mapping.sourceTeacherId === teacher.id);
        if (own !== undefined) return { ...base, saved: { userId: own.userId }, suggestion: null };
        const byShort = new Set(
          saved
            .filter(
              (mapping) => mapping.userId !== null && same(mapping.sourceShort, teacher.short),
            )
            .map((mapping) => mapping.userId as string),
        );
        const [onlyUser] = byShort;
        if (byShort.size === 1 && onlyUser !== undefined) {
          return { ...base, saved: null, suggestion: { userId: onlyUser, origin: "sigla" } };
        }
        const account = active.find((user) => same(user.code ?? "", teacher.short));
        return {
          ...base,
          saved: null,
          suggestion: account === undefined ? null : { userId: account.id, origin: "codigo" },
        };
      });
    },

    /** Salva (cria ou atualiza pela id de origem) após validar tudo; nada é gravado se algo falha. */
    async saveRooms(items: readonly RoomMapping[]): Promise<Result<null>> {
      if (items.length > MAX_ITEMS) {
        return fail("validation", `Envie no máximo ${MAX_ITEMS} vínculos por vez.`);
      }
      const known = new Set((await spaces.list()).map((space) => space.id));
      const clean: RoomMapping[] = [];
      for (const item of items) {
        const id = parseText(item.sourceRoomId, MAX_SOURCE_ID, "A sala de origem", "sourceRoomId");
        if (!id.ok) return id;
        const short = parseText(
          item.sourceShort,
          MAX_SOURCE_SHORT,
          "A sigla da sala",
          "sourceShort",
        );
        if (!short.ok) return short;
        if (item.spaceId !== null && item.ignored) {
          return fail("validation", "Escolha um espaço ou ignorar a sala, não os dois.", "spaceId");
        }
        if (item.spaceId !== null && !known.has(item.spaceId)) {
          return fail("validation", "O espaço escolhido não existe.", "spaceId");
        }
        clean.push({
          sourceRoomId: id.value,
          sourceShort: short.value,
          spaceId: item.spaceId,
          ignored: item.ignored,
        });
      }
      await rooms.saveMany(clean, clock.now().toISOString());
      return ok(null);
    },

    async saveTeachers(items: readonly TeacherMapping[]): Promise<Result<null>> {
      if (items.length > MAX_ITEMS) {
        return fail("validation", `Envie no máximo ${MAX_ITEMS} vínculos por vez.`);
      }
      // Uma só consulta (como em saveRooms) em vez de uma por item.
      const activeIds = new Set(
        items.some((item) => item.userId !== null)
          ? (await users.list()).filter((user) => user.active).map((user) => user.id)
          : [],
      );
      const clean: TeacherMapping[] = [];
      for (const item of items) {
        const id = parseText(
          item.sourceTeacherId,
          MAX_SOURCE_ID,
          "O docente de origem",
          "sourceTeacherId",
        );
        if (!id.ok) return id;
        const short = parseText(
          item.sourceShort,
          MAX_SOURCE_SHORT,
          "A sigla do docente",
          "sourceShort",
        );
        if (!short.ok) return short;
        if (item.userId !== null && !activeIds.has(item.userId)) {
          return fail("validation", "A conta escolhida não existe ou está inativa.", "userId");
        }
        clean.push({ sourceTeacherId: id.value, sourceShort: short.value, userId: item.userId });
      }
      await teachers.saveMany(clean, clock.now().toISOString());
      return ok(null);
    },
  };
}

export type MappingsService = ReturnType<typeof createMappingsService>;
