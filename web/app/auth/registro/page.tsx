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
  "mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

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
      <div>
        <h2 className="text-center text-lg font-semibold text-slate-900">
          Crear cuenta — Identifique su I.E.
        </h2>
        <p className="mt-1 text-center text-sm text-slate-500">
          Valida el código modular de tu institución educativa
        </p>

        <form
          onSubmit={handleLookup}
          className="mt-6 space-y-5 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8"
        >
            <div>
              <label
                htmlFor="institution_code"
                className="block text-sm font-medium text-slate-700"
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
              <p className="text-sm text-rose-600" role="alert">
                {lookupError}
              </p>
            )}

            {preview && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-900">
                  {preview.name}
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  Código: {preview.code}
                </p>
                {preview.niveles.length > 0 && (
                  <p className="mt-1 text-xs text-emerald-800">
                    Nivel: {preview.niveles.join(" · ")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={confirmInstitution}
                  className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Confirmar I.E. y continuar
                </button>
              </div>
            )}

            {!preview && (
              <button
                type="submit"
                disabled={looking || !code.trim()}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {looking ? "Validando…" : "Buscar I.E."}
              </button>
            )}
          </form>

        <div className="mt-5 text-center text-sm">
          <Link
            href="/auth/login"
            className="font-medium text-indigo-600 hover:text-indigo-700"
          >
            ¿Ya tienes cuenta? Inicia sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-center text-lg font-semibold text-slate-900">
        Crear cuenta docente — {preview?.name}
      </h2>
      <button
        type="button"
        onClick={backToIe}
        className="mt-2 text-center text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        ← Cambiar I.E.
      </button>

      <form
        className="mt-6 space-y-5 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8"
        action={signUp}
      >
          <input
            type="hidden"
            name="institution_code"
            value={preview?.code || code}
          />
          <div className="space-y-4">
            <div>
              <label
                htmlFor="full_name"
                className="block text-sm font-medium text-slate-700"
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
                className="block text-sm font-medium text-slate-700"
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
                className="block text-sm font-medium text-slate-700"
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
                className="block text-sm font-medium text-slate-700"
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
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Crear cuenta
          </button>
        </form>

      <div className="mt-5 text-center text-sm">
        <Link
          href="/auth/login"
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          ¿Ya tienes cuenta? Inicia sesión
        </Link>
      </div>
    </div>
  );
}
