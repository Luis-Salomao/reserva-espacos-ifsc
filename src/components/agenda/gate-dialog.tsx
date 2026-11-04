import { Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";

export type GateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GateDialog({ open, onOpenChange }: GateDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Entre para reservar</AlertDialogTitle>
          <AlertDialogDescription>
            Qualquer pessoa pode consultar a agenda. Para reservar ou cancelar, entre com sua conta
            institucional.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Agora não</AlertDialogCancel>
          <Button asChild>
            <Link to="/entrar">
              <LogIn className="mr-1.5 size-4" /> Entrar
            </Link>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
