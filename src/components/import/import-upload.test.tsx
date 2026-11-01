import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImportUpload } from "./import-upload";

test("envia o arquivo escolhido", () => {
  const onSubmit = mock((_file: File) => {});
  render(<ImportUpload pending={false} onSubmit={onSubmit} />);
  const file = new File(["<timetable/>"], "a.xml", { type: "text/xml" });
  const input = screen.getByLabelText("Arquivo XML de horários") as HTMLInputElement;
  expect(input.accept).toBe(".xml,text/xml,application/xml");
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.submit(input.form as HTMLFormElement);
  expect(onSubmit).toHaveBeenCalledWith(file);
});

test("não envia sem arquivo", () => {
  const onSubmit = mock((_file: File) => {});
  render(<ImportUpload pending={false} onSubmit={onSubmit} />);
  fireEvent.submit(
    screen.getByRole("button", { name: "Gerar prévia" }).closest("form") as HTMLFormElement,
  );
  expect(onSubmit).not.toHaveBeenCalled();
});

test("desabilita o botão e o campo enquanto processa", () => {
  render(<ImportUpload pending onSubmit={() => {}} />);
  expect((screen.getByRole("button", { name: "Processando…" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect((screen.getByLabelText("Arquivo XML de horários") as HTMLInputElement).disabled).toBe(
    true,
  );
});
