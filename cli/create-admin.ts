import { parseArgs } from "node:util";
import { validatePassword } from "#/application/auth.ts";
import { createPasswordHasher } from "#/infra/auth/password-hasher.ts";
import { createUserRepository } from "#/infra/db/repos/user-repository.ts";
import { getEnv } from "#/infra/env.ts";
import { getDb } from "#db-client";
import { planCreateAdmin } from "./create-admin-plan.ts";

const USAGE = `Uso: bun run cli create-admin --email EMAIL --name NOME [--code SIGLA]
                              [--target local|cloudflare] [--password-stdin]

Cria uma conta com papel admin. A senha é pedida sem eco (ou lida de stdin com
--password-stdin) e nunca é impressa.
  --target local       (padrão) grava no banco de DATABASE_PATH
  --target cloudflare  imprime o comando \`wrangler d1 execute\` com o hash calculado`;

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      code: { type: "string" },
      target: { type: "string", default: "local" },
      "password-stdin": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

/** Lê uma linha do terminal sem ecoar os caracteres. */
function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("Sem terminal interativo; use --password-stdin."));
      return;
    }
    process.stdout.write(label);
    let value = "";
    const finish = (): void => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
    };
    const onData = (data: Buffer): void => {
      for (const char of data.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          finish();
          reject(new Error("Cancelado."));
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

export async function runCreateAdmin(argv: string[]): Promise<number> {
  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse(argv).values;
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 1;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const target = values.target;
  if (target !== "local" && target !== "cloudflare") {
    console.error(`Alvo inválido: ${target}. Use local ou cloudflare.`);
    return 1;
  }
  if (values.email === undefined || values.name === undefined) {
    console.error(`--email e --name são obrigatórios.\n\n${USAGE}`);
    return 1;
  }

  try {
    let password: string;
    if (values["password-stdin"]) {
      password = await readAllStdin();
    } else {
      password = await promptHidden("Senha: ");
      if (password !== (await promptHidden("Repita a senha: "))) {
        console.error("As senhas não conferem.");
        return 1;
      }
    }
    const passwordError = validatePassword(password);
    if (passwordError !== null) {
      console.error(passwordError);
      return 1;
    }

    const env = getEnv({
      ...process.env,
      DEPLOY_TARGET: target,
      ...(target === "cloudflare" ? { DATABASE_PATH: undefined } : {}),
    });
    const hasher = createPasswordHasher({
      algorithm: env.PASSWORD_HASH,
      scryptN: env.PASSWORD_SCRYPT_N,
      ...(env.PASSWORD_PEPPER === undefined ? {} : { pepper: env.PASSWORD_PEPPER }),
    });
    const plan = planCreateAdmin({
      email: values.email,
      name: values.name,
      code: values.code,
      passwordHash: await hasher.hash(password),
      target,
      id: crypto.randomUUID(),
      now: new Date().toISOString(),
    });
    if (!plan.ok) {
      for (const message of plan.errors) console.error(message);
      return 1;
    }

    if (plan.command !== undefined) {
      console.log(
        "Execute o comando abaixo (shell bash/zsh) para criar o admin no D1 remoto.\nAtenção: o PASSWORD_PEPPER do Worker deve ser o mesmo usado aqui.\n",
      );
      console.log(plan.command);
      return 0;
    }
    const user = await createUserRepository(getDb()).create(plan.row);
    console.log(`Admin criado: ${user.email} (${user.id}).`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
