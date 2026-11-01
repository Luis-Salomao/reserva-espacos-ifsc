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

/** Função pura: descreve arquivos e comandos, sem tocar em disco nem processos. */
export function planInit(answers: InitAnswers): InitPlan {
  const timezone = answers.timezone ?? DEFAULT_TIMEZONE;

  if (answers.target === "local") {
    const databasePath = answers.databasePath ?? DEFAULT_DATABASE_PATH;
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
    commands: [
      ["bunx", "wrangler", "d1", "create", "reserva-espacos"],
      ["bun", "run", "db:migrate:d1:remote"],
      ["bun", "run", "deploy:cf"],
    ],
    notes: [
      "Após `wrangler d1 create`, copie o `database_id` exibido e cole em",
      "wrangler.jsonc (d1_databases[0].database_id) ANTES de migrar e publicar.",
      "Este CLI não edita o wrangler.jsonc: ele pausa após o primeiro comando para você colar o id.",
    ],
  };
}
