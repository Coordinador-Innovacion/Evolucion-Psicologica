"use client";

import { useState } from "react";
import { usePromotionWizard } from "@/hooks/usePromotionWizard";
import { usePromotionPreview } from "@/hooks/usePromotionPreview";
import { usePromotionExecution } from "@/hooks/usePromotionExecution";

interface Props {
  institutionId: string;
  onComplete?: () => void;
}

type Step = "config" | "preview" | "prepare" | "confirm" | "result";

export function PromotionWizard({ institutionId, onComplete }: Props) {
  const [step, setStep] = useState<Step>("config");
  const [originYear, setOriginYear] = useState<number | null>(null);
  const [destinationYear, setDestinationYear] = useState<number | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{
    batch_id: string;
    status: string;
    total_students?: number;
    promoted?: number;
    egreso?: number;
    retired?: number;
  } | null>(null);

  const { data: wizardData, loading: wizardLoading } = usePromotionWizard(institutionId);
  const { preview, fetchPreview } = usePromotionPreview();
  const { result, loading: execLoading, error: execError, prepare, execute } = usePromotionExecution();

  // T44: Prefill
  if (originYear === null && wizardData) {
    setOriginYear(wizardData.origin_year);
    setDestinationYear(wizardData.destination_year);
  }

  const handlePreview = async () => {
    if (!originYear || !destinationYear) return;
    await fetchPreview(institutionId, originYear, destinationYear);
    setStep("preview");
  };

  // A4: PREPARAR crea lote PREPARED sin mutar datos definitivos
  const handlePrepare = async () => {
    if (!originYear || !destinationYear) return;
    const key = `${institutionId}-${originYear}-${destinationYear}-${Date.now()}`;
    setIdempotencyKey(key);
    const prep = await prepare(institutionId, originYear, destinationYear, key);
    if (prep) {
      setPrepared(prep);
      setStep("prepare");
    }
  };

  // A4: EJECUTAR solo aplica el lote PREPARED
  const handleConfirm = async () => {
    if (!originYear || !destinationYear || !idempotencyKey) return;
    const res = await execute(institutionId, originYear, destinationYear, idempotencyKey);
    if (res) {
      setStep("result");
      onComplete?.();
    }
  };

  const handleResume = async () => {
    if (!wizardData?.existing_batch_id) return;
    const key = `${institutionId}-${originYear}-${destinationYear}-resume`;
    setIdempotencyKey(key);
    const res = await execute(institutionId, originYear!, destinationYear!, key);
    if (res) {
      setStep("result");
      onComplete?.();
    }
  };

  if (wizardLoading) {
    return <div className="p-4 text-sm text-slate-500">Cargando datos...</div>;
  }

  // T49: Reanudación
  if (wizardData?.existing_batch_id && wizardData.existing_batch_status) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Promoción</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
          <p className="text-sm text-amber-800">
            Hay un lote de promoción {wizardData.existing_batch_status === "RUNNING" ? "en ejecución" : "pendiente"}.
          </p>
          {wizardData.existing_batch_counts && (
            <p className="text-sm text-amber-700 mt-1">
              Procesados: {wizardData.existing_batch_counts.processed ?? 0} / {wizardData.existing_batch_counts.total ?? 0}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleResume}
            disabled={execLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
          >
            {execLoading ? "Reanudando..." : "Reanudar"}
          </button>
          <button
            onClick={onComplete}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Promoción Masiva</h2>

      {step === "config" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Año origen
            </label>
            <input
              type="number"
              value={originYear ?? ""}
              onChange={(e) => setOriginYear(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Año destino
            </label>
            <input
              type="number"
              value={destinationYear ?? ""}
              onChange={(e) => setDestinationYear(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handlePreview}
              disabled={!originYear || !destinationYear}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
            >
              Previsualizar
            </button>
            <button
              onClick={onComplete}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 rounded-md p-3">
              <div className="font-medium text-slate-900">Total</div>
              <div className="text-2xl font-bold">{preview.total_students}</div>
            </div>
            <div className="bg-emerald-50 rounded-md p-3">
              <div className="font-medium text-emerald-800">Promovidos</div>
              <div className="text-2xl font-bold text-emerald-600">{preview.promoted}</div>
            </div>
            <div className="bg-indigo-50 rounded-md p-3">
              <div className="font-medium text-indigo-800">Egreso</div>
              <div className="text-2xl font-bold text-indigo-600">{preview.egreso}</div>
            </div>
            <div className="bg-slate-50 rounded-md p-3">
              <div className="font-medium text-slate-800">Retirados</div>
              <div className="text-2xl font-bold text-slate-600">{preview.retired}</div>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Estudiante</th>
                  <th className="text-left p-2">Grado actual</th>
                  <th className="text-left p-2">Destino</th>
                </tr>
              </thead>
              <tbody>
                {preview.students.map((s) => (
                  <tr key={s.student_id} className="border-t border-slate-100">
                    <td className="p-2">
                      {s.last_names}, {s.first_names}
                    </td>
                    <td className="p-2">{s.current_nivel} {s.current_grado} - {s.section}</td>
                    <td className="p-2">
                      {s.is_egreso ? (
                        <span className="text-indigo-600 font-medium">Egreso</span>
                      ) : (
                        <span>{s.next_nivel_name} {s.next_grado_name} - {s.section}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePrepare}
              disabled={execLoading || !originYear || !destinationYear}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
            >
              {execLoading ? "Preparando..." : "Preparar"}
            </button>
            <button
              onClick={() => setStep("config")}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {step === "prepare" && prepared && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-md p-4">
            <p className="text-sm text-indigo-800 font-medium">
              Lote PREPARED — sin cambios aplicados todavía
            </p>
            <p className="text-sm text-indigo-700 mt-1">
              Total: {prepared.total_students ?? preview?.total_students ?? 0} ·
              Promovidos: {prepared.promoted ?? preview?.promoted ?? 0} ·
              Egreso: {prepared.egreso ?? preview?.egreso ?? 0}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep("confirm")}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
            >
              Revisar y ejecutar
            </button>
            <button
              onClick={() => setStep("preview")}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-md p-4">
            <p className="text-sm text-rose-800 font-medium">
              Esta acción es irreversible
            </p>
            <p className="text-sm text-rose-700 mt-1">
              Se cerrarán los períodos del año {originYear} y se crearán nuevos períodos para {destinationYear}.
              Los estudiantes en último grado serán marcados como egreso.
              {prepared?.batch_id ? ` Lote: ${prepared.status}.` : ""}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={execLoading || !idempotencyKey}
              className="px-4 py-2 bg-rose-600 text-white rounded-md text-sm disabled:opacity-50"
            >
              {execLoading ? "Ejecutando..." : "Ejecutar promoción"}
            </button>
            <button
              onClick={() => setStep(prepared ? "prepare" : "preview")}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4">
          <div className={`rounded-md p-4 ${
            result.status === "COMPLETED"
              ? "bg-emerald-50 border border-emerald-200"
              : "bg-amber-50 border border-amber-200"
          }`}>
            <p className={`text-sm font-medium ${
              result.status === "COMPLETED" ? "text-emerald-800" : "text-amber-800"
            }`}>
              {result.status === "COMPLETED"
                ? "Promoción completada exitosamente"
                : "Promoción completada con excepciones"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 rounded-md p-3">
              <div className="font-medium">Total</div>
              <div className="text-xl font-bold">{result.total}</div>
            </div>
            <div className="bg-emerald-50 rounded-md p-3">
              <div className="font-medium text-emerald-800">Procesados</div>
              <div className="text-xl font-bold text-emerald-600">{result.processed}</div>
            </div>
            <div className="bg-indigo-50 rounded-md p-3">
              <div className="font-medium text-indigo-800">Egreso</div>
              <div className="text-xl font-bold text-indigo-600">{result.egreso}</div>
            </div>
            {result.errors > 0 && (
              <div className="bg-rose-50 rounded-md p-3">
                <div className="font-medium text-rose-800">Errores</div>
                <div className="text-xl font-bold text-rose-600">{result.errors}</div>
              </div>
            )}
          </div>

          {result.idempotent && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-700">
              Este lote ya había sido procesado anteriormente (operación idempotente).
            </div>
          )}

          <button
            onClick={onComplete}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm"
          >
            Cerrar
          </button>
        </div>
      )}

      {execError && (
        <div className="mt-4 bg-rose-50 border border-rose-200 rounded-md p-3 text-sm text-rose-700">
          {execError}
        </div>
      )}
    </div>
  );
}
