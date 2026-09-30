"use client";

import { useState } from "react";
import { useCreateAttention } from "@/hooks/useCreateAttention";

interface Props {
  caseId: string;
  onCreated: (attentionId?: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  showOrigen?: boolean;
}

export function NewAttentionForm({
  caseId,
  onCreated,
  disabled = false,
  disabledReason,
  showOrigen = false,
}: Props) {
  const { createAttention, loading, error } = useCreateAttention();
  const [motivo, setMotivo] = useState("");
  const [queSeHizo, setQueSeHizo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [compromisos, setCompromisos] = useState("");
  const [proximaAtencion, setProximaAtencion] = useState("");
  const [origen, setOrigen] = useState("");
  const [licenseWarning, setLicenseWarning] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const fieldsReady = motivo.trim() !== "" && queSeHizo.trim() !== "";
  const canSubmit = fieldsReady && !loading && !disabled;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const result = await createAttention(caseId, {
      motivo: motivo.trim(),
      queSeHizo: queSeHizo.trim(),
      observaciones: observaciones.trim() || undefined,
      compromisos: compromisos.trim() || undefined,
      proximaAtencion: proximaAtencion || undefined,
      origen: origen.trim() || undefined,
    });

    if (result?.ok) {
      setMotivo("");
      setQueSeHizo("");
      setObservaciones("");
      setCompromisos("");
      setProximaAtencion("");
      setOrigen("");
      setLicenseWarning(result.licenseWarning ?? null);
      setCreated(true);
      onCreated(result.attentionId);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-line bg-surface p-4"
    >
      <h3 className="text-sm font-semibold text-ink">Registrar atención</h3>
      <p className="text-xs text-ink-muted">
        La fecha y hora las fija el servidor. La primera atención del caso lo lleva a
        &quot;En proceso&quot;.
      </p>

      <div>
        <label htmlFor="att-motivo" className="mb-1 block text-sm font-medium text-ink-soft">
          Motivo *
        </label>
        <textarea
          id="att-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          required
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Motivo de la atención..."
        />
      </div>

      <div>
        <label htmlFor="att-queSeHizo" className="mb-1 block text-sm font-medium text-ink-soft">
          Qué se hizo *
        </label>
        <textarea
          id="att-queSeHizo"
          value={queSeHizo}
          onChange={(e) => setQueSeHizo(e.target.value)}
          rows={3}
          required
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Descripción de la intervención..."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="att-observaciones" className="mb-1 block text-sm font-medium text-ink-soft">
            Observaciones
          </label>
          <textarea
            id="att-observaciones"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label htmlFor="att-compromisos" className="mb-1 block text-sm font-medium text-ink-soft">
            Compromisos
          </label>
          <textarea
            id="att-compromisos"
            value={compromisos}
            onChange={(e) => setCompromisos(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="att-proxima" className="mb-1 block text-sm font-medium text-ink-soft">
            Próxima atención
          </label>
          <input
            id="att-proxima"
            type="datetime-local"
            value={proximaAtencion}
            onChange={(e) => setProximaAtencion(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {showOrigen && (
          <div>
            <label htmlFor="att-origen" className="mb-1 block text-sm font-medium text-ink-soft">
              Origen
            </label>
            <input
              id="att-origen"
              type="text"
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              placeholder="Ej. demanda de docente, derivación..."
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {licenseWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {licenseWarning}
        </div>
      )}

      {disabled && disabledReason && !error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {disabledReason}
        </div>
      )}

      {created && !error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Atención registrada. La primera atención del caso lo lleva a &quot;En
          proceso&quot;.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          title={disabled ? disabledReason : undefined}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Registrar atención"}
        </button>
      </div>
    </form>
  );
}
