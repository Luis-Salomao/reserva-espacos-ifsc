import { createFileRoute, redirect } from "@tanstack/react-router";
import { guardAdmin } from "./-admin-guard";

export const Route = createFileRoute("/admin/")({
  beforeLoad: ({ context }) => {
    guardAdmin(context, "/admin");
    throw redirect({ to: "/admin/contas" });
  },
});
