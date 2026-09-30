import Link from "next/link";
import { AlertCircle, LockKeyhole } from "lucide-react";
import { signIn } from "@/lib/actions/auth";
import { PasswordField } from "@/components/auth/PasswordField";

const inputClass =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; expired?: string }>;
}) {
  const params = await searchParams;

  return (
    <div>
      <div className="mb-6 flex items-center justify-center gap-2 text-ink-soft">
        <LockKeyhole className="h-4 w-4 text-brand-600" />
        <h2 className="font-display text-xl font-bold text-ink">
          Iniciar sesión
        </h2>
      </div>
      <p className="mb-6 text-center text-sm text-ink-muted">
        Accede con tu correo institucional
      </p>

      {params.error === "credentials" && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          No pudimos iniciar sesión. Verifica tus datos e inténtalo de nuevo.
        </p>
      )}
      {params.error === "auth" && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
        >
          Tu sesión no se pudo completar. Inicia sesión nuevamente.
        </p>
      )}
      {params.expired === "1" && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        >
          Tu sesión expiró. Inicia sesión para continuar.
        </p>
      )}
      {params.reset === "1" && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          Contraseña actualizada. Inicia sesión con tu nueva contraseña.
        </p>
      )}

      <form
        className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8"
        action={signIn}
      >
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-ink-soft"
          >
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`mt-1 ${inputClass}`}
            placeholder="correo@ejemplo.com"
          />
        </div>

        <PasswordField id="password" autoComplete="current-password" />

        <button
          type="submit"
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          Ingresar
        </button>

        <div className="space-y-2 text-center text-sm">
          <Link
            href="/auth/recuperar"
            className="text-brand-600 transition hover:text-brand-600"
          >
            ¿Olvidaste tu contraseña?
          </Link>
          <div>
            <Link
              href="/auth/registro"
              className="text-brand-600 transition hover:text-brand-600"
            >
              ¿No tienes cuenta? Registrarme como docente
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
