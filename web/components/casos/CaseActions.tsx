"use client";

import { useState } from "react";
import { useCaseActions } from "@/hooks/useCaseActions";
import type { CasoEstado } from "@/types/supabase";

interface Props {
  caseId: string;
  estado: CasoEstado;
  canManage: boolean;
  onStateChanged: () => void;
}

export function CaseActions({ caseId, estado, canManage, onStateChanged }: Props) {
  const { closeCase, reopenCase, loading, error } = useCaseActions();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const handleClose = async () => {
    if (!closeReason.trim()) return;
    const success = await closeCase(caseId, closeReason.trim());
    if (success) {
      setShowCloseDialog(false);
      setCloseReason("");
      onStateChanged();
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) return;
    const success = await reopenCase(caseId, reopenReason.trim());
    if (success) {
      setShowReopenDialog(false);
      setReopenReason("");
      onStateChanged();
    }
  };

  return (
    <div className="space-y-3">
      {!canManage ? (
        <p className="text-sm text-gray-500">
          {estado === "cerrado"
            ? "Caso cerrado. Solo Psicólogo o Global pueden reabrirlo."
            : "Solo Psicólogo o Global pueden cerrar o reabrir casos."}
        </p>
      ) : (
        <>
          {estado !== "cerrado" ? (
            <button
              type="button"
              onClick={() => setShowCloseDialog(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700"
            >
              Cerrar caso
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowReopenDialog(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            >
              Reabrir caso
            </button>
          )}
        </>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Diálogo de cierre */}
      {showCloseDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Cerrar caso
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              El caso pasará a estado &quot;Cerrado&quot;. Esta acción quedará registrada en la auditoría.
            </p>
            <div className="mb-4">
              <label
                htmlFor="closeReason"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Motivo de cierre *
              </label>
              <textarea
                id="closeReason"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                placeholder="Indique el motivo del cierre..."
                required
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCloseDialog(false);
                  setCloseReason("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={!closeReason.trim() || loading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Cerrando..." : "Cerrar caso"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo de reapertura */}
      {showReopenDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Reabrir caso
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              El caso pasará de &quot;Cerrado&quot; a &quot;Inicio&quot;. Se registrará como nuevo responsable. Esta acción quedará registrada en la auditoría.
            </p>
            <div className="mb-4">
              <label
                htmlFor="reopenReason"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Motivo de reapertura *
              </label>
              <textarea
                id="reopenReason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="Indique el motivo de la reapertura..."
                required
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowReopenDialog(false);
                  setReopenReason("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReopen}
                disabled={!reopenReason.trim() || loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Reabriendo..." : "Reabrir caso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
