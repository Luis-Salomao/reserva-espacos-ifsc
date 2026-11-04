import { describe, expect, test } from "bun:test";
import { matchesRoomSearch } from "./room-search";

describe("busca de salas", () => {
  const room = "Lab. A102 (Lab. de Redes)";
  test("aceita códigos com separadores e termos fora de ordem", () => {
    for (const query of [
      "A102",
      "a 102",
      "A-102",
      "102 a",
      "redes lab",
      "laboratório redes",
      "laboratorios de redes",
    ]) {
      expect(matchesRoomSearch(room, query)).toBe(true);
    }
  });
  test("combina bloco e andar sem confundir números de sala", () => {
    expect(matchesRoomSearch(room, "bloco a andar 1")).toBe(true);
    expect(matchesRoomSearch(room, "andar 2 bloco a")).toBe(false);
    expect(matchesRoomSearch("B-204", "bloco b segundo andar")).toBe(true);
    expect(matchesRoomSearch("A-202", "A203")).toBe(false);
    expect(matchesRoomSearch("B-202", "A202")).toBe(false);
  });
  test("tolera erros pequenos nas palavras e preserva todos os filtros", () => {
    expect(matchesRoomSearch(room, "lab rdees")).toBe(true);
    expect(matchesRoomSearch("Auditório", "audtorio")).toBe(true);
    expect(matchesRoomSearch(room, "laboratorio quimica")).toBe(false);
    expect(matchesRoomSearch("A-202", "lab a202")).toBe(false);
    expect(matchesRoomSearch(room, "   ")).toBe(true);
  });
});
