"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { PromotionExceptionsPanel } from "@/components/promocion/PromotionExceptionsPanel";
import { EmptyState, ErrorBanner, LoadingScreen, RestrictedAccess, Spinner } from "@/components/ui/feedback";
import type { Json, PromocionLoteStatus } from "@/types/supabase";
import { LOTE_LABELS, LOTE_TONES, readCounts } from "@/lib/promocion";

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
  idempotency_key: string;
  institutions: { name: string } | null;
};

type AccionRow = {
  id: string;
  student_id: string;
  automatic_result: string;
  final_result: string;
  status: string;
  processed_at: string | null;
  error: string | null;
  estudiantes: { first_names: string; last_names: string; document_number: string } | null;
};

type ExcepcionRow = {
  id: string;
  automatic_result: string;
  final_result: string;
  motivo: string;
  usuario_id: string;
  fecha: string;
};

const RESULT_LABELS: Record<string, string> = {
  promoted: "Promovido",
  retained: "Repetidor",
  egreso: "Egreso",
};

const RESULT_TONES: Record<string, StatusTone> = {
  promoted: "green",
  retained: "amber",
  egreso: "blue",
};

const ACCION_TONES: Record<string, StatusTone> = {
  pending: "amber",
  processed: "green",
  error: "rose",
  excluded: "slate",
};

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * PRO-03 — Detalle del lote: conteos, acciones paginadas, excepciones
 * auditadas, línea de tiempo y botón Reanudar para INTERRUPTED/FAILED.
 */
