import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";
import { ChoiceCard, Tag } from "#/components/ds";
import { Card, Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { Role, User } from "#/domain/user";
import {
  activatePlaceholderAccountFn,
  createAccountFn,
  mergePlaceholderAccountFn,
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
    <Notice tone="error" role="alert">
      {message}
    </Notice>
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
      <div className="flex flex-wrap gap-2">
        {ROLE_OPTIONS.map((role, index) => (
          <ChoiceCard
            key={role}
            type="checkbox"
            title={ROLE_LABELS[role]}
            id={index === 0 ? `${idPrefix}-roles` : undefined}
            checked={value.includes(role)}
            onChange={(event) =>
              onChange(event.target.checked ? [...value, role] : value.filter((r) => r !== role))
            }
          />
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
    <Card>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
        <h2 className="text-lg font-semibold tracking-tight sm:col-span-2">Nova conta</h2>
        <div className="sm:col-span-2">
          <GeneralError message={generalError(result)} />
        </div>
        {result?.ok === true && (
          <div className="sm:col-span-2">
            <Notice tone="ok" role="status">
              Conta criada.
            </Notice>
          </div>
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
        <div className="sm:col-span-2">
          <RolesField
            idPrefix={uid}
            value={roles}
            onChange={setRoles}
            error={fieldError(result, "roles")}
          />
        </div>
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
    </Card>
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

/** Ativa uma conta fantasma: e-mail real (vem o presumido) e senha inicial. */
function ActivateAccountForm({ user, onDone }: { user: User; onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<User> | null>(null);
  useFocusInvalidField(result, uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await runAdminAction(() =>
      activatePlaceholderAccountFn({ data: { id: user.id, email, password } }),
    );
    setPending(false);
    setResult(response);
    if (response.ok) {
      await router.invalidate();
      onDone();
    }
  }

  const emailError = fieldError(result, "email");
  const passwordError = fieldError(result, "password");
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-3 border-t pt-3">
      <GeneralError message={generalError(result)} />
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-email`}>E-mail da pessoa</Label>
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Ativando…" : "Ativar conta"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Funde a fantasma numa conta ativada: as aulas e os vínculos do XML vão para ela. */
function MergeAccountForm({
  user,
  targets,
  onDone,
}: {
  user: User;
  targets: readonly User[];
  onDone: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [targetId, setTargetId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AdminResponse<null> | null>(null);
  useFocusInvalidField(result, uid);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await runAdminAction(() =>
      mergePlaceholderAccountFn({ data: { id: user.id, targetId } }),
    );
    setPending(false);
    setResult(response);
    if (response.ok) await router.invalidate();
  }

  const targetError = fieldError(result, "targetId");
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-3 border-t pt-3">
      <GeneralError message={generalError(result)} />
      <div className="grid gap-2">
        <Label htmlFor={`${uid}-targetId`}>Conta que recebe as aulas</Label>
        <select
          id={`${uid}-targetId`}
          required
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          aria-invalid={targetError === undefined ? undefined : true}
          aria-describedby={`${uid}-targetId-hint${targetError === undefined ? "" : ` ${uid}-targetId-error`}`}
          className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <option value="">Escolha uma conta</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name} ({target.email})
            </option>
          ))}
        </select>
        <FieldError id={`${uid}-targetId-error`} message={targetError} />
        <p id={`${uid}-targetId-hint`} className="text-sm text-muted-foreground">
          As aulas e os vínculos do XML desta conta passam para a conta escolhida, e esta conta é
          apagada.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Fundindo…" : "Fundir"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

type Mode = "view" | "edit" | "password" | "activate" | "merge";

function AccountItem({
  user,
  isSelf,
  mergeTargets,
}: {
  user: User;
  isSelf: boolean;
  /** Contas ativadas e ativas que podem receber as aulas de uma fantasma. */
  mergeTargets: readonly User[];
}) {
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
    <li>
      <Card compact>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words font-medium">{user.name}</p>
            <p className="break-all text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-sm">
              {user.roles.map((role) => ROLE_LABELS[role]).join(", ")}
              {user.code !== null && ` · Sigla ${user.code}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {user.placeholder && <Tag tone="neutral">Não ativada</Tag>}
            <Tag tone={user.active ? "free" : "conflict"}>{user.active ? "Ativa" : "Inativa"}</Tag>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {user.placeholder && (
            <>
              <Button
                type="button"
                size="sm"
                aria-expanded={mode === "activate"}
                onClick={() => setMode(mode === "activate" ? "view" : "activate")}
              >
                Ativar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={mode === "merge"}
                onClick={() => setMode(mode === "merge" ? "view" : "merge")}
              >
                Fundir
              </Button>
            </>
          )}
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={toggleActive}
          >
            {user.active ? "Desativar" : "Reativar"}
          </Button>
        </div>
        {result !== null && !result.ok && (
          <Notice tone="error" role="alert" className="mt-3">
            {result.message}
          </Notice>
        )}
        {mode === "edit" && <EditAccountForm user={user} onDone={toView} />}
        {mode === "password" && <ResetPasswordForm user={user} isSelf={isSelf} onDone={toView} />}
        {mode === "activate" && <ActivateAccountForm user={user} onDone={toView} />}
        {mode === "merge" && (
          <MergeAccountForm user={user} targets={mergeTargets} onDone={toView} />
        )}
      </Card>
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
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "placeholder">(
    "all",
  );
  const normalizedQuery = normalizeAccountSearch(query);
  const visible = users.filter((user) => {
    const matchesQuery =
      normalizedQuery === "" ||
      [user.name, user.email, user.code ?? ""].some((value) =>
        normalizeAccountSearch(value).includes(normalizedQuery),
      );
    const matchesRole = roleFilter === "all" || user.roles.includes(roleFilter);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "placeholder"
        ? user.placeholder
        : statusFilter === "active"
          ? user.active && !user.placeholder
          : !user.active && !user.placeholder);
    return matchesQuery && matchesRole && matchesStatus;
  });
  const hasFilters = query !== "" || roleFilter !== "all" || statusFilter !== "all";
  const mergeTargets = users.filter((user) => !user.placeholder && user.active);

  function clearFilters() {
    setQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  }

  return (
    <div className="grid gap-4">
      <CreateAccountForm />
      <section aria-labelledby="accounts-title" className="grid gap-2">
        <h2 id="accounts-title" className="text-lg font-semibold tracking-tight">
          Contas ({visible.length})
        </h2>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_minmax(10rem,14rem)]">
          <div className="grid min-w-0 gap-1">
            <Label htmlFor="accounts-search">Buscar por nome, e-mail ou sigla</Label>
            <Input
              id="accounts-search"
              type="search"
              autoComplete="off"
              placeholder="Nome, e-mail ou sigla"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="accounts-role">Filtrar por papel</Label>
            <select
              id="accounts-role"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as Role | "all")}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <option value="all">Todos os papéis</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="accounts-status">Filtrar por status</Label>
            <select
              id="accounts-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
              <option value="placeholder">Não ativadas</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Exibindo {visible.length} de {users.length} contas
          </p>
          {hasFilters && (
            <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
        </div>
        {visible.length === 0 ? (
          <Notice>Nenhuma conta encontrada.</Notice>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {visible.map((user) => (
              <AccountItem
                key={user.id}
                user={user}
                isSelf={user.id === currentUserId}
                mergeTargets={mergeTargets}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function normalizeAccountSearch(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
