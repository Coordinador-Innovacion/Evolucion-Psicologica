"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { updatePassword } from "@/lib/actions/auth";

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

function NuevaClaveForm() {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "update";

  return (
    <form className="mt-8 space-y-6" action={updatePassword}>
      {hasError && (
        <p className="text-sm text-red-600" role="alert">
          No se pudo actualizar la contraseña. Solicite el enlace de nuevo.
        </p>
      )}
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700"
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
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Guardar contraseña
      </button>

      <div className="text-center text-sm">
        <Link href="/auth/login" className="text-blue-600 hover:text-blue-500">
          Volver a iniciar sesión
        </Link>
      </div>
    </form>
  );
}

export default function NuevaClavePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900">
            Evolución Psicológica
          </h1>
          <h2 className="mt-2 text-center text-sm text-gray-600">
            Nueva contraseña
          </h2>
        </div>
        <Suspense>
          <NuevaClaveForm />
        </Suspense>
      </div>
    </div>
  );
}
