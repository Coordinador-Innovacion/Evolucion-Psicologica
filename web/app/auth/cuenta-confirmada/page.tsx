import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, LogIn } from "lucide-react";

export const metadata: Metadata = { title: "Cuenta confirmada" };

export default function CuentaConfirmadaPage() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card sm:p-8">
      <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
        <CheckCircle2 className="h-7 w-7" />
      </span>
      <h2 className="font-display text-xl font-bold text-ink">
        Cuenta confirmada
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        Tu correo fue verificado correctamente. Ya puedes iniciar sesión con tu
        cuenta.
      </p>

      <Link
        href="/auth/login"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong"
      >
        <LogIn className="h-4 w-4" />
        Ir a iniciar sesión
      </Link>
    </div>
  );
}
