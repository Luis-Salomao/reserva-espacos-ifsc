import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Avatar, avatarTone, initials } from "./avatar";

describe("Avatar", () => {
  test("iniciais do primeiro e do último nome; nome vazio vira ?", () => {
    expect(initials("Ana Souza")).toBe("AS");
    expect(initials("  ryan  ")).toBe("R");
    expect(initials("Fabiana de Oliveira Lima")).toBe("FL");
    expect(initials("")).toBe("?");
  });

  test("a cor é estável por nome e varia entre nomes", () => {
    expect(avatarTone("Ana Souza")).toBe(avatarTone("Ana Souza"));
    const tones = new Set(["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fabiana"].map(avatarTone));
    expect(tones.size).toBeGreaterThan(1);
  });

  test("é decorativo: aria-hidden com as iniciais", () => {
    const { container } = render(<Avatar name="Ryan Costa" size="xs" />);
    const span = container.firstElementChild;
    expect(span?.getAttribute("aria-hidden")).toBe("true");
    expect(span?.textContent).toBe("RC");
  });
});
