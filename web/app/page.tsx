"use client";

import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { HomeNav } from "@/components/HomeNav";
import { Icon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/feedback";
import {
  NAV_ITEMS,
  ROLE_LABELS,
  canSeeNavItem,
} from "@/components/layout/nav";

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
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Evolución Psicológica
        </h1>
        <p className="mt-3 text-base text-slate-500">
          Sistema de seguimiento psicológico estudiantil
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-card">
          <p className="mb-5 text-sm font-medium text-slate-600">
            Acceso rápido a los módulos
          </p>
          <HomeNav />
        </div>
        <p className="mt-8 text-sm text-slate-400">
          <Link
            href="/auth/login"
            className="font-medium text-indigo-600 hover:text-indigo-700"
          >
            Iniciar sesión
          </Link>
        </p>
      </main>
    </div>
  );
}

function Dashboard({ fullName, role }: { fullName: string; role: string }) {
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName;
  const items = NAV_ITEMS.filter(
    (item) => item.href !== "/" && canSeeNavItem(item, role)
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 px-6 py-7 text-white shadow-card sm:px-8">
        <p className="text-sm text-indigo-200">
          {ROLE_LABELS[role] ?? role}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Hola, {firstName}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm text-indigo-100/90">
          Bienvenido a tu panel. Selecciona un módulo para comenzar a trabajar.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Módulos
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => {
            const tones = [
              "bg-indigo-100 text-indigo-600",
              "bg-emerald-100 text-emerald-600",
              "bg-amber-100 text-amber-600",
              "bg-sky-100 text-sky-600",
              "bg-violet-100 text-violet-600",
              "bg-rose-100 text-rose-600",
            ];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-start gap-4 rounded-xl border border-line bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-pop"
              >
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                    tones[index % tones.length]
                  }`}
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                    {item.label}
                    <Icon
                      name="chevronRight"
                      className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                    />
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const { profile, loading } = useUser();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner className="h-7 w-7 text-indigo-600" />
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    );
  }

  if (!profile) {
    return <Landing />;
  }

  return (
    <Dashboard
      fullName={profile.full_name ?? ""}
      role={profile.role ?? ""}
    />
  );
}
