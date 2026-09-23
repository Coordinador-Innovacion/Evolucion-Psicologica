"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface Props {
  token: string;
}

interface AccessResult {
  application_id: string;
  respondent_type: string;
  respondent_id: string;
  name: string;
}

export function DniAccessForm({ token }: Props) {
  const router = useRouter();
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AccessResult | null>(null);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dni.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "validate_survey_access",
        {
          p_token: token,
          p_dni: dni.trim(),
        }
      );

      if (rpcError) throw rpcError;

      if (!data?.success) {
        setError(data?.error || "No se pudo validar el acceso");
        setLoading(false);
        return;
      }

      setResult({
        application_id: data.application_id,
        respondent_type: data.respondent_type,
        respondent_id: data.respondent_id,
        name: data.name,
      });
    } catch (err) {
      logClientError("DniAccessForm.validate", err);
      setError(toUserMessage(err, "Error al validar acceso"));
    }
    setLoading(false);
  };

  const handleContinue = () => {
    if (!result) return;
    router.push(
      `/encuesta/${token}/acceso?app=${result.application_id}&type=${result.respondent_type}&rid=${result.respondent_id}&name=${encodeURIComponent(result.name)}`
    );
  };

  if (result) {
    return (
      <div className="max-w-md mx-auto text-center">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-green-900 mb-2">
            Identidad verificada
          </h2>
          <p className="text-sm text-green-700 mb-4">
            Bienvenido(a), <strong>{result.name}</strong>
          </p>
          <p className="text-xs text-green-600 mb-6">
            Tipo:{" "}
            {result.respondent_type === "student" ? "Estudiante" : "Docente"}
          </p>
          <button
            onClick={handleContinue}
            className="w-full py-2 px-4 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
          >
            Continuar a la encuesta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Acceso a encuesta
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Ingrese su número de DNI para acceder a la encuesta.
        </p>

        <form onSubmit={handleValidate}>
          <div className="mb-4">
            <label
              htmlFor="dni"
              className="block text-sm font-medium text-gray-700"
            >
              Número de DNI *
            </label>
            <input
              id="dni"
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ej: 12345678"
              required
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={20}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !dni.trim()}
            className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Validando..." : "Validar acceso"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            Si no recuerda su DNI o tiene problemas de acceso, contacte al
            psicólogo de la institución.
          </p>
        </div>
      </div>
    </div>
  );
}
