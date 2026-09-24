"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { updatePassword } from "@/lib/actions/auth";

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

function NuevaClaveForm() {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "update";

  return (
    <form
      className="mt-6 space-y-5 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8"
      action={updatePassword}
    >
      {hasError && (
        <p className="text-sm text-rose-600" role="alert">
          No se pudo actualizar la contraseña. Solicite el enlace de nuevo.
        </p>
      )}
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-700"
        >
          Nueva contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
          placeholder="Mínimo 8 caracteres"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Guardar contraseña
      </button>

      <div className="text-center text-sm">
        <Link href="/auth/login" className="text-indigo-600 hover:text-indigo-500">
          Volver a iniciar sesión
        </Link>
      </div>
    </form>
  );
}

export default function NuevaClavePage() {
  return (
    <div>
      <h2 className="text-center text-lg font-semibold text-slate-900">
        Nueva contraseña
      </h2>
      <p className="mt-1 text-center text-sm text-slate-500">
        Define una contraseña segura para tu cuenta
      </p>
      <Suspense>
        <NuevaClaveForm />
      </Suspense>
    </div>
  );
}
