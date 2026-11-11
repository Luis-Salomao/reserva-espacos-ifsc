import { describe, expect, test } from "bun:test";
import { buildBookingTitle, isMaintenanceTitle, MAINTENANCE_PREFIX } from "./booking-kind";

describe("booking-kind", () => {
  test("MAINTENANCE_PREFIX é 'Manutenção: '", () => {
    expect(MAINTENANCE_PREFIX).toBe("Manutenção: ");
  });

  test("isMaintenanceTitle reconhece títulos com o prefixo", () => {
    expect(isMaintenanceTitle("Manutenção: Troca de lâmpada")).toBe(true);
  });

  test("isMaintenanceTitle rejeita títulos sem o prefixo", () => {
    expect(isMaintenanceTitle("Reunião pedagógica")).toBe(false);
  });

  test("buildBookingTitle prefixa texto de manutencao", () => {
    expect(buildBookingTitle("manutencao", "Troca de lâmpada")).toBe(
      "Manutenção: Troca de lâmpada",
    );
  });

  test("buildBookingTitle não prefixa evento", () => {
    expect(buildBookingTitle("evento", "Reunião pedagógica")).toBe("Reunião pedagógica");
  });

  test("buildBookingTitle corta espaços nas pontas antes e depois do prefixo", () => {
    expect(buildBookingTitle("manutencao", "  Troca de lâmpada  ")).toBe(
      "Manutenção: Troca de lâmpada",
    );
    expect(buildBookingTitle("evento", "  Reunião  ")).toBe("Reunião");
  });
});
