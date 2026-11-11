export type InitAnswers = {
  target: "local" | "cloudflare";
  databasePath?: string;
  timezone?: string;
  emailProvider?: "disabled" | "resend";
  emailFrom?: string;
  publicOrigin?: string;
};

export type InitPlan = {
  files: Array<{ path: string; content: string }>;
  commands: string[][];
  /** Instruções exibidas ao usuário (não executadas). */
  notes: string[];
};

const DEFAULT_DATABASE_PATH = "./data/app.sqlite";
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

// biome-ignore lint/suspicious/noControlCharactersInRegex: detecta caracteres de controle de propósito
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_CHARS = /["'`$]/;

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Valida as respostas; devolve mensagens de erro (vazio = válido). */
export function validateAnswers(answers: InitAnswers): string[] {
  const errors: string[] = [];
  const check = (label: string, value: string | undefined) => {
    if (value === undefined) return;
    if (value.trim() === "") errors.push(`${label} não pode ser vazio.`);
    else if (CONTROL_CHARS.test(value)) errors.push(`${label} contém caracteres de controle.`);
    else if (FORBIDDEN_CHARS.test(value))
      errors.push(`${label} contém aspas ou $ (não suportado).`);
    else if (NEEDS_QUOTES.test(value) && value.includes("\\"))
      errors.push(`${label} com espaço ou # não pode conter barra invertida; use /.`);
  };
  check("Caminho do banco", answers.databasePath);
  check("Fuso horário", answers.timezone);
  check("Remetente", answers.emailFrom);
  check("Origem pública", answers.publicOrigin);
  if (
    answers.emailProvider !== undefined &&
    !["disabled", "resend"].includes(answers.emailProvider)
  ) {
    errors.push("Provedor de e-mail inválido. Use disabled ou resend.");
  }
  if (answers.emailProvider === "resend") {
    if (
      !answers.emailFrom ||
      !/^(?:[^<>]+ <)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(answers.emailFrom)
    ) {
      errors.push("Informe um remetente de e-mail válido.");
    }
    try {
      const origin = new URL(answers.publicOrigin ?? "");
      if (
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash ||
        (origin.protocol !== "https:" &&
          !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
      ) {
        errors.push("Informe uma origem pública HTTPS sem caminho (HTTP somente em localhost).");
      }
    } catch {
      errors.push("Informe uma origem pública válida.");
    }
  }
  if (answers.timezone !== undefined && errors.length === 0 && !isValidTimezone(answers.timezone)) {
    errors.push(`Fuso horário inválido: ${answers.timezone}.`);
  }
  return errors;
}

const NEEDS_QUOTES = /[\s#]/;

function envValue(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value}"` : value;
}

/** Função pura: descreve arquivos e comandos, sem tocar em disco nem processos. */
export function planInit(answers: InitAnswers): InitPlan {
  const errors = validateAnswers(answers);
  if (errors.length > 0) throw new Error(errors.join(" "));
  const timezone = envValue(answers.timezone ?? DEFAULT_TIMEZONE);
  const mail =
    answers.emailProvider === "resend"
      ? `EMAIL_PROVIDER=resend\nEMAIL_FROM=${envValue(answers.emailFrom ?? "")}\nPUBLIC_ORIGIN=${envValue(answers.publicOrigin ?? "")}\n`
      : "EMAIL_PROVIDER=disabled\n";
  const mailNotes =
    answers.emailProvider === "resend"
      ? [
          "Configure RESEND_API_KEY e EMAIL_PAYLOAD_KEY (32 bytes aleatórios em base64url) no ambiente protegido, nunca em argumentos ou arquivos versionados.",
          answers.target === "cloudflare"
            ? "Produção: copie EMAIL_PROVIDER, EMAIL_FROM e PUBLIC_ORIGIN para vars no wrangler.jsonc. Execute interativamente bunx wrangler secret put RESEND_API_KEY e bunx wrangler secret put EMAIL_PAYLOAD_KEY; .dev.vars vale somente no desenvolvimento. Ative triggers.crons somente após configurar o envio."
            : "Agende bun run cli email:drain a cada minuto no cron ou Agendador de Tarefas, na pasta da instalação e com o mesmo ambiente do servidor.",
        ]
      : [];

  if (answers.target === "local") {
    const databasePath = envValue(answers.databasePath ?? DEFAULT_DATABASE_PATH);
    return {
      files: [
        {
          path: ".env",
          content: `DEPLOY_TARGET=local\nDATABASE_PATH=${databasePath}\nTIMEZONE=${timezone}\n${mail}`,
        },
      ],
      commands: [["bun", "run", "db:migrate"]],
      notes: ["Depois: bun run build:local && bun run start:local", ...mailNotes],
    };
  }

  return {
    files: [{ path: ".dev.vars", content: `TIMEZONE=${timezone}\n${mail}` }],
    // Ordem importa: o build precisa vir depois de colar o database_id (o Vite grava um
    // snapshot do wrangler.jsonc em dist/server), e antes do deploy.
    commands: [
      ["bunx", "wrangler", "d1", "create", "reserva-espacos"],
      ["bun", "run", "cf:check"],
      ["bun", "run", "build:cf"],
      ["bun", "run", "db:migrate:d1:remote"],
      ["bunx", "wrangler", "deploy"],
    ],
    notes: [
      ...mailNotes,
      "Após `wrangler d1 create`, copie o `database_id` exibido e cole em",
      "wrangler.jsonc (d1_databases[0].database_id) ANTES de compilar, migrar e publicar.",
      "Este CLI não edita o wrangler.jsonc: ele pausa após o primeiro comando para você colar o id,",
      "e `cf:check` aborta se o id provisório (local-placeholder) ainda estiver lá.",
    ],
  };
}
