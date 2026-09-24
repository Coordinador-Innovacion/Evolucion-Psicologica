"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CaseStatusBadge } from "@/components/casos/CaseStatusBadge";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { CasoEstado } from "@/types/supabase";
import { inputClasses } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/ui/feedback";

interface CaseListItem {
  id: string;
  situation: string;
  estado: CasoEstado;
  opened_at: string;
  updated_at: string;
  estudiantes: {
    first_names: string;
    last_names: string;
    document_number: string;
  } | null;
}

const ESTADO_FILTERS: { value: CasoEstado | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "inicio", label: "Inicio" },
  { value: "en_proceso", label: "En proceso" },
  { value: "cerrado", label: "Cerrado" },
];

export default function CasesListPage() {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<CasoEstado | "todos">("todos");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("casos")
          .select(`
            id,
            situation,
            estado,
            opened_at,
            updated_at,
            estudiantes(first_names, last_names, document_number)
          `)
          .order("updated_at", { ascending: false })
          .limit(200);

        if (fetchError) throw fetchError;
        if (!cancelled) {
          setCases((data as unknown as CaseListItem[]) ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("casos.load", err);
          setError(toUserMessage(err, "Error al cargar casos"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (estadoFilter !== "todos" && c.estado !== estadoFilter) return false;
      if (!term) return true;
      const name = `${c.estudiantes?.first_names ?? ""} ${c.estudiantes?.last_names ?? ""}`.toLowerCase();
      const dni = c.estudiantes?.document_number ?? "";
      return name.includes(term) || dni.includes(term);
    });
  }, [cases, search, estadoFilter]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Casos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Seguimiento de casos y atenciones
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <label htmlFor="case-search" className="sr-only">
            Buscar por nombre o DNI
          </label>
          <input
            id="case-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o DNI del estudiante..."
            className={`${inputClasses} pl-9`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ESTADO_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setEstadoFilter(f.value)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                estadoFilter === f.value
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-line bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingScreen label="Cargando casos..." />}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={
            search
              ? "No se encontraron casos para la búsqueda."
              : "No se encontraron casos."
          }
          description="Prueba con otro término o cambia el filtro de estado."
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="space-y-3">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/casos/${c.id}`}
                className="group flex items-start gap-4 rounded-xl border border-line bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-pop"
              >
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon name="folder" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {c.estudiantes
                      ? `${c.estudiantes.first_names} ${c.estudiantes.last_names}`
                      : "Estudiante"}
                    {c.estudiantes?.document_number && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        DNI: {c.estudiantes.document_number}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {c.situation}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Abierto: {new Date(c.opened_at).toLocaleDateString("es-PE")} ·
                    Actualizado:{" "}
                    {new Date(c.updated_at).toLocaleString("es-PE")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CaseStatusBadge estado={c.estado} />
                  <Icon
                    name="chevronRight"
                    className="hidden h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500 sm:block"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
