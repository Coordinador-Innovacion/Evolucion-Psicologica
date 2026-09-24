import Link from "next/link";

export default function ConfirmacionPage() {
  return (
    <div>
      <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
          ✓
        </span>
        <h2 className="text-xl font-semibold text-slate-900">
          Cuenta creada
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Tu cuenta ha sido creada correctamente. Revisa tu correo para
          confirmar tu email antes de iniciar sesión.
        </p>

        <Link
          href="/auth/login"
          className="mt-6 inline-block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    </div>
  );
}
