"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { updatePassword } from "@/lib/actions/auth";
import { PasswordField } from "@/components/auth/PasswordField";

function NuevaClaveForm() {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "update";

  return (
    <form
      className="mt-6 space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8"
      action={updatePassword}
    >
      {hasError && (
        <p className="text-sm text-rose-600" role="alert">
          No se pudo actualizar la contraseña. Solicite el enlace de nuevo.
        </p>
      )}
      <PasswordField
        id="password"
        name="password"
        label="Nueva contraseña"
        autoComplete="new-password"
        placeholder="Mínimo 8 caracteres"
        minLength={8}
        strength
      />

      <button
        type="submit"
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        Guardar contraseña
      </button>

      <div className="text-center text-sm">
        <Link
          href="/auth/login"
          className="font-medium text-brand-600 transition hover:text-brand-600"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    </form>
  );
}

export default function NuevaClavePage() {
  return (
    <div>
      <h2 className="text-center font-display text-xl font-bold text-ink">
        Nueva contraseña
      </h2>
      <p className="mt-1 text-center text-sm text-ink-muted">
        Define una contraseña segura para tu cuenta
      </p>
      <Suspense>
        <NuevaClaveForm />
      </Suspense>
    </div>
  );
}
