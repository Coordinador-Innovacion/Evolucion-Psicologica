"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Moon, Settings, Sun, UserRound } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useTheme } from "@/hooks/useTheme";
import { signOut } from "@/lib/actions/auth";
import { ROLE_LABELS } from "./nav";
import { Avatar } from "@/components/ui/avatar";

export function UserMenu() {
  const { profile } = useUser();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const role = profile?.role ?? null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Menú de usuario"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-line bg-surface p-1 pr-2 shadow-sm transition hover:border-brand-500/40"
      >
        <Avatar name={profile?.full_name} size="sm" />
        <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">
              {profile?.full_name || "…"}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {role ? ROLE_LABELS[role] ?? role : "…"}
            </p>
          </div>

          <div className="p-1.5">
            <Link
              href="/configuracion"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-primary-soft hover:text-primary"
            >
              <UserRound className="h-4 w-4" />
              Perfil
            </Link>
            <Link
              href="/configuracion"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-primary-soft hover:text-primary"
            >
              <Settings className="h-4 w-4" />
              Configuración
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-primary-soft hover:text-primary"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              {theme === "dark" ? "Modo claro" : "Modo oscuro"}
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
