"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { CasoResponsableHistorial } from "@/types/database";

interface Props {
  caseId: string;
  currentResponsibleId: string | null;
}

interface HistoryRow extends CasoResponsableHistorial {
  responsible_name?: string;
}

export function ResponsibleHistory({ caseId, currentResponsibleId }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();

        const { data: historial, error: histError } = await supabase
          .from("caso_responsables_historial")
          .select("*")
          .eq("caso_id", caseId)
          .order("desde", { ascending: false });

        if (histError) throw histError;

        const ids = new Set<string>();
        for (const row of historial ?? []) {
          ids.add(row.responsible_id);
        }
        if (currentResponsibleId) ids.add(currentResponsibleId);

        // Resolución best-effort: la RLS de perfiles puede ocultar perfiles de
        // otros usuarios; en ese caso se muestra un identificador genérico.
        const names: Record<string, string> = {};
        if (ids.size > 0) {
          const { data: perfiles } = await supabase
            .from("perfiles")
            .select("user_id, full_name")
            .in("user_id", Array.from(ids));
          for (const p of perfiles ?? []) {
            names[p.user_id] = p.full_name;
          }
        }

        if (cancelled) return;

        setRows(
          (historial ?? []).map((r) => ({
            ...r,
            responsible_name: names[r.responsible_id],
          }))
        );
        setCurrentName(currentResponsibleId ? (names[currentResponsibleId] ?? null) : null);
      } catch (err) {
        if (!cancelled) {
          logClientError("ResponsibleHistory.load", err);
          setError(toUserMessage(err, "Error al cargar historial"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [caseId, currentResponsibleId]);

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando historial de responsables...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <span className="font-medium text-gray-700">Responsable actual: </span>
        <span className="text-gray-600">
          {currentResponsibleId
            ? currentName ?? "Usuario responsable"
            : "Sin responsable asignado"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Sin registros previos de responsables.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => (
            <li key={row.id} className="py-2 flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-gray-800">
                  {row.responsible_name ?? "Usuario responsable"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Desde: {new Date(row.desde).toLocaleString("es-PE")}
                  {row.hasta && ` — Hasta: ${new Date(row.hasta).toLocaleString("es-PE")}`}
                </p>
              </div>
              {!row.hasta && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Activo
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
