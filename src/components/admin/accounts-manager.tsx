import { useRouter } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { ChoiceCard } from "#/components/ds";
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
import { AdminDialog } from "./admin-dialog";
import { AdminTable, type Column, nextSort, type SortState, sortRows } from "./admin-table";
import { FieldError } from "./field-error";
import { type RowAction, RowActions, rowActionIds, StatusTag } from "./row-actions";
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
    <form onSubmit={onSubmit} className="grid gap-3 overflow-y-auto p-4">
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
    <form onSubmit={onSubmit} className="grid gap-3 overflow-y-auto p-4">
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
    <form onSubmit={onSubmit} className="grid gap-3 overflow-y-auto p-4">
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
    <form onSubmit={onSubmit} className="grid gap-3 overflow-y-auto p-4">
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

type Mode = "edit" | "reset" | "activate" | "merge";

const DIALOG_TITLES: Record<Mode, string> = {
  edit: "Editar conta",
  reset: "Redefinir senha",
  activate: "Ativar conta",
  merge: "Fundir conta",
};

type OpenDialog = { user: User; mode: Mode };

function statusTags(user: User) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.placeholder && <StatusTag dashed>Não ativada</StatusTag>}
      {!user.placeholder && user.active && <StatusTag tone="free">Ativa</StatusTag>}
      {!user.active && <StatusTag>Inativa</StatusTag>}
    </div>
  );
}

/** Colunas da tabela; no celular as células empilham e a coluna de ações fica ao lado do nome. */
function accountColumns(actionsFor: (user: User) => ReactNode): Column<User>[] {
  return [
    {
      key: "name",
      header: "Nome",
      sortValue: (user) => user.name,
      headerClassName: "md:w-[22%]",
      cell: (user) => (
        <span className="block font-medium wrap-anywhere md:truncate" title={user.name}>
          {user.name}
        </span>
      ),
    },
    {
      key: "email",
      header: "E-mail",
      headerClassName: "md:w-[26%]",
      cell: (user) => (
        <span className="block text-muted-foreground wrap-anywhere md:truncate" title={user.email}>
          {user.email}
        </span>
      ),
    },
    {
      key: "code",
      header: "Sigla",
      headerClassName: "md:w-[8%]",
      cellClassName: (user) => (user.code === null ? "max-md:hidden" : ""),
      cell: (user) => (
        <>
          <span className="text-muted-foreground md:hidden">Sigla </span>
          {user.code ?? <span aria-hidden="true">—</span>}
        </>
      ),
    },
    {
      key: "roles",
      header: "Papéis",
      headerClassName: "md:w-[22%]",
      cell: (user) => {
        const text = user.roles.map((role) => ROLE_LABELS[role]).join(", ");
        return (
          <span className="block wrap-anywhere md:truncate" title={text}>
            {text}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      headerClassName: "md:w-[12%]",
      cellClassName: "mt-1 md:mt-0",
      cell: statusTags,
    },
    {
      key: "actions",
      header: "Ações",
      headerClassName: "text-right md:w-24",
      cellClassName: "col-start-2 row-start-1 row-span-5 self-start md:self-auto",
      cell: actionsFor,
    },
  ];
}

function AccountsTable({
  users,
  currentUserId,
  mergeTargets,
}: {
  users: readonly User[];
  currentUserId: string;
  /** Contas ativadas e ativas que podem receber as aulas de uma fantasma. */
  mergeTargets: readonly User[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);

  async function toggleActive(user: User) {
    setPendingId(user.id);
    setError(null);
    const response = await runAdminAction(() =>
      setAccountActiveFn({ data: { id: user.id, active: !user.active } }),
    );
    setPendingId(null);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    // Desativar a si mesmo encerra a sessão atual: vai ao login em vez de recarregar.
    if (user.id === currentUserId && user.active) await router.navigate({ to: "/entrar" });
    else await router.invalidate();
  }

  const open = (user: User, mode: Mode) => () => setDialog({ user, mode });
  const columns = accountColumns((user) => {
    const actions: RowAction[] = [
      ...(user.placeholder
        ? [
            { label: "Ativar", onSelect: open(user, "activate") },
            { label: "Fundir", onSelect: open(user, "merge") },
          ]
        : []),
      { label: "Redefinir senha", onSelect: open(user, "reset") },
      {
        label: user.active ? "Desativar" : "Reativar",
        disabled: pendingId === user.id,
        onSelect: () => void toggleActive(user),
      },
    ];
    return (
      <RowActions rowId={user.id} name={user.name} onEdit={open(user, "edit")} actions={actions} />
    );
  });

  const toView = () => setDialog(null);
  const ids = dialog === null ? null : rowActionIds(dialog.user.id);
  return (
    <>
      {error !== null && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <AdminTable
        caption="Contas"
        rows={sortRows(users, columns, sort)}
        columns={columns}
        rowKey={(user) => user.id}
        sort={sort}
        onSort={(key) => setSort((current) => nextSort(current, key))}
      />
      <AdminDialog
        open={dialog !== null}
        title={dialog === null ? "" : DIALOG_TITLES[dialog.mode]}
        description={dialog === null ? undefined : `${dialog.user.name} (${dialog.user.email})`}
        onClose={toView}
        returnFocusId={dialog?.mode === "edit" ? ids?.edit : ids?.more}
      >
        {dialog?.mode === "edit" && (
          <EditAccountForm key={dialog.user.id} user={dialog.user} onDone={toView} />
        )}
        {dialog?.mode === "reset" && (
          <ResetPasswordForm
            key={dialog.user.id}
            user={dialog.user}
            isSelf={dialog.user.id === currentUserId}
            onDone={toView}
          />
        )}
        {dialog?.mode === "activate" && (
          <ActivateAccountForm key={dialog.user.id} user={dialog.user} onDone={toView} />
        )}
        {dialog?.mode === "merge" && (
          <MergeAccountForm
            key={dialog.user.id}
            user={dialog.user}
            targets={mergeTargets}
            onDone={toView}
          />
        )}
      </AdminDialog>
    </>
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
          <AccountsTable
            users={visible}
            currentUserId={currentUserId}
            mergeTargets={mergeTargets}
          />
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
