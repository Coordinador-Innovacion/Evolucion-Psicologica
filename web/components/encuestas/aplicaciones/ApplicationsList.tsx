"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import type { SurveyApplicationItem } from "@/types/encuestas";

interface ApplicationRow extends SurveyApplicationItem {
  encuesta_versiones: {
    version_number: number;
    encuestas: { id: string; title: string } | null;
  } | null;
}

export type ApplicationUiState =
  | "programada"
  | "abierta"
  | "vencida"
  | "cerrada";

export function applicationUiState(
  app: Pick<SurveyApplicationItem, "status" | "ends_at">,
  now: Date = new Date()
): ApplicationUiState {
  if (app.status === "scheduled") return "programada";
  if (app.status === "completed" || app.status === "closed") return "cerrada";
  return new Date(app.ends_at).getTime() <= now.getTime()
    ? "vencida"
    : "abierta";
}

const STATE_STYLES: Record<ApplicationUiState, string> = {
  programada: "bg-indigo-100 text-indigo-800",
  abierta: "bg-emerald-100 text-emerald-800",
  vencida: "bg-rose-100 text-rose-800",
  cerrada: "bg-slate-100 text-slate-700",
};

const STATE_LABELS: Record<ApplicationUiState, string> = {
  programada: "Programada",
  abierta: "Abierta",
  vencida: "Vencida",
  cerrada: "Cerrada",
};

function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApplicationsList() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [surveyFilter, setSurveyFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data, error: err } = await supabase
          .from("encuesta_aplicaciones")
          .select("*, encuesta_versiones(version_number, encuestas(id, title))")
          .order("created_at", { ascending: false });
        if (err) throw err;
        if (!cancelled) {
          setRows((data ?? []) as unknown as ApplicationRow[]);
          setNow(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("ApplicationsList.load", err);
          setError(toUserMessage(err, "Error al cargar aplicaciones"));
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const surveyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = row.encuesta_versiones?.encuestas?.id;
      const title = row.encuesta_versiones?.encuestas?.title;
      if (id && title && !map.has(id)) map.set(id, title);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const row of rows) set.add(row.year);
    return [...set].sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (
        surveyFilter &&
        row.encuesta_versiones?.encuestas?.id !== surveyFilter
      )
        return false;
      if (stateFilter && applicationUiState(row, now) !== stateFilter)
        return false;
      if (yearFilter && String(row.year) !== yearFilter) return false;
      return true;
    });
  }, [rows, surveyFilter, stateFilter, yearFilter, now]);

  const avgProgress =
    filtered.length === 0
      ? 0
      : Math.round(
          filtered.reduce((acc, row) => acc + (row.progress ?? 0), 0) /
            filtered.length
        );

  if (loading) {
    return <LoadingScreen label="Cargando aplicaciones..." />;
  }

  if (error) {
    return <ErrorBanner>{error}</ErrorBanner>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-card">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="whitespace-nowrap">Encuesta</span>
          <select
            value={surveyFilter}
            onChange={(e) => setSurveyFilter(e.target.value)}
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="">Todas</option>
            {surveyOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="whitespace-nowrap">Estado</span>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="">Todos</option>
            <option value="programada">Programada</option>
            <option value="abierta">Abierta</option>
            <option value="vencida">Vencida</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="whitespace-nowrap">Año escolar</span>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="">Todos</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-4 text-sm text-ink-muted">
          <span>
            {filtered.length}{" "}
            {filtered.length === 1 ? "aplicación" : "aplicaciones"}
          </span>
          <span>Avance promedio: {avgProgress}%</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No hay aplicaciones."
          description="Crea una aplicación desde una versión publicada para comenzar."
          action={
            <Link href="/encuestas/aplicaciones/nueva" className={buttonClass()}>
              Nueva aplicación
            </Link>
          }
        />
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
          {filtered.map((row) => {
            const state = applicationUiState(row, now);
            const title = row.encuesta_versiones?.encuestas?.title ?? "Encuesta";
            const surveyId = row.encuesta_versiones?.encuestas?.id;
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/encuestas/aplicaciones/${row.id}`}
                      className="truncate text-sm font-medium text-slate-900 hover:text-indigo-600"
                    >
                      {title}
                    </Link>
                    <span className="text-xs text-slate-500">
                      V{row.encuesta_versiones?.version_number ?? "?"}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLES[state]}`}
                    >
                      {STATE_LABELS[state]}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Año escolar {row.year}</span>
                    <span>
                      Ventana: {fmtDateTime(row.started_at)} —{" "}
                      {fmtDateTime(row.ends_at)}
                    </span>
                    <span>{row.progress ?? 0}% avance</span>
                    {surveyId && (
                      <Link
                        href={`/encuestas/${surveyId}`}
                        className="text-indigo-600 hover:text-indigo-500"
                      >
                        Ver encuesta
                      </Link>
                    )}
                  </div>
                </div>
                <Link
                  href={`/encuestas/aplicaciones/${row.id}`}
                  className={buttonClass("secondary", "sm")}
                >
                  Abrir
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
