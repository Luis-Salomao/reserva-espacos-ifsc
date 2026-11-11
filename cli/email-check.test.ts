import { expect, test } from "bun:test";
import { emailConfigurationReport, runEmailCheck } from "./email-check";

test("entrada CLI rejeita argumentos e diagnostica instalação sem envio", () => {
  const previous = process.env.EMAIL_PROVIDER;
  try {
    process.env.EMAIL_PROVIDER = "disabled";
    expect(runEmailCheck([])).toBe(0);
    expect(runEmailCheck(["--invalid"])).toBe(1);
    process.env.EMAIL_PROVIDER = "invalid";
    expect(runEmailCheck([])).toBe(1);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "EMAIL_PROVIDER");
    else process.env.EMAIL_PROVIDER = previous;
  }
});

test("diagnóstico é opcional e não revela chaves nem envia mensagens", () => {
  expect(emailConfigurationReport({})).toMatchObject({ code: 0, enabled: false });
  const invalid = emailConfigurationReport({
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "secret-never-print",
  });
  expect(invalid.code).toBe(1);
  expect(invalid.lines.join("\n")).not.toContain("secret-never-print");
  const valid = emailConfigurationReport({
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "secret-never-print",
    EMAIL_FROM: "reservas@example.org",
    PUBLIC_ORIGIN: "https://reservas.example.org",
    EMAIL_PAYLOAD_KEY: "A".repeat(43),
    DEPLOY_TARGET: "cloudflare",
  });
  expect(valid).toMatchObject({ code: 0, enabled: true });
  expect(valid.lines.join("\n")).toContain("cron");
  expect(valid.lines.join("\n")).not.toContain("secret-never-print");
  expect(valid.lines.join("\n")).not.toContain("A".repeat(43));
});
