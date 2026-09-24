"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { resetPassword } from "@/lib/actions/auth";

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

function RecuperarForm() {
  const searchParams = useSearchParams();
  const sent = searchParams.get("sent") === "1";

  if (sent) {
    return (
      <div className="mt-6 rounded-2xl border border-line bg-white p-6 text-center shadow-card">
        <p className="text-sm text-slate-700">
          Si el correo existe, recibirá un enlace para restablecer su
          contraseña.
        </p>
        <Link
          href="/auth/login"
          className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mt-6 space-y-5 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8"
      action={resetPassword}
    >
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700"
        >
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          placeholder="correo@ejemplo.com"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Enviar enlace de recuperación
      </button>

      <div className="text-center text-sm">
        <Link
          href="/auth/login"
          className="text-indigo-600 hover:text-indigo-500"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    </form>
  );
}

export default function RecuperarPage() {
  return (
    <div>
      <h2 className="text-center text-lg font-semibold text-slate-900">
        Recuperar contraseña
      </h2>
      <p className="mt-1 text-center text-sm text-slate-500">
        Te enviaremos un enlace para crear una nueva contraseña
      </p>
      <Suspense>
        <RecuperarForm />
      </Suspense>
    </div>
  );
}
