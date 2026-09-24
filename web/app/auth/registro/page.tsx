"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";

type InstitutionPreview = {
  institution_id: string;
  name: string;
  code: string;
  niveles: string[];
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState<"ie" | "datos">("ie");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<InstitutionPreview | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setPreview(null);
    setLooking(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("lookup_institution_by_code", {
        p_code: code.trim(),
      });
      if (error) {
        setLookupError("No se pudo validar el código. Intente de nuevo.");
        return;
      }
      if (!data?.success) {
        setLookupError(data?.error || "Código modular no encontrado");
        return;
      }
      setPreview({
        institution_id: data.institution_id as string,
        name: data.name as string,
        code: data.code as string,
        niveles: Array.isArray(data.niveles) ? (data.niveles as string[]) : [],
      });
    } catch {
      setLookupError("No se pudo validar el código. Intente de nuevo.");
    } finally {
      setLooking(false);
    }
  }

  function confirmInstitution() {
    if (!preview) return;
    setStep("datos");
    router.refresh();
  }

  function backToIe() {
    setStep("ie");
    setPreview(null);
  }

  if (step === "ie") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h1 className="text-center text-3xl font-bold text-gray-900">
              Evolución Psicológica
            </h1>
            <h2 className="mt-2 text-center text-sm text-gray-600">
              Crear cuenta — Identifique su I.E.
            </h2>
          </div>

          <form onSubmit={handleLookup} className="mt-8 space-y-6">
            <div>
              <label
                htmlFor="institution_code"
                className="block text-sm font-medium text-gray-700"
              >
                Código modular de la I.E.
              </label>
              <input
                id="institution_code"
                name="institution_code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass}
                placeholder="Ej. MOD-001"
                autoComplete="off"
              />
            </div>

            {lookupError && (
              <p className="text-sm text-red-600" role="alert">
                {lookupError}
              </p>
            )}

            {preview && (
              <div className="rounded-md border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-900">
                  {preview.name}
                </p>
                <p className="mt-1 text-xs text-green-800">
                  Código: {preview.code}
                </p>
                {preview.niveles.length > 0 && (
                  <p className="mt-1 text-xs text-green-800">
                    Nivel: {preview.niveles.join(" · ")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={confirmInstitution}
                  className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                >
                  Confirmar I.E. y continuar
                </button>
              </div>
            )}

            {!preview && (
              <button
                type="submit"
                disabled={looking || !code.trim()}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {looking ? "Validando…" : "Buscar I.E."}
              </button>
            )}
          </form>

          <div className="text-center text-sm">
            <Link
              href="/auth/login"
              className="text-blue-600 hover:text-blue-500"
            >
              ¿Ya tienes cuenta? Inicia sesión
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900">
            Evolución Psicológica
          </h1>
          <h2 className="mt-2 text-center text-sm text-gray-600">
            Crear cuenta docente — {preview?.name}
          </h2>
          <button
            type="button"
            onClick={backToIe}
            className="mt-2 text-center text-xs text-blue-600 hover:text-blue-500"
          >
            ← Cambiar I.E.
          </button>
        </div>

        <form className="mt-8 space-y-6" action={signUp}>
          <input
            type="hidden"
            name="institution_code"
            value={preview?.code || code}
          />
          <div className="space-y-4">
            <div>
              <label
                htmlFor="full_name"
                className="block text-sm font-medium text-gray-700"
              >
                Nombre completo
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="document_number"
                className="block text-sm font-medium text-gray-700"
              >
                Número de documento
              </label>
              <input
                id="document_number"
                name="document_number"
                type="text"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={inputClass}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={inputClass}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Crear cuenta
          </button>
        </form>

        <div className="text-center text-sm">
          <Link
            href="/auth/login"
            className="text-blue-600 hover:text-blue-500"
          >
            ¿Ya tienes cuenta? Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
