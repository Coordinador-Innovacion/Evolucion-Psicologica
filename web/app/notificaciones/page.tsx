"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, CalendarClock, RefreshCcw, Shuffle } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { loadAlerts, type AlertItem } from "@/lib/alerts";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";

const ICONS = {
  licencia: CalendarClock,
  transferencia: Shuffle,
  promocion: RefreshCcw,
} as const;

export default function NotificacionesPage() {
  const { profile, loading } = useUser();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  useEffect(() => {
    if (!profile) {
      if (loading) return;
      const id = requestAnimationFrame(() => setLoadingAlerts(false));
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    loadAlerts(profile.role)
      .then((alerts) => {
        if (!cancelled) setItems(alerts);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAlerts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, loading]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notificaciones"
        subtitle="Historial de alertas accionables (licencias, transferencias y promociones)"
        breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Notificaciones" }]}
      />

      {loadingAlerts ? (
        <SkeletonList rows={5} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-4 py-12 text-center">
          <BellOff className="mx-auto h-7 w-7 text-ink-muted" />
          <p className="mt-3 text-sm text-ink-muted">
            No hay alertas pendientes. Te avisaremos cuando algo requiera tu
            atención.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            return (
              <li key={item.id} className="flex items-start gap-3 px-4 py-4">
                <span
                  className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    item.tone === "rose"
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                      : item.tone === "amber"
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <StatusPill tone={item.tone === "blue" ? "blue" : item.tone}>
                      {item.kind}
                    </StatusPill>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-muted">{item.detail}</p>
                  {item.created && (
                    <p className="mt-1 text-xs text-ink-muted">
                      {new Date(item.created).toLocaleDateString("es-PE")}
                    </p>
                  )}
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand-600 transition hover:border-brand-500/40"
                >
                  Gestionar
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
