"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { canAccessDocuments } from "@/components/documentos/StudentDocumentsPanel";
import { logClientError, toUserMessage } from "@/lib/errors";
import {
  PERIOD_PRESET_LABELS,
  rangeToIsoBounds,
  resolvePeriodRange,
  type PeriodPreset,
} from "@/lib/analytics/period";
import type { CasoEstado } from "@/types/supabase";
import {
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";

const OPS_ROLES = [
  "global",
  "director",
  "admin_ie",
  "coordinador",
  "psicologo",
  "docente",
] as const;

const PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_3_months",
  "this_year",
  "custom",
];

interface MetricCard {
  key: string;
  label: string;
  value: number | null;
  accent: "blue" | "amber" | "emerald" | "violet" | "rose" | "slate";
  hint?: string;
}

interface PeriodoRow {
  id: string;
  school_year: number;
  start_date: string;
  end_date: string | null;
}

interface MetricsState {
  casosTotal: number | null;
  casosInicio: number | null;
  casosEnProceso: number | null;
  casosCerrado: number | null;
  atencionesTotal: number | null;
  derivacionesTotal: number | null;
  aplicacionesTotal: number | null;
  aplicacionesCompletadas: number | null;
  documentosTotal: number | null;
  periodos: PeriodoRow[];
}

const EMPTY_METRICS: MetricsState = {
  casosTotal: null,
  casosInicio: null,
  casosEnProceso: null,
  casosCerrado: null,
  atencionesTotal: null,
  derivacionesTotal: null,
  aplicacionesTotal: null,
  aplicacionesCompletadas: null,
  documentosTotal: null,
  periodos: [],
};

type DateFilter = { startIso: string; endIso: string };

