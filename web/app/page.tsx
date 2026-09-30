"use client";

import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { HomeNav } from "@/components/HomeNav";
import { Icon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/feedback";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_55%)]"
      />
      <main className="relative w-full max-w-xl text-center">
        <span className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-950/30">
          <Icon name="pulse" className="h-8 w-8" />
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Evolución Psicológica
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          Sistema de seguimiento psicológico estudiantil
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <p className="mb-5 text-sm font-medium text-ink-soft">
            Acceso rápido a los módulos
          </p>
          <HomeNav />
        </div>
        <p className="mt-8 text-sm text-ink-muted">
          <Link
            href="/auth/login"
            className="font-medium text-brand-600 hover:text-brand-600"
          >
            Iniciar sesión
          </Link>
        </p>
      </main>
    </div>
  );
}

export default function Home() {
  const { profile, loading } = useUser();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner className="h-7 w-7 text-brand-600" />
        <p className="text-sm text-ink-muted">Cargando...</p>
      </div>
    );
  }

  if (!profile) {
    return <Landing />;
  }

  return <DashboardShell />;
}
