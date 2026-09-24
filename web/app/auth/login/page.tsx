import { signIn } from "@/lib/actions/auth";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div>
      <h2 className="text-center text-lg font-semibold text-slate-900">
        Iniciar sesión
      </h2>
      <p className="mt-1 text-center text-sm text-slate-500">
        Accede con tu correo institucional
      </p>

      <form
        className="mt-6 space-y-5 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8"
        action={signIn}
      >
        <div className="space-y-4">
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
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Ingresar
          </button>

          <div className="text-center text-sm space-y-2">
            <div>
              <Link
                href="/auth/recuperar"
                className="text-indigo-600 hover:text-indigo-500"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div>
              <Link
                href="/auth/registro"
                className="text-indigo-600 hover:text-indigo-500"
              >
                ¿No tienes cuenta? Regístrate
              </Link>
            </div>
          </div>
      </form>
    </div>
  );
}
