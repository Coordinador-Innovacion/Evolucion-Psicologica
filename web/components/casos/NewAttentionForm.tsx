"use client";

import { useState } from "react";
import { useCreateAttention } from "@/hooks/useCreateAttention";

interface Props {
  caseId: string;
  onCreated: () => void;
}

export function NewAttentionForm({ caseId, onCreated }: Props) {
  const { createAttention, loading, error } = useCreateAttention();
  const [motivo, setMotivo] = useState("");
  const [queSeHizo, setQueSeHizo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [compromisos, setCompromisos] = useState("");
  const [proximaAtencion, setProximaAtencion] = useState("");
  const [licenseWarning, setLicenseWarning] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const canSubmit = motivo.trim() !== "" && queSeHizo.trim() !== "" && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const result = await createAttention(caseId, {
      motivo: motivo.trim(),
      queSeHizo: queSeHizo.trim(),
      observaciones: observaciones.trim() || undefined,
      compromisos: compromisos.trim() || undefined,
      proximaAtencion: proximaAtencion || undefined,
    });

    if (result?.ok) {
      setMotivo("");
      setQueSeHizo("");
      setObservaciones("");
      setCompromisos("");
      setProximaAtencion("");
      setLicenseWarning(result.licenseWarning ?? null);
      setCreated(true);
      onCreated();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
      <h3 className="text-sm font-semibold text-gray-900">Nueva atención</h3>

      <div>
        <label htmlFor="att-motivo" className="block text-sm font-medium text-gray-700 mb-1">
          Motivo *
        </label>
        <textarea
          id="att-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Motivo de la atención..."
        />
      </div>

      <div>
        <label htmlFor="att-queSeHizo" className="block text-sm font-medium text-gray-700 mb-1">
          Qué se hizo *
        </label>
        <textarea
          id="att-queSeHizo"
          value={queSeHizo}
          onChange={(e) => setQueSeHizo(e.target.value)}
          rows={3}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Descripción de la intervención..."
        />
      </div>

      <div>
        <label htmlFor="att-observaciones" className="block text-sm font-medium text-gray-700 mb-1">
          Observaciones
        </label>
        <textarea
          id="att-observaciones"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label htmlFor="att-compromisos" className="block text-sm font-medium text-gray-700 mb-1">
          Compromisos
        </label>
        <textarea
          id="att-compromisos"
          value={compromisos}
          onChange={(e) => setCompromisos(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
        <label htmlFor="att-proxima" className="block text-sm font-medium text-gray-700 mb-1">
          Próxima atención
        </label>
        <input
          id="att-proxima"
          type="datetime-local"
          value={proximaAtencion}
          onChange={(e) => setProximaAtencion(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {licenseWarning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          {licenseWarning}
        </div>
      )}

      {created && !error && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Atención registrada. La primera atención del caso lo lleva a &quot;En proceso&quot;.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Guardando..." : "Registrar atención"}
        </button>
      </div>
    </form>
  );
}
