"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface ExceptionAction {
  id: string;
  student_name: string;
  automatic_result: string;
  final_result: string;
  status: string;
}

interface Props {
  batchId: string;
  onComplete?: () => void;
}

export function PromotionExceptionsPanel({ batchId, onComplete }: Props) {
  const [actions, setActions] = useState<ExceptionAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<string>("promoted");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase
        .from("acciones_promocion")
        .select(`
          id,
          automatic_result,
          final_result,
          status,
          estudiantes!inner(first_names, last_names)
        `)
        .eq("batch_id", batchId)
        .eq("status", "pending");

      if (rpcError) throw rpcError;

      setActions(
        (data ?? []).map((a: Record<string, unknown>) => ({
          id: a.id as string,
          student_name: `${(a.estudiantes as Record<string, string>).last_names}, ${(a.estudiantes as Record<string, string>).first_names}`,
          automatic_result: a.automatic_result as string,
          final_result: a.final_result as string,
          status: a.status as string,
        }))
      );
    } catch (err) {
      logClientError("PromotionExceptionsPanel.fetchPending", err);
      setError(toUserMessage(err, "Error al cargar acciones"));
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  const handleApplyException = async () => {
    if (!selectedAction || !motivo.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("apply_promotion_exception", {
        p_action_id: selectedAction,
        p_final_result: finalResult,
        p_motivo: motivo.trim(),
      });

      if (rpcError) throw rpcError;

      if (data?.success) {
        setSelectedAction(null);
        setMotivo("");
        fetchPending();
        onComplete?.();
      } else {
        setError(data?.error || "Error al aplicar excepción");
      }
    } catch (err) {
      logClientError("PromotionExceptionsPanel.applyException", err);
      setError(toUserMessage(err, "Error al aplicar excepción"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Excepciones de promoción</h3>
        <button
          onClick={fetchPending}
          disabled={loading}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          {loading ? "Cargando..." : "Cargar pendientes"}
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-md p-3 text-sm text-rose-700 mb-4">
          {error}
        </div>
      )}

      {actions.length > 0 && (
        <div className="space-y-3">
          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md">
            {actions.map((a) => (
              <div
                key={a.id}
                className={`p-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                  selectedAction === a.id ? "bg-indigo-50" : ""
                }`}
                onClick={() => setSelectedAction(a.id)}
              >
                <div className="text-sm font-medium">{a.student_name}</div>
                <div className="text-xs text-slate-500">
                  Resultado automático: {a.automatic_result}
                </div>
              </div>
            ))}
          </div>

          {selectedAction && (
            <div className="space-y-3 border-t border-slate-200 pt-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Resultado final
                </label>
                <select
                  value={finalResult}
                  onChange={(e) => setFinalResult(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="promoted">Promovido</option>
                  <option value="retained">Repetidor</option>
                  <option value="egreso">Egreso</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Motivo
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Motivo de la excepción..."
                />
              </div>
              <button
                onClick={handleApplyException}
                disabled={submitting || !motivo.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
              >
                {submitting ? "Aplicando..." : "Aplicar excepción"}
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && actions.length === 0 && !error && (
        <p className="text-sm text-slate-500">
          No hay acciones pendientes para excepcionar.
        </p>
      )}
    </div>
  );
}
