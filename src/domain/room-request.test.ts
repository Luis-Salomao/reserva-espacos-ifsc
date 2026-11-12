import { describe, expect, test } from "bun:test";
import {
  canAskForRoom,
  effectiveStatus,
  occupationOwnerId,
  requestIssue,
} from "#/domain/room-request";

const live = { status: "ativa" as const, endsAt: "2026-11-10T12:00" };
const owned = {
  source: "manual" as const,
  createdBy: "owner",
  responsibleUserId: "owner",
};
const owner = { id: "owner", active: true, placeholder: false };
const now = "2026-11-03T09:00";

describe("occupationOwnerId", () => {
  test("manual: quem reservou; importada: o responsável; sem responsável: null", () => {
    expect(occupationOwnerId({ source: "manual", createdBy: "a", responsibleUserId: "b" })).toBe(
      "a",
    );
    expect(occupationOwnerId({ source: "import", createdBy: "a", responsibleUserId: "b" })).toBe(
      "b",
    );
    expect(occupationOwnerId({ source: "import", createdBy: null, responsibleUserId: null })).toBe(
      null,
    );
  });
});

describe("canAskForRoom", () => {
  test("admin e docente ativos pedem; horários, manutenção e inativos não", () => {
    expect(canAskForRoom({ active: true, roles: ["docente"] })).toBe(true);
    expect(canAskForRoom({ active: true, roles: ["admin"] })).toBe(true);
    expect(canAskForRoom({ active: true, roles: ["horarios"] })).toBe(false);
    expect(canAskForRoom({ active: true, roles: ["manutencao"] })).toBe(false);
    expect(canAskForRoom({ active: false, roles: ["docente"] })).toBe(false);
  });
});

describe("effectiveStatus", () => {
  test("pendente com ocupação ativa e futura continua pendente", () => {
    expect(effectiveStatus("pendente", live, now)).toBe("pendente");
  });
  test("pendente vira indisponível se a ocupação foi cancelada ou já terminou", () => {
    expect(effectiveStatus("pendente", { ...live, status: "cancelada" }, now)).toBe("indisponivel");
    expect(effectiveStatus("pendente", live, "2026-11-10T12:00")).toBe("indisponivel");
  });
  test("estados decididos não mudam", () => {
    for (const status of ["aceito", "recusado", "cancelado", "encerrado"] as const) {
      expect(effectiveStatus(status, { ...live, status: "cancelada" }, now)).toBe(status);
    }
  });
});

describe("requestIssue", () => {
  const base = { requesterId: "me", occupation: { ...live, ...owned }, owner, now };
  test("ocupação de outra pessoa, ativa e futura pode ser pedida", () => {
    expect(requestIssue(base)).toBeNull();
  });
  test("a própria ocupação é recusada", () => {
    expect(requestIssue({ ...base, requesterId: "owner" })).toContain("já é sua");
  });
  test("sem dono, dono inativo ou conta fantasma: fale com a coordenação", () => {
    for (const bad of [null, { ...owner, active: false }, { ...owner, placeholder: true }]) {
      expect(requestIssue({ ...base, owner: bad })).toContain("coordenação");
    }
  });
  test("ocupação passada ou cancelada não está disponível", () => {
    expect(requestIssue({ ...base, now: "2026-11-11T09:00" })).toContain(
      "não está mais disponível",
    );
    expect(
      requestIssue({ ...base, occupation: { ...base.occupation, status: "cancelada" } }),
    ).toContain("não está mais disponível");
  });
});
