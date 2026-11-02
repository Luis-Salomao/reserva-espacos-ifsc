/** Mensagem de erro de um campo: anunciada ao aparecer (role=alert) e ligada ao campo por id. */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
