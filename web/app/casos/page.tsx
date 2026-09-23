"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CaseStatusBadge } from "@/components/casos/CaseStatusBadge";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { CasoEstado } from "@/types/supabase";

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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Inicio
              </Link>
              <span className="text-sm text-gray-300">|</span>
              <span className="text-sm font-medium text-gray-900">Casos</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Casos</h1>
          <div className="flex items-center gap-2">
            {ESTADO_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setEstadoFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  estadoFilter === f.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="case-search" className="sr-only">
            Buscar por nombre o DNI
          </label>
          <input
            id="case-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o DNI del estudiante..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {loading && <p className="text-sm text-gray-500">Cargando casos...</p>}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-gray-500">
            No se encontraron casos{search ? " para la búsqueda" : ""}.
          </p>
        )}

        {!loading && !error && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/casos/${c.id}`}
                  className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.estudiantes
                          ? `${c.estudiantes.first_names} ${c.estudiantes.last_names}`
                          : "Estudiante"}
                        {c.estudiantes?.document_number && (
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            DNI: {c.estudiantes.document_number}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {c.situation}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Abierto: {new Date(c.opened_at).toLocaleDateString("es-PE")} ·
                        Actualizado:{" "}
                        {new Date(c.updated_at).toLocaleString("es-PE")}
                      </p>
                    </div>
                    <CaseStatusBadge estado={c.estado} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
