"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Spinner } from "@/components/ui/feedback";

type AuditEntry = {
  action: string;
  user_id: string;
  user_name: string;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  attention_created: "Atención creada",
  attention_updated: "Atención editada",
};

function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ATN-04 — Historial de cambios de la atención (solo metadatos:
 * quién/cuándo; nunca contenido clínico). Gate: can(role,"auditoria.consultar").
 */
export function AttentionAuditPanel({ attentionId }: { attentionId: string }) {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc(
          "list_attention_audit",
          { p_attention_id: attentionId }
        );
        if (cancelled) return;
        if (rpcError) throw rpcError;
        setRows((data ?? []) as AuditEntry[]);
      } catch (err) {
        if (cancelled) return;
        logClientError("atencion.auditoria", err);
        setError(toUserMessage(err, "No se pudo cargar el historial"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [attentionId]);

  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
      <h2 className="font-display text-lg font-bold text-ink">
        Historial de cambios
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Solo metadatos (quién y cuándo). El contenido clínico nunca aparece aquí.
      </p>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Cargando historial...
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="mt-3 text-sm text-ink-muted">Sin cambios registrados.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className="mt-4 space-y-3">
          {rows.map((row, index) => (
            <li
              key={index}
              className="flex flex-wrap items-baseline gap-2 text-sm"
            >
              <span className="text-xs font-medium text-ink-muted">
                {fmtDateTime(row.created_at)}
              </span>
              <span className="font-medium text-ink">
                {ACTION_LABELS[row.action] ?? row.action}
              </span>
              <span className="text-ink-muted">{row.user_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
