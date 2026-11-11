import { describe, expect, test } from "bun:test";
import type { User } from "#/domain/user";
import type { SessionInfo } from "#/server/session";
import { guardImport, guardSpaceInfo } from "./-admin-guard";

const anonymous: SessionInfo = { user: null, publicRead: true, timeZone: "America/Sao_Paulo" };

const docente: User = {
  id: "u1",
  email: "d@ifsc.edu.br",
  name: "Doc Ente",
  code: null,
  roles: ["docente"],
  active: true,
  placeholder: false,
};

const manutencao: User = { ...docente, id: "u2", roles: ["manutencao"] };

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

describe("guardSpaceInfo", () => {
  test("sem sessão volta ao login com o caminho pedido", () => {
    const error = caught(() => guardSpaceInfo({ session: anonymous }, "/manutencao/espacos"));
    expect(error).toMatchObject({
      options: { to: "/entrar", search: { voltar: "/manutencao/espacos" } },
    });
  });

  test("docente não é redirecionado (a página mostra a mensagem de acesso negado)", () => {
    const session: SessionInfo = { user: docente, publicRead: true, timeZone: "America/Sao_Paulo" };
    const error = caught(() => guardSpaceInfo({ session }, "/manutencao/espacos"));
    expect(error).toBeUndefined();
  });

  test("manutencao segue sem redirecionar", () => {
    const session: SessionInfo = {
      user: manutencao,
      publicRead: true,
      timeZone: "America/Sao_Paulo",
    };
    const error = caught(() => guardSpaceInfo({ session }, "/manutencao/espacos"));
    expect(error).toBeUndefined();
  });
});