async function countRows(
  table: string,
  opts: {
    dateColumn?: string;
    dateFilter?: DateFilter | null;
    eq?: { column: string; value: string | CasoEstado };
  } = {}
): Promise<number> {
  const supabase = createClient();
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  if (opts.dateColumn && opts.dateFilter) {
    query = query
      .gte(opts.dateColumn, opts.dateFilter.startIso)
      .lte(opts.dateColumn, opts.dateFilter.endIso);
  }
  if (opts.eq) {
    query = query.eq(opts.eq.column, opts.eq.value);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function loadPeriodos(dateFilter: DateFilter): Promise<PeriodoRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("periodos_escolares")
    .select("id, school_year, start_date, end_date")
    .lte("start_date", dateFilter.endIso.slice(0, 10))
    .order("start_date", { ascending: false })
    .limit(8);
  if (error) throw error;
  return (data ?? []) as PeriodoRow[];
}

const ACCENT_STYLES: Record<MetricCard["accent"], string> = {
  blue: "border-indigo-200 bg-gradient-to-br from-indigo-50 to-white",
  amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
  emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
  violet: "border-violet-200 bg-gradient-to-br from-violet-50 to-white",
  rose: "border-rose-200 bg-gradient-to-br from-rose-50 to-white",
  slate: "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
};

const ACCENT_TEXT: Record<MetricCard["accent"], string> = {
  blue: "text-indigo-700",
  amber: "text-amber-700",
  emerald: "text-emerald-700",
  violet: "text-violet-700",
  rose: "text-rose-700",
  slate: "text-slate-700",
};

function CaseDistributionBar({
  inicio,
  enProceso,
  cerrado,
}: {
  inicio: number;
  enProceso: number;
  cerrado: number;
}) {
  const total = inicio + enProceso + cerrado;
  if (total <= 0) {
    return (
      <p className="text-sm text-slate-500">Sin casos en este período.</p>
    );
  }
  const pct = (n: number) => Math.max(2, Math.round((n / total) * 100));
  return (
    <div className="space-y-2">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label="Distribución de casos por estado"
      >
        <div
          className="bg-indigo-500 transition-all"
          style={{ width: `${pct(inicio)}%` }}
        />
        <div
          className="bg-amber-500 transition-all"
          style={{ width: `${pct(enProceso)}%` }}
        />
        <div
          className="bg-slate-400 transition-all"
          style={{ width: `${pct(cerrado)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
          Inicio ({inicio})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          En proceso ({enProceso})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
          Cerrado ({cerrado})
        </span>
      </div>
    </div>
  );
}

export default function AnaliticaPage() {
  const { profile, loading: profileLoading } = useUser();
  const [metrics, setMetrics] = useState<MetricsState>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const authorized =
    profile !== null &&
    profile !== undefined &&
    (OPS_ROLES as readonly string[]).includes(profile.role);

  const role = profile?.role ?? null;
  const includeDocs = canAccessDocuments(role);
  const isDocente = role === "docente";

  const range = useMemo(
    () => resolvePeriodRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );
  const dateFilter = useMemo(() => rangeToIsoBounds(range), [range]);

  useEffect(() => {
    if (!authorized) {
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.all([
          countRows("casos", { dateColumn: "opened_at", dateFilter }),
          countRows("casos", {
            dateColumn: "opened_at",
            dateFilter,
            eq: { column: "estado", value: "inicio" },
          }),
          countRows("casos", {
            dateColumn: "opened_at",
            dateFilter,
            eq: { column: "estado", value: "en_proceso" },
          }),
          countRows("casos", {
            dateColumn: "opened_at",
            dateFilter,
            eq: { column: "estado", value: "cerrado" },
          }),
          countRows("atenciones", { dateColumn: "fecha", dateFilter }),
          countRows("derivaciones", {
            dateColumn: "derivation_date",
            dateFilter,
          }),
          countRows("encuesta_aplicaciones", {
            dateColumn: "started_at",
            dateFilter,
          }),
          countRows("encuesta_aplicaciones", {
            dateColumn: "started_at",
            dateFilter,
            eq: { column: "status", value: "completed" },
          }),
          includeDocs
            ? countRows("documentos", { dateColumn: "created_at", dateFilter })
            : Promise.resolve(null as number | null),
          loadPeriodos(dateFilter),
        ]);

        if (cancelled) return;

        setMetrics({
          casosTotal: results[0],
          casosInicio: results[1],
          casosEnProceso: results[2],
          casosCerrado: results[3],
          atencionesTotal: results[4],
          derivacionesTotal: results[5],
          aplicacionesTotal: results[6],
          aplicacionesCompletadas: results[7],
          documentosTotal: results[8],
          periodos: results[9],
        });
      } catch (err) {
        if (cancelled) return;
        logClientError("analitica.load", err);
        setError(toUserMessage(err, "No se pudieron cargar los conteos"));
        setMetrics(EMPTY_METRICS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorized, dateFilter, includeDocs, reload]);

  if (profileLoading) {
    return <LoadingScreen label="Cargando..." />;
  }

  if (!authorized) {
    return (
      <RestrictedAccess message="La analítica operativa está disponible para roles del sistema." />
    );
  }

  const cards: MetricCard[] = [
    {
      key: "casosTotal",
      label: "Casos (total)",
      value: metrics.casosTotal,
      accent: "blue",
      hint: "Apertura en el período",
    },
    {
      key: "casosInicio",
      label: "Casos en inicio",
      value: metrics.casosInicio,
      accent: "violet",
    },
    {
      key: "casosEnProceso",
      label: "Casos en proceso",
      value: metrics.casosEnProceso,
      accent: "amber",
    },
    {
      key: "casosCerrado",
      label: "Casos cerrados",
      value: metrics.casosCerrado,
      accent: "slate",
    },
    {
      key: "atencionesTotal",
      label: "Atenciones",
      value: metrics.atencionesTotal,
      accent: "emerald",
      hint: "Fecha de atención",
    },
    {
      key: "derivacionesTotal",
      label: "Derivaciones",
      value: metrics.derivacionesTotal,
      accent: "rose",
      hint: "Fecha de derivación",
    },
    {
      key: "aplicacionesTotal",
      label: "Aplicaciones de encuesta",
      value: metrics.aplicacionesTotal,
      accent: "blue",
      hint: "Inicio en el período",
    },
    {
      key: "aplicacionesCompletadas",
      label: "Encuestas completadas",
      value: metrics.aplicacionesCompletadas,
      accent: "emerald",
      hint: "Estado: completada",
    },
    ...(includeDocs
      ? [
          {
            key: "documentosTotal",
            label: "Documentos",
            value: metrics.documentosTotal,
            accent: "violet" as const,
            hint: "Subidos en el período",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Analítica operativa
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Conteos de uso del sistema. Sin contenido clínico. El alcance lo
            determina el rol y la institución (RLS).
            {isDocente && " Acceso de consulta: solo lectura."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReload((v) => v + 1)}
          className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-indigo-600 shadow-sm transition hover:bg-indigo-50"
        >
          Actualizar
        </button>
      </div>

        <section
          aria-label="Filtro de período"
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    preset === p
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {PERIOD_PRESET_LABELS[p]}
                </button>
              ))}
            </div>

            {preset === "custom" && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-500" htmlFor="date-from">
                  Desde
                </label>
                <input
                  id="date-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <label className="text-xs text-slate-500" htmlFor="date-to">
                  Hasta
                </label>
                <input
                  id="date-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
            )}

            <p className="text-xs text-slate-500 ml-auto">
              {range.start} → {range.end}
            </p>
          </div>
        </section>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        {loading && !error && (
          <p className="text-sm text-slate-500">Calculando conteos...</p>
        )}

        {!loading && (
          <div className="space-y-6">
            <section aria-label="Resumen de casos">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Distribución de casos por estado
                </h2>
                <CaseDistributionBar
                  inicio={metrics.casosInicio ?? 0}
                  enProceso={metrics.casosEnProceso ?? 0}
                  cerrado={metrics.casosCerrado ?? 0}
                />
              </div>
            </section>

            <section
              aria-label="Indicadores"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {cards.map((metric) => (
                <div
                  key={metric.key}
                  className={`rounded-xl border p-4 shadow-sm ${ACCENT_STYLES[metric.accent]}`}
                >
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {metric.label}
                  </div>
                  <div
                    className={`mt-2 text-3xl font-bold tabular-nums ${ACCENT_TEXT[metric.accent]}`}
                  >
                    {metric.value === null ? "—" : metric.value}
                  </div>
                  {metric.hint && (
                    <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
                  )}
                </div>
              ))}
            </section>

            <section aria-label="Períodos escolares">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Períodos escolares
                </h2>
                {metrics.periodos.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Sin períodos que inicien en el rango seleccionado.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {metrics.periodos.map((p) => (
                      <li
                        key={p.id}
                        className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="font-medium text-slate-900">
                          Año {p.school_year}
                        </span>
                        <span className="text-slate-500">
                          {p.start_date}
                          {" → "}
                          {p.end_date ?? "en curso"}
                        </span>
                        {!p.end_date && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            Vigente
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
    </div>
  );
}
