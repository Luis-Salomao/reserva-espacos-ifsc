import { describe, expect, test } from "bun:test";
import { type NoticeData, noticeText } from "#/domain/notification";

const data: NoticeData = {
  spaceName: "A-202",
  date: "2026-11-12",
  start: "13:30",
  end: "15:20",
  title: "Cálculo I",
};

describe("noticeText", () => {
  test("cancelamento pela administração, com e sem motivo", () => {
    expect(noticeText("reserva_cancelada", data)).toBe(
      "A administração cancelou sua reserva “Cálculo I” (A-202 · qui 12/11 · 13:30–15:20).",
    );
    expect(noticeText("reserva_cancelada", { ...data, note: "Manutenção do projetor" })).toContain(
      "Motivo: Manutenção do projetor",
    );
  });
  test("série cancelada diz quantas datas", () => {
    const text = noticeText("reserva_cancelada", { ...data, count: 4 });
    expect(text).toContain("4 datas a partir de qui 12/11");
  });
  test("uma data só não diz quantas", () => {
    expect(noticeText("reserva_cancelada", { ...data, count: 1 })).not.toContain("datas");
  });
  test("pedido recebido traz quem pediu, finalidade e mensagem", () => {
    const text = noticeText("pedido_recebido", {
      ...data,
      title: "Prova",
      actorName: "Ana",
      message: "Preciso para a prova",
    });
    expect(text).toBe(
      "Ana pediu a sala A-202 · qui 12/11 · 13:30–15:20 para “Prova”. Mensagem: Preciso para a prova",
    );
  });
  test("pedido aceito e recusado", () => {
    expect(noticeText("pedido_aceito", { ...data, actorName: "Bia" })).toContain(
      "Bia aceitou seu pedido",
    );
    expect(noticeText("pedido_recusado", { ...data, actorName: "Bia", note: "Uso a sala" })).toBe(
      "Bia recusou seu pedido da sala A-202 · qui 12/11 · 13:30–15:20. Motivo: Uso a sala",
    );
    expect(noticeText("pedido_recusado", data)).toContain("Alguém recusou");
  });
});
