/** Confere o tipo real do controle antes de consultar seu valor. */
export function requireSelect(element: HTMLElement): HTMLElement & HTMLSelectElement {
  if (element.tagName !== "SELECT" || !("value" in element) || typeof element.value !== "string")
    throw new Error("Esperado um controle select.");
  return element as HTMLElement & HTMLSelectElement;
}

export function requireElement<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Elemento esperado não encontrado.");
  return value;
}
