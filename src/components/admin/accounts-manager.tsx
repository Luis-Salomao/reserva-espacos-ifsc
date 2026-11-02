import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { Role, User } from "#/domain/user";
import {
  createAccountFn,
  resetAccountPasswordFn,
  setAccountActiveFn,
  updateAccountFn,
} from "#/server/admin";
import type { AdminResponse } from "#/server/admin-actions";
import { FieldError } from "./field-error";
import {
  fieldError,
  generalError,
  ROLE_LABELS,
  ROLE_OPTIONS,
  runAdminAction,
  useFocusInvalidField,
} from "./use-admin-action";

function GeneralError({ message }: { message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p role="alert" className="rounded-lg border bg-occ-conflict p-3 text-sm">
      {message}
    </p>
  );
}

type RolesFieldProps = {
  idPrefix: string;
  value: Role[];
  onChange: (roles: Role[]) => void;
  error: string | undefined;
};

function RolesField({ idPrefix, value, onChange, error }: RolesFieldProps) {
  const errorId = `${idPrefix}-roles-error`;
  return (
    <fieldset className="grid gap-2" aria-describedby={error === undefined ? undefined : errorId}>
      <legend className="text-sm font-medium">Papéis</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {ROLE_OPTIONS.map((role, index) => (
          <label key={role} className="flex min-h-9 items-center gap-2 text-sm">
            <input
              id={index === 0 ? `${idPrefix}-roles` : undefined}
              type="checkbox"
              className="size-4"
              checked={value.includes(role)}
              onChange={(event) =>
                onChange(event.target.checked ? [...value, role] : value.filter((r) => r !== role))
              }
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

function CreateAccountForm() {
  const router = useRouter();
  const uid = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<Role[]>(["docente"]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<User> | null>(null);
  useFocusInvalidField(result, uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await runAdminAction(() =>
      createAccountFn({ data: { email, name, code, roles, password } }),
    );
    setPending(false);
    setResult(response);
    if (response.ok) {
      setEmail("");
      setName("");
      setCode("");
      setPassword("");
      setRoles(["docente"]);
      await router.invalidate();
    }
  }

  const emailError = fieldError(result, "email");
  const nameError = fieldError(result, "name");
  const codeError = fieldError(result, "code");
  const passwordError = fieldError(result, "password");
  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border bg-surface p-4">
      <h2 className="text-xl font-semibold">Nova conta</h2>
      <GeneralError message={generalError(result)} />
      {result?.ok === true && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Conta criada.
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-email`}>E-mail</Label>
        <Input
          id={`${uid}-email`}
          type="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={emailError === undefined ? undefined : true}
          aria-describedby={emailError === undefined ? undefined : `${uid}-email-error`}
        />
        <FieldError id={`${uid}-email-error`} message={emailError} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-name`}>Nome</Label>
        <Input
          id={`${uid}-name`}
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError === undefined ? undefined : true}
          aria-describedby={nameError === undefined ? undefined : `${uid}-name-error`}
        />
        <FieldError id={`${uid}-name-error`} message={nameError} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-code`}>Sigla (opcional)</Label>
        <Input
          id={`${uid}-code`}
          maxLength={16}
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={codeError === undefined ? undefined : true}
          aria-describedby={codeError === undefined ? undefined : `${uid}-code-error`}
        />
        <FieldError id={`${uid}-code-error`} message={codeError} />
      </div>
      <RolesField
        idPrefix={uid}
        value={roles}
        onChange={setRoles}
        error={fieldError(result, "roles")}
      />
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-password`}>Senha inicial (mínimo 10 caracteres)</Label>
        <Input
          id={`${uid}-password`}
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={passwordError === undefined ? undefined : true}
          aria-describedby={passwordError === undefined ? undefined : `${uid}-password-error`}
        />
        <FieldError id={`${uid}-password-error`} message={passwordError} />
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:justify-self-start">
        {pending ? "Criando…" : "Criar conta"}
      </Button>
    </form>
  );
}

function EditAccountForm({ user, onDone }: { user: User; onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(user.name);
  const [code, setCode] = useState(user.code ?? "");
  const [roles, setRoles] = useState<Role[]>(user.roles);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<User> | null>(null);
  useFocusInvalidField(result, uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await runAdminAction(() =>
      updateAccountFn({ data: { id: user.id, name, code, roles } }),
    );
    setPending(false);
    setResult(response);
    if (response.ok) {
      await router.invalidate();
      onDone();
    }
  }

  const nameError = fieldError(result, "name");
  const codeError = fieldError(result, "code");
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-3 border-t pt-3">
      <GeneralError message={generalError(result)} />
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-name`}>Nome</Label>
        <Input
          id={`${uid}-name`}
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError === undefined ? undefined : true}
          aria-describedby={nameError === undefined ? undefined : `${uid}-name-error`}
        />
        <FieldError id={`${uid}-name-error`} message={nameError} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-code`}>Sigla (opcional)</Label>
        <Input
          id={`${uid}-code`}
          maxLength={16}
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={codeError === undefined ? undefined : true}
          aria-describedby={codeError === undefined ? undefined : `${uid}-code-error`}
        />
        <FieldError id={`${uid}-code-error`} message={codeError} />
      </div>
      <RolesField
        idPrefix={uid}
        value={roles}
        onChange={setRoles}
        error={fieldError(result, "roles")}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ResetPasswordForm({
  user,
  isSelf,
  onDone,
}: {
  user: User;
  isSelf: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<null> | null>(null);
  useFocusInvalidField(result, uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await runAdminAction(() =>
      resetAccountPasswordFn({ data: { id: user.id, password } }),
    );
    setPending(false);
    setResult(response);
    if (response.ok) {
      setPassword("");
      // Redefinir a própria senha encerra a sessão atual: vai ao login em vez de recarregar.
      if (isSelf) {
        await router.navigate({ to: "/entrar" });
        return;
      }
      await router.invalidate();
      onDone();
    }
  }

  const passwordError = fieldError(result, "password");
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-3 border-t pt-3">
      <GeneralError message={generalError(result)} />
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-password`}>Nova senha (mínimo 10 caracteres)</Label>
        <Input
          id={`${uid}-password`}
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={passwordError === undefined ? undefined : true}
          aria-describedby={passwordError === undefined ? undefined : `${uid}-password-error`}
        />
        <FieldError id={`${uid}-password-error`} message={passwordError} />
        <p className="text-sm text-muted-foreground">
          As sessões abertas desta conta serão encerradas.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando…" : "Redefinir senha"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

type Mode = "view" | "edit" | "password";

function AccountItem({ user, isSelf }: { user: User; isSelf: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<User> | null>(null);

  async function toggleActive() {
    setPending(true);
    const response = await runAdminAction(() =>
      setAccountActiveFn({ data: { id: user.id, active: !user.active } }),
    );
    setPending(false);
    setResult(response);
    if (!response.ok) return;
    // Desativar a si mesmo encerra a sessão atual: vai ao login em vez de recarregar.
    if (isSelf && user.active) await router.navigate({ to: "/entrar" });
    else await router.invalidate();
  }

  const toView = () => setMode("view");
  return (
    <li className="rounded-lg border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium">{user.name}</p>
          <p className="break-all text-sm text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-sm">
            {user.roles.map((role) => ROLE_LABELS[role]).join(", ")}
            {user.code !== null && ` · Sigla ${user.code}`}
          </p>
        </div>
        <span
          className={
            user.active
              ? "rounded-md border px-2 py-1 text-xs"
              : "rounded-md border bg-occ-conflict px-2 py-1 text-xs"
          }
        >
          {user.active ? "Ativa" : "Inativa"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={mode === "edit"}
          onClick={() => setMode(mode === "edit" ? "view" : "edit")}
        >
          Editar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={mode === "password"}
          onClick={() => setMode(mode === "password" ? "view" : "password")}
        >
          Redefinir senha
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={toggleActive}>
          {user.active ? "Desativar" : "Reativar"}
        </Button>
      </div>
      {result !== null && !result.ok && (
        <p role="alert" className="mt-3 rounded-lg border bg-occ-conflict p-3 text-sm">
          {result.message}
        </p>
      )}
      {mode === "edit" && <EditAccountForm user={user} onDone={toView} />}
      {mode === "password" && <ResetPasswordForm user={user} isSelf={isSelf} onDone={toView} />}
    </li>
  );
}

export function AccountsManager({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  return (
    <div className="grid gap-6">
      <CreateAccountForm />
      <section aria-labelledby="accounts-title" className="grid gap-3">
        <h2 id="accounts-title" className="text-xl font-semibold">
          Contas ({users.length})
        </h2>
        <ul className="grid gap-3">
          {users.map((user) => (
            <AccountItem key={user.id} user={user} isSelf={user.id === currentUserId} />
          ))}
        </ul>
      </section>
    </div>
  );
}
