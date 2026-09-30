"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useInstitutionScope } from "@/hooks/useInstitutionScope";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState, ErrorBanner, LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";
import { LOTE_LABELS, LOTE_TONES, RECUPERABLES, readCounts } from "@/lib/promocion";
import type { Json, PromocionLoteStatus } from "@/types/supabase";

const PAGE_SIZE = 20;

type LoteRow = {
  id: string;
  institution_id: string;
  origin_year: number;
  destination_year: number;
  status: PromocionLoteStatus;
  started_at: string;
  completed_at: string | null;
  counts: Json;
  institutions: { name: string } | null;
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * PRO-01 — Lista de lotes de promoción con estado, contexto y conteos.
 * Aviso destacado si hay un lote recuperable (preparado/en ejecución/
 * interrumpido/fallido).
 */
export default function PromocionPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const scope = useInstitutionScope(profile?.institution_id, isGlobal);

  const [lotes, setLotes] = useState<LoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (profileLoading) return;
    if (!can(role, "promocion.gestionar")) return;

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    (async () => {
      try {
        const supabase = createClient();
        let query = supabase
          .from("lotes_promocion")
          .select("*, institutions(name)")
          .order("started_at", { ascending: false })
          .limit(200);
        if (scope) query = query.eq("institution_id", scope);
        const { data, error: fetchError } = await query;
        if (cancelled) return;
        if (fetchError) throw fetchError;
        setLotes((data ?? []) as unknown as LoteRow[]);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("promocion.load", err);
        setError(toUserMessage(err, "Error al cargar los lotes de promoción"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [reloadVersion, profileLoading, role, scope]);

  const recuperables = useMemo(
    () => lotes.filter((l) => RECUPERABLES.includes(l.status)),
    [lotes]
  );

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(lotes.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = lotes.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "promocion.gestionar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para gestionar promociones." />
      </div>
    );
  }

  if (loading) return <LoadingScreen label="Cargando lotes de promoción..." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Promoción masiva"
        subtitle="Preparar → Revisar → Ejecutar. La promoción es siempre manual (DC-011)."
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Promoción" },
        ]}
        actions={
          <Link href="/promocion/nueva" className={buttonClass("primary", "md")}>
            Nueva promoción
          </Link>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {recuperables.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            Hay {recuperables.length} lote{recuperables.length > 1 ? "s" : ""}{" "}
            recuperable{recuperables.length > 1 ? "s" : ""}: continúa desde su detalle.
          </span>
          <Link
            href={`/promocion/${recuperables[0].id}`}
            className="ml-auto shrink-0 font-medium underline"
          >
            Ver lote
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-white shadow-card">
        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin lotes de promoción"
              description="Todavía no se ha preparado ninguna promoción."
              action={
                <Link href="/promocion/nueva" className={buttonClass("primary", "md")}>
                  Nueva promoción
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((lote) => {
              const counts = readCounts(lote.counts);
              return (
                <li
                  key={lote.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {lote.institutions?.name ?? "Institución"} · {lote.origin_year} →{" "}
                      {lote.destination_year}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Inicio {fmtDate(lote.started_at)}
                      {lote.completed_at ? ` · Fin ${fmtDate(lote.completed_at)}` : ""}
                      {typeof counts.total === "number"
                        ? ` · ${counts.total} estudiantes · ${counts.promoted ?? 0} promovidos · ${counts.egreso ?? 0} egreso · ${counts.retired ?? 0} retirados`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill tone={LOTE_TONES[lote.status] ?? "slate"}>
                      {LOTE_LABELS[lote.status] ?? lote.status}
                    </StatusPill>
                    <Link
                      href={`/promocion/${lote.id}`}
                      className={buttonClass("secondary", "sm")}
                    >
                      Ver
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {lotes.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <span>
            {lotes.length} lotes · Página {currentPage + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className={buttonClass("secondary", "sm")}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage(currentPage + 1)}
              className={buttonClass("secondary", "sm")}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
