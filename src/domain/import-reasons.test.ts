import { describe, expect, test } from "bun:test";
import { describeReason, REASON_CODES } from "./import-reasons";

describe("describeReason", () => {
  test("todo código emitido pelo planejador e pela aplicação tem rótulo", () => {
    for (const code of REASON_CODES) {
      const reason = describeReason(code, null);
      expect(reason.label.length).toBeGreaterThan(3);
      expect(reason.known).toBe(true);
    }
    expect(REASON_CODES).toEqual(
      expect.arrayContaining([
        "no_room",
        "multiple_rooms",
        "room_unmapped",
        "room_ignored",
        "term_without_dates",
        "weeks_unsupported",
        "never_scheduled",
        "duplicate_occurrence",
        "no_dates",
        "conflito_existente",
        "conflito_concorrente",
        "conflito_interno",
        "erro_gravacao",
      ]),
    );
  });

  test("mantém o detalhe do servidor e usa o padrão quando ele falta", () => {
    expect(describeReason("room_ignored", "A sala 101 foi marcada para ignorar.").detail).toBe(
      "A sala 101 foi marcada para ignorar.",
    );
    expect(describeReason("room_ignored", null).detail).toBeNull();
  });

  test("código desconhecido ou ausente vira mensagem genérica", () => {
    expect(describeReason("codigo_novo", "x")).toEqual({
      label: "Motivo não reconhecido",
      detail: "x",
      known: false,
    });
    expect(describeReason(null, null).label).toBe("Sem motivo informado");
  });
});
