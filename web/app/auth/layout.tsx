import type { ReactNode } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { APP_NAME, APP_TAGLINE, APP_PHRASE } from "@/lib/app";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-canvas lg:flex-row">
      <aside className="relative hidden w-full max-w-md flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-800 p-10 text-white lg:flex lg:max-w-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_55%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 400 400"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-20"
          fill="none"
        >
          <circle cx="320" cy="90" r="140" stroke="white" strokeWidth="1" />
          <circle cx="320" cy="90" r="96" stroke="white" strokeWidth="1" />
          <path
            d="M0 300c60-40 120 20 180-20s120-60 220-10"
            stroke="white"
            strokeWidth="1.5"
          />
        </svg>

        <Link href="/" className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <Activity className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-display text-lg font-bold">{APP_NAME}</span>
            <span className="block text-xs text-white/70">{APP_TAGLINE}</span>
          </span>
        </Link>

        <div className="relative">
          <p className="max-w-sm font-display text-2xl font-semibold leading-snug">
            {APP_PHRASE}
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Seguimiento psicológico estudiantil con roles claros, encuestas,
            casos y analítica institucional.
          </p>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </aside>

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-950/30 lg:hidden">
              <Activity className="h-7 w-7" />
            </span>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              Evolución Psicológica
            </h1>
            <p className="mt-1 text-sm text-ink-muted">Acceso al sistema</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
