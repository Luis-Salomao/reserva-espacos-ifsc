import { describe, expect, test } from "bun:test";
import type { SessionInfo } from "#/server/session";
import { guardImport } from "./-admin-guard";

const anonymous: SessionInfo = { user: null, publicRead: true, timeZone: "America/Sao_Paulo" };

function caught(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("guardImport", () => {
  test("sem sessão volta ao caminho realmente pedido, com a consulta", () => {
    const error = caught(() =>
      guardImport({ session: anonymous }, { pathname: "/importar/lotes/abc", searchStr: "?x=1" }),
    );
    expect(error).toMatchObject({
      options: { to: "/entrar", search: { voltar: "/importar/lotes/abc?x=1" } },
    });
  });

  test("sem consulta usa só o caminho", () => {
    const error = caught(() =>
      guardImport({ session: anonymous }, { pathname: "/importar/lotes", searchStr: "" }),
    );
    expect(error).toMatchObject({ options: { search: { voltar: "/importar/lotes" } } });
  });
});
