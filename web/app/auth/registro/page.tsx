"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Check, Search, ShieldCheck } from "lucide-react";
import { signUp } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/auth/PasswordField";

type InstitutionPreview = {
  institution_id: string;
  name: string;
  code: string;
  niveles: string[];
};

const inputClass =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

const STEPS = ["Código", "Confirmar I.E.", "Datos"] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2">
      {STEPS.map((label, index) => {
        const state = index < current ? "done" : index === current ? "active" : "todo";
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition ${
                state === "done"
                  ? "bg-brand-500 text-white"
                  : state === "active"
                    ? "bg-primary text-white"
                    : "bg-line text-ink-muted"
              }`}
            >
              {state === "done" ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={`text-[11px] ${
                state === "todo" ? "text-ink-muted" : "text-ink-soft font-medium"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RegistroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serverError = searchParams.get("error");

  const [step, setStep] = useState(0);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<InstitutionPreview | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [matchError, setMatchError] = useState<string | null>(null);

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
      setStep(1);
    } catch {
      setLookupError("No se pudo validar el código. Intente de nuevo.");
    } finally {
      setLooking(false);
    }
  }

  function confirmInstitution() {
    if (!preview) return;
    setStep(2);
    router.refresh();
  }

  function backToCodigo() {
    setStep(0);
    setPreview(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (password !== confirm) {
      e.preventDefault();
      setMatchError("Las contraseñas no coinciden.");
      return;
    }
    setMatchError(null);
  }

  return (
    <div>
      <h2 className="text-center font-display text-xl font-bold text-ink">
        Crear cuenta docente
      </h2>
      <p className="mt-1 text-center text-sm text-ink-muted">
        Validamos tu institución y luego tus datos
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <StepIndicator current={step} />

        {serverError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            {serverError === "institution"
              ? "El código modular es obligatorio."
              : "No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo."}
          </p>
        )}

        {step === 0 && (
          <form onSubmit={handleLookup} className="space-y-5">
            <div>
              <label
                htmlFor="institution_code"
                className="block text-sm font-medium text-ink-soft"
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
                className={`mt-1 ${inputClass}`}
                placeholder="Ej. MOD-001"
                autoComplete="off"
              />
            </div>

            {lookupError && (
              <p className="text-sm text-rose-600" role="alert">
                {lookupError}
              </p>
            )}

            <button
              type="submit"
              disabled={looking || !code.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {looking ? "Validando…" : "Buscar I.E."}
            </button>
          </form>
        )}

        {step === 1 && preview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-500/30 bg-brand-100/60 p-4 dark:bg-brand-500/10">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{preview.name}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Código: {preview.code}
                    {preview.niveles.length > 0 &&
                      ` · Nivel: ${preview.niveles.join(" · ")}`}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-sm font-medium text-ink-soft">
              ¿Es tu institución?
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={confirmInstitution}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-strong"
              >
                <Check className="h-4 w-4" />
                Confirmar I.E. y continuar
              </button>
              <button
                type="button"
                onClick={backToCodigo}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:border-brand-500/40 hover:text-brand-600"
              >
                <ArrowLeft className="h-4 w-4" />
                Cambiar código
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form
            className="space-y-5"
            action={signUp}
            onSubmit={handleSubmit}
          >
            <input
              type="hidden"
              name="institution_code"
              value={preview?.code || code}
            />

            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Rol: Docente
            </span>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="full_name"
                  className="block text-sm font-medium text-ink-soft"
                >
                  Nombre completo
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  className={`mt-1 ${inputClass}`}
                />
              </div>

              <div>
                <label
                  htmlFor="document_number"
                  className="block text-sm font-medium text-ink-soft"
                >
                  Número de documento
                </label>
                <input
                  id="document_number"
                  name="document_number"
                  type="text"
                  required
                  className={`mt-1 ${inputClass}`}
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-ink-soft"
                >
                  Correo electrónico
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`mt-1 ${inputClass}`}
                  placeholder="correo@ejemplo.com"
                />
              </div>

              <PasswordField
                id="password"
                name="password"
                label="Contraseña"
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                strength
                onValueChange={setPassword}
              />

              <PasswordField
                id="password_confirm"
                name="password_confirm"
                label="Confirmar contraseña"
                autoComplete="new-password"
                placeholder="Repite tu contraseña"
                minLength={8}
                onValueChange={setConfirm}
              />
            </div>

            {matchError && (
              <p className="text-sm text-rose-600" role="alert">
                {matchError}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:border-brand-500/40 hover:text-brand-600"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </button>
              <button
                type="submit"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong"
              >
                Crear cuenta
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-5 text-center text-sm">
        <Link
          href="/auth/login"
          className="font-medium text-brand-600 transition hover:text-brand-600"
        >
          ¿Ya tienes cuenta? Inicia sesión
        </Link>
      </div>
    </div>
  );
}

export default function RegistroPage() {
  return (
    <Suspense>
      <RegistroForm />
    </Suspense>
  );
}
