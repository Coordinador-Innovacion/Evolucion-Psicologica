"use client";

import { useEffect, useState } from "react";
import { useAttentionEdit } from "@/hooks/useAttentionEdit";
import type { Atencion } from "@/types/database";

interface Props {
  attention: Atencion;
  onUpdated: () => void;
}

export function AttentionEditor({ attention, onUpdated }: Props) {
  const { checkEditWindow, updateAttention, loading, error, canEdit, remainingMinutes } =
    useAttentionEdit();

  const [motivo, setMotivo] = useState(attention.motivo);
  const [queSeHizo, setQueSeHizo] = useState(attention.que_se_hizo);
  const [observaciones, setObservaciones] = useState(attention.observaciones ?? "");
  const [compromisos, setCompromisos] = useState(attention.compromisos ?? "");
  const [proximaAtencion, setProximaAtencion] = useState(
    attention.proxima_atencion ? attention.proxima_atencion.slice(0, 16) : ""
  );

  useEffect(() => {
    const check = () => checkEditWindow(attention.created_at);
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [attention.created_at, checkEditWindow]);

  const hasChanges =
    motivo !== attention.motivo ||
    queSeHizo !== attention.que_se_hizo ||
    observaciones !== (attention.observaciones ?? "") ||
    compromisos !== (attention.compromisos ?? "") ||
    proximaAtencion !== (attention.proxima_atencion ? attention.proxima_atencion.slice(0, 16) : "");

  const handleSave = async () => {
    const success = await updateAttention(attention.id, {
      motivo,
      que_se_hizo: queSeHizo,
      observaciones: observaciones || undefined,
      compromisos: compromisos || undefined,
      proxima_atencion: proximaAtencion ? new Date(proximaAtencion).toISOString() : undefined,
    });
    if (success) {
      onUpdated();
    }
  };

  return (
    <div className="space-y-4">
      {/* Indicador de ventana */}
      <div
        className={`p-3 rounded-md text-sm ${
          canEdit
            ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
            : "bg-slate-50 border border-slate-200 text-slate-600"
        }`}
      >
        {canEdit ? (
          <span>
            Editable — quedan <strong>{remainingMinutes}</strong> minutos.
          </span>
        ) : (
          <span>
            Esta atención está bloqueada. Solo puede editarse dentro de los primeros 30 minutos
            desde su registro.
          </span>
        )}
      </div>

      {/* Formulario */}
      <div className="space-y-4">
        <div>
          <label htmlFor="motivo" className="block text-sm font-medium text-slate-700 mb-1">
            Motivo *
          </label>
          <textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="queSeHizo" className="block text-sm font-medium text-slate-700 mb-1">
            Qué se hizo *
          </label>
          <textarea
            id="queSeHizo"
            value={queSeHizo}
            onChange={(e) => setQueSeHizo(e.target.value)}
            rows={3}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="observaciones" className="block text-sm font-medium text-slate-700 mb-1">
            Observaciones
          </label>
          <textarea
            id="observaciones"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="compromisos" className="block text-sm font-medium text-slate-700 mb-1">
            Compromisos
          </label>
          <textarea
            id="compromisos"
            value={compromisos}
            onChange={(e) => setCompromisos(e.target.value)}
            rows={2}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="proximaAtencion" className="block text-sm font-medium text-slate-700 mb-1">
            Próxima atención
          </label>
          <input
            id="proximaAtencion"
            type="datetime-local"
            value={proximaAtencion}
            onChange={(e) => setProximaAtencion(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-sm text-rose-700">
          {error}
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