export default function PromocionDetallePage({
  params,
}: {
  params: Promise<{ loteId: string }>;
}) {
  const { loteId } = use(params);
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [lote, setLote] = useState<LoteRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [acciones, setAcciones] = useState<AccionRow[]>([]);
  const [accionesLimit, setAccionesLimit] = useState(PAGE_SIZE);
  const [totalAcciones, setTotalAcciones] = useState(0);
  const [excepciones, setExcepciones] = useState<ExcepcionRow[]>([]);
  const [usuarios, setUsuarios] = useState<Map<string, string>>(new Map());
  const [tab, setTab] = useState("acciones");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!can(role, "promocion.gestionar")) return;

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setNotFound(false);
    });

    (async () => {
      try {
        const supabase = createClient();
        const { data: loteRow, error: loteError } = await supabase
          .from("lotes_promocion")
          .select("*, institutions(name)")
          .eq("id", loteId)
          .maybeSingle();
        if (cancelled) return;
        if (loteError) throw loteError;
        const row = loteRow as unknown as LoteRow | null;
        if (!row) {
          setNotFound(true);
          setLote(null);
          return;
        }
        setLote(row);

        const { data: accionesData, error: accError, count } = await supabase
          .from("acciones_promocion")
          .select(
            "id, student_id, automatic_result, final_result, status, processed_at, error, estudiantes(first_names, last_names, document_number)",
            { count: "exact" }
          )
          .eq("batch_id", loteId)
          .order("created_at", { ascending: true })
          .limit(accionesLimit);
        if (cancelled) return;
        if (accError) throw accError;
        setAcciones((accionesData ?? []) as unknown as AccionRow[]);
        setTotalAcciones(count ?? 0);

        const { data: excData, error: excError } = await supabase
          .from("excepciones_promocion")
          .select(
            "id, automatic_result, final_result, motivo, usuario_id, fecha, acciones_promocion!inner(batch_id)"
          )
          .eq("acciones_promocion.batch_id", loteId)
          .order("fecha", { ascending: false });
        if (cancelled) return;
        if (excError) throw excError;
        const excRows = ((excData ?? []) as unknown as ExcepcionRow[]).map((e) => ({
          id: e.id,
          automatic_result: e.automatic_result,
          final_result: e.final_result,
          motivo: e.motivo,
          usuario_id: e.usuario_id,
          fecha: e.fecha,
        }));
        setExcepciones(excRows);

        const userIds = [...new Set(excRows.map((e) => e.usuario_id))];
        if (userIds.length > 0) {
          const { data: perfData } = await supabase
            .from("perfiles")
            .select("user_id, full_name")
            .in("user_id", userIds);
          if (cancelled) return;
          const map = new Map<string, string>();
          for (const p of (perfData ?? []) as { user_id: string; full_name: string }[]) {
            map.set(p.user_id, p.full_name);
          }
          setUsuarios(map);
        } else {
          setUsuarios(new Map());
        }

        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("promocion.detalle.load", err);
        setError(toUserMessage(err, "Error al cargar el lote de promoción"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [reloadVersion, profileLoading, role, loteId, accionesLimit]);

  const reanudar = async () => {
    if (!lote) return;
    setActionBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (lote.status === "INTERRUPTED" || lote.status === "RUNNING") {
        const { data, error: rpcError } = await supabase.rpc("resume_promotion", {
          p_batch_id: lote.id,
        });
        if (rpcError) throw rpcError;
        if (!data?.success) {
          setError(String(data?.error ?? "No se pudo reanudar el lote"));
          return;
        }
      } else {
        // PREPARED o FAILED: ejecutar/reanudar con la misma key (idempotente).
        const { data, error: rpcError } = await supabase.rpc("execute_promotion", {
          p_institution_id: lote.institution_id,
          p_origin_year: lote.origin_year,
          p_destination_year: lote.destination_year,
          p_idempotency_key: lote.idempotency_key,
        });
        if (rpcError) throw rpcError;
        if (!data?.success) {
          setError(String(data?.error ?? "No se pudo ejecutar el lote"));
          return;
        }
      }
      toast.success("Lote procesado");
      setReloadVersion((n) => n + 1);
    } catch (err) {
      logClientError("promocion.detalle.reanudar", err);
      setError(toUserMessage(err, "No se pudo reanudar el lote"));
    } finally {
      setActionBusy(false);
    }
  };

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "promocion.gestionar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para gestionar promociones." />
      </div>
    );
  }

  if (loading) return <LoadingScreen label="Cargando lote de promoción..." />;

  if (notFound || !lote) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tienes permiso para ver esto." />
      </div>
    );
  }

  const counts = readCounts(lote.counts);
  const ejecutable =
    lote.status === "PREPARED" ||
    lote.status === "RUNNING" ||
    lote.status === "INTERRUPTED" ||
    lote.status === "FAILED";

  const eventos = [
    {
      key: "prepared",
      label: "Lote preparado (promotion_prepared)",
      hint: "Se creó el lote sin mutar datos; los cambios se aplican al ejecutar.",
      at: lote.started_at,
    },
    ...(lote.completed_at
      ? [
          {
            key: "completed",
            label: `Lote ${LOTE_LABELS[lote.status]?.toLowerCase() ?? lote.status} (promotion_executed)`,
            hint: "Ejecución finalizada; revisa las excepciones si las hay.",
            at: lote.completed_at,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Detalle de promoción"
        subtitle={`${lote.institutions?.name ?? "Institución"} · ${lote.origin_year} → ${lote.destination_year}`}
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Promoción", href: "/promocion" },
          { label: lote.id.slice(0, 8) },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill tone={LOTE_TONES[lote.status] ?? "slate"}>
              {LOTE_LABELS[lote.status] ?? lote.status}
            </StatusPill>
            {ejecutable && (
              <button
                type="button"
                onClick={() => void reanudar()}
                disabled={actionBusy}
                className={buttonClass("primary", "md")}
              >
                {actionBusy ? <Spinner className="h-4 w-4" /> : null}
                {lote.status === "PREPARED" ? "Ejecutar lote" : "Reanudar"}
              </button>
            )}
          </div>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Conteos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Total</p>
          <p className="mt-1 text-2xl font-bold text-ink">{counts.total ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Promovidos</p>
          <p className="mt-1 text-2xl font-bold text-ink">{counts.promoted ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Egreso</p>
          <p className="mt-1 text-2xl font-bold text-ink">{counts.egreso ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-ink-muted">
            Retirados excluidos
          </p>
          <p className="mt-1 text-2xl font-bold text-ink">{counts.retired ?? 0}</p>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "acciones", label: "Acciones", count: totalAcciones },
          { id: "excepciones", label: "Excepciones", count: excepciones.length },
          { id: "timeline", label: "Línea de tiempo" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "acciones" && (
        <div className="rounded-2xl border border-line bg-white shadow-card">
          {acciones.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Sin acciones"
                description="Este lote aún no tiene acciones de promoción."
              />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {acciones.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {a.estudiantes
                          ? `${a.estudiantes.last_names}, ${a.estudiantes.first_names}`
                          : `Estudiante ${a.student_id.slice(0, 8)}`}
                        {a.estudiantes && (
                          <span className="ml-2 font-normal text-ink-muted">
                            DNI {a.estudiantes.document_number}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Automático: {RESULT_LABELS[a.automatic_result] ?? a.automatic_result}{" "}
                        · Final: {RESULT_LABELS[a.final_result] ?? a.final_result}
                        {a.processed_at ? ` · Procesado ${fmtDateTime(a.processed_at)}` : ""}
                        {a.error ? ` · Error: ${a.error}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.final_result !== a.automatic_result && (
                        <Badge tone="indigo">Excepción aplicada</Badge>
                      )}
                      <StatusPill tone={ACCION_TONES[a.status] ?? "slate"}>
                        {a.status}
                      </StatusPill>
                    </div>
                  </li>
                ))}
              </ul>
              {acciones.length < totalAcciones && (
                <div className="border-t border-line px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => setAccionesLimit((n) => n + PAGE_SIZE)}
                    className={buttonClass("secondary", "sm")}
                  >
                    Ver más ({totalAcciones - acciones.length} restantes)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "excepciones" && (
        <div className="space-y-4">
          {excepciones.length > 0 && (
            <div className="rounded-2xl border border-line bg-white shadow-card">
              <ul className="divide-y divide-line">
                {excepciones.map((e) => (
                  <li key={e.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <StatusPill tone={RESULT_TONES[e.automatic_result] ?? "slate"}>
                        {RESULT_LABELS[e.automatic_result] ?? e.automatic_result}
                      </StatusPill>
                      <span className="text-ink-muted">→</span>
                      <StatusPill tone={RESULT_TONES[e.final_result] ?? "slate"}>
                        {RESULT_LABELS[e.final_result] ?? e.final_result}
                      </StatusPill>
                      <span className="ml-auto text-xs text-ink-muted">
                        {usuarios.get(e.usuario_id) ?? e.usuario_id.slice(0, 8)} ·{" "}
                        {fmtDateTime(e.fecha)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink">{e.motivo}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(lote.status === "PREPARED" || lote.status === "RUNNING") && (
            <PromotionExceptionsPanel
              batchId={lote.id}
              onComplete={() => setReloadVersion((n) => n + 1)}
            />
          )}
          {excepciones.length === 0 &&
            lote.status !== "PREPARED" &&
            lote.status !== "RUNNING" && (
              <EmptyState
                title="Sin excepciones"
                description="Este lote no tiene excepciones auditadas."
              />
            )}
        </div>
      )}

      {tab === "timeline" && (
        <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Línea de tiempo</h2>
          <ol className="mt-4 space-y-5 border-l-2 border-line pl-5">
            {eventos.map((ev) => (
              <li key={ev.key} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-indigo-500" />
                <p className="text-sm font-semibold text-ink">{ev.label}</p>
                <p className="text-xs text-ink-muted">{ev.hint}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{fmtDateTime(ev.at)}</p>
              </li>
            ))}
            <li className="relative">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-400" />
              <p className="text-sm font-semibold text-ink">
                Estado actual: {LOTE_LABELS[lote.status] ?? lote.status}
              </p>
              <p className="text-xs text-ink-muted">
                {lote.status === "INTERRUPTED" || lote.status === "FAILED"
                  ? "Puedes reanudar el lote desde la cabecera."
                  : lote.status === "PREPARED"
                    ? "El lote está preparado: ejecútalo cuando estés listo."
                    : ""}
              </p>
            </li>
          </ol>
          <div className="mt-4 border-t border-line pt-4">
            <Link href="/promocion" className={buttonClass("secondary", "md")}>
              Volver a la lista
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
