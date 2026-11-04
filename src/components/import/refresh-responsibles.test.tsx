import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RefreshResponsibles } from "./refresh-responsibles";

const realFetch = globalThis.fetch;
let requests: Array<{ url: string; body: unknown }> = [];

function respond(body: unknown) {
  requests = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: init.body });
    return new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

function send(file: File) {
  const input = screen.getByLabelText("Arquivo XML desta versão") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.submit(input.form as HTMLFormElement);
}

describe("Atualizar responsáveis", () => {
  test("só aparece no lote aplicado", () => {
    render(<RefreshResponsibles batch={{ semesterId: "s1", status: "rascunho" }} />);
    expect(screen.queryByRole("button", { name: "Atualizar responsáveis" })).toBeNull();
  });

  test("envia o XML do semestre e mostra quantas mudaram e quantas seguem sem responsável", async () => {
    respond({ ok: true, data: { changed: 12, withoutResponsible: 1 } });
    render(<RefreshResponsibles batch={{ semesterId: "s 1", status: "aplicado" }} />);
    const file = new File(["<timetable/>"], "grade.xml", { type: "text/xml" });
    send(file);

    expect(
      await screen.findByText("12 ocupações mudaram de responsável; 1 continua sem responsável."),
    ).toBeTruthy();
    expect(requests).toEqual([{ url: "/api/import-responsibles?semesterId=s%201", body: file }]);
  });

  test("recusa do servidor aparece como alerta", async () => {
    respond({ ok: false, status: 400, message: "Envie o mesmo arquivo da versão aplicada." });
    render(<RefreshResponsibles batch={{ semesterId: "s1", status: "aplicado" }} />);
    send(new File(["<timetable/>"], "outra.xml", { type: "text/xml" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Envie o mesmo arquivo da versão aplicada.",
    );
  });

  test("falha de rede vira mensagem de conexão", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    render(<RefreshResponsibles batch={{ semesterId: "s1", status: "aplicado" }} />);
    send(new File(["<timetable/>"], "grade.xml", { type: "text/xml" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/falar com o servidor/);
  });

  test("uma mudança e nenhuma sem responsável: frase no singular", async () => {
    respond({ ok: true, data: { changed: 1, withoutResponsible: 0 } });
    render(<RefreshResponsibles batch={{ semesterId: "s1", status: "aplicado" }} />);
    send(new File(["<timetable/>"], "grade.xml", { type: "text/xml" }));

    expect(
      await screen.findByText("1 ocupação mudou de responsável; 0 continuam sem responsável."),
    ).toBeTruthy();
  });
});
