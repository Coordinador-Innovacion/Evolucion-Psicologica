"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { signOut } from "@/lib/actions/auth";
import { Icon } from "@/components/ui/icons";
import {
  NAV_ITEMS,
  ROLE_LABELS,
  canSeeNavItem,
  pageTitleFor,
  type NavItem,
} from "./nav";

const PLAIN_PREFIXES = ["/auth/", "/encuesta/"];

function initialsOf(name: string | null | undefined): string {
  if (!name) return "…";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase() || "…";
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  pathname,
  loading,
  role,
  onClose,
}: {
  pathname: string;
  loading: boolean;
  role: string | null | undefined;
  onClose?: () => void;
}) {
  const items = loading
    ? null
    : NAV_ITEMS.filter((item) => canSeeNavItem(item, role));

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onClose}
        className="flex h-16 items-center gap-3 border-b border-white/5 px-5"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-950/40">
          <Icon name="pulse" className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">
            Evolución Psicológica
          </span>
          <span className="block text-[11px] text-slate-400">
            Psicología Escolar
          </span>
        </span>
        {onClose && (
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        )}
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {[6, 8, 7, 6, 8].map((w, i) => (
              <div
                key={i}
                className="h-9 rounded-lg bg-white/5"
                style={{ width: `${w * 10}%` }}
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {items?.map((item: NavItem) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "flex items-center gap-3 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-950/40"
                        : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                    }
                  >
                    <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-white/5 px-5 py-4">
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Cada proceso cuenta. Tu trabajo hace la diferencia.
        </p>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white"
        >
          <Icon name="logout" className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, loading } = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dateLabel] = useState(() =>
    new Date().toLocaleDateString("es-PE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );

  const isPlain = PLAIN_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isLanding = pathname === "/" && (loading || !profile);

  if (isPlain || isLanding) {
    return <>{children}</>;
  }

  const role = profile?.role ?? null;
  const title = pageTitleFor(pathname);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-sidebar lg:block">
        <SidebarContent
          pathname={pathname}
          loading={loading}
          role={role}
        />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/50"
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar shadow-2xl">
            <SidebarContent
              pathname={pathname}
              loading={loading}
              role={role}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menú"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900">
                {title}
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Evolución Psicológica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {dateLabel && (
              <span className="hidden items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-500 md:inline-flex">
                <Icon name="calendar" className="h-3.5 w-3.5" />
                {dateLabel}
              </span>
            )}
            <div className="flex items-center gap-3">
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-medium text-slate-900">
                  {profile?.full_name || "…"}
                </div>
                <div className="text-xs text-slate-500">
                  {role ? ROLE_LABELS[role] ?? role : "…"}
                </div>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white">
                {initialsOf(profile?.full_name)}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
