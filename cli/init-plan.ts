export type InitAnswers = {
  target: "local" | "cloudflare";
  databasePath?: string;
  timezone?: string;
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

  if (answers.target === "local") {
    const databasePath = envValue(answers.databasePath ?? DEFAULT_DATABASE_PATH);
    return {
      files: [
        {
          path: ".env",
          content: `DEPLOY_TARGET=local\nDATABASE_PATH=${databasePath}\nTIMEZONE=${timezone}\n`,
        },
      ],
      commands: [["bun", "run", "db:migrate"]],
      notes: ["Depois: bun run build:local && bun run start:local"],
    };
  }

  return {
    files: [{ path: ".dev.vars", content: `TIMEZONE=${timezone}\n` }],
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
      "Após `wrangler d1 create`, copie o `database_id` exibido e cole em",
      "wrangler.jsonc (d1_databases[0].database_id) ANTES de compilar, migrar e publicar.",
      "Este CLI não edita o wrangler.jsonc: ele pausa após o primeiro comando para você colar o id,",
      "e `cf:check` aborta se o id provisório (local-placeholder) ainda estiver lá.",
    ],
  };
}
