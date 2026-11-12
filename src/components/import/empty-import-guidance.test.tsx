import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { EMPTY_COUNTS } from "#/domain/import-batch";
import { EmptyImportGuidance } from "./empty-import-guidance";

describe("EmptyImportGuidance", () => {
  test("explica o bloqueio e orienta datas, salas ambíguas e horários sem sala", () => {
    const actions = { rooms: 0, review: 0 };
    render(
      <EmptyImportGuidance
        {...{
          summary: {
            rows: 195,
            counts: { ...EMPTY_COUNTS, nao_aplicavel: 195 },
            notApplicable: {
              term_without_dates: 155,
              multiple_rooms: 23,
              no_room: 17,
              room_unmapped: 1,
            },
          },
          semesterId: "semester-test-id",
          onMapRooms: () => actions.rooms++,
          onReview: () => actions.review++,
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Nenhuma ocupação está pronta para aplicação" }),
    ).toBeTruthy();
    expect(screen.getByText(/155 · Duração sem datas no semestre/)).toBeTruthy();
    expect(screen.getByText(/23 · Aula com várias salas/)).toBeTruthy();
    expect(screen.getByText(/17 · Aula sem sala/)).toBeTruthy();
    expect(screen.getByText(/linhas com dados suficientes poderão ficar pendentes/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ajustar datas do semestre" }).getAttribute("href"),
    ).toBe("/semestres/semester-test-id");

    fireEvent.click(screen.getByRole("button", { name: "Revisar vínculos de salas" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar à conferência" }));
    expect(actions).toEqual({ rooms: 1, review: 1 });
  });

  test("não oferece editar semestre ou vínculo quando esses motivos não existem", () => {
    render(
      <EmptyImportGuidance
        {...{
          summary: {
            rows: 1,
            counts: { ...EMPTY_COUNTS, nao_aplicavel: 1 },
            notApplicable: { multiple_rooms: 1 },
          },
          semesterId: "semester-test-id",
          onMapRooms: () => {},
          onReview: () => {},
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Ajustar datas do semestre" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revisar vínculos de salas" })).toBeNull();
  });
});
