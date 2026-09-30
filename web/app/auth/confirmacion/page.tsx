import type { Metadata } from "next";
import { VerifyEmailActions, VerifyEmailIcon } from "@/components/auth/VerifyEmail";

export const metadata: Metadata = { title: "Cuenta creada" };

export default function ConfirmacionPage() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card sm:p-8">
      <VerifyEmailIcon />
      <h2 className="font-display text-xl font-bold text-ink">Cuenta creada</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Tu cuenta ha sido creada correctamente. Revisa tu correo para confirmar
        tu email antes de iniciar sesión.
      </p>
      <VerifyEmailActions />
    </div>
  );
}
