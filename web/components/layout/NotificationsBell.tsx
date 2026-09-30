"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, RefreshCcw, Shuffle } from "lucide-react";
import { loadAlerts, type AlertItem } from "@/lib/alerts";

const ICONS = {
  licencia: CalendarClock,
  transferencia: Shuffle,
  promocion: RefreshCcw,
} as const;

export function NotificationsBell({
  role,
}: {
  role: string | null | undefined;
}) {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAlerts(role)
      .then((alerts) => {
        if (!cancelled) setItems(alerts);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-bell-root]")) setOpen(false);
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

  return (
    <div className="relative" data-bell-root>
      <button
        type="button"
        aria-label={
          items.length > 0
            ? `Alertas pendientes (${items.length})`
            : "Alertas pendientes"
        }
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-sm transition hover:border-brand-500/40 hover:text-brand-600"
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Alertas</p>
            <p className="text-xs text-ink-muted">
              Solo elementos accionables derivados de tus datos.
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">
                No hay alertas pendientes.
              </p>
            ) : (
              items.map((item) => {
                const Icon = ICONS[item.kind];
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 rounded-lg px-3 py-2.5 transition hover:bg-primary-soft"
                  >
                    <span
                      className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                        item.tone === "rose"
                          ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                          : item.tone === "amber"
                            ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                            : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">
                        {item.title}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {item.detail}
                      </span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
          <div className="border-t border-line p-2">
            <Link
              href="/notificaciones"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-center text-xs font-medium text-brand-600 transition hover:bg-primary-soft"
            >
              Ver historial de alertas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
