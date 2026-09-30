"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

type VerifyStatus = "new" | "active_own" | "active_other" | "inactive";

type Props = {
  /** Ruta interna segura a la que volver (flujo de aplicación de encuesta). */
  desde: string | null;
};

function safeInternalPath(path: string | null): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

/**
 * EST-03 — Registro mínimo (S14): documento + nombres + apellidos + fecha de
 * nacimiento. Rol: Psicólogo (obligatorio); Docente no. Al terminar, si vino
 * desde una aplicación, vuelve a ella.
 */
export function MinimalRegistration({ desde }: Props) {
  const router = useRouter();
  const backTo = safeInternalPath(desde);

  const [docType, setDocType] = useState("DNI");
  const [dni, setDni] = useState("");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<VerifyStatus | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [firstNames, setFirstNames] = useState("");
  const [lastNames, setLastNames] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ count: number } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const reset = () => {
    setDni("");
    setStatus(null);
    setExistingId(null);
    setCheckError(null);
    setFirstNames("");
    setLastNames("");
    setBirthDate("");
    setSaveError(null);
    setDuplicates(null);
    setSavedId(null);
  };

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dni.trim()) return;
    setChecking(true);
    setCheckError(null);
    setStatus(null);
    setExistingId(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("verify_student_document", {
        p_document_type: docType,
        p_document_number: dni.trim(),
      });
      if (error) throw error;
      if (!data?.success) {
        setCheckError(data?.error ?? "No se pudo verificar el documento");
        return;
      }
      setStatus(data.status as VerifyStatus);
      setExistingId(data.student_id ?? null);
    } catch (err) {
      logClientError("estudiantes.minimo.verify", err);
      setCheckError(toUserMessage(err, "Error al verificar el documento"));
    }
    setChecking(false);
  };

  const handleRegister = async (e: React.FormEvent, force = false) => {
    e.preventDefault();
    if (!dni.trim() || !firstNames.trim() || !lastNames.trim() || !birthDate) return;
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_student", {
        p_first_names: firstNames.trim(),
        p_last_names: lastNames.trim(),
        p_document_type: docType,
        p_document_number: dni.trim(),
        p_birth_date: birthDate,
        p_force_create: force,
      });
      if (error) throw error;
      if (!data?.success) {
        if (data?.warning === "duplicate_detected") {
          setDuplicates({ count: (data.duplicates ?? []).length });
        } else {
          setSaveError(data?.error ?? "No se pudo registrar al estudiante");
        }
        return;
      }
      setDuplicates(null);
      setSavedId(data.student_id);
    } catch (err) {
      logClientError("estudiantes.minimo.register", err);
      setSaveError(toUserMessage(err, "Error al registrar estudiante"));
    }
    setSaving(false);
  };

  if (savedId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Registro mínimo completado"
          breadcrumbs={[
            { label: "Estudiantes", href: "/estudiantes" },
            { label: "Registro mínimo" },
          ]}
        />
        <Card className="space-y-4 p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-xl text-emerald-600">
            ✓
          </span>
          <h2 className="text-lg font-semibold text-ink">Estudiante registrado</h2>
          <p className="text-sm text-ink-muted">
            <strong>
              {firstNames} {lastNames}
            </strong>{" "}
            ha sido registrado con {docType} {dni}.{" "}
            <span className="text-xs">
              El estudiante ya puede acceder a la encuesta mediante su DNI.
            </span>
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className={buttonClass("secondary", "md")}>
              Registrar otro
            </button>
            <Link
              href={`/estudiantes/nuevo?doc=${encodeURIComponent(dni.trim())}&completar=1${
                backTo ? `&desde=${encodeURIComponent(backTo)}` : ""
              }`}
              className={buttonClass("primary", "md")}
            >
              Completar más datos
            </Link>
            <Link href={`/estudiantes/${savedId}`} className={buttonClass("ghost", "md")}>
              Ir a la ficha
            </Link>
            {backTo && (
              <Link href={backTo} className={buttonClass("ghost", "md")}>
                Volver a la aplicación
              </Link>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Registro mínimo de estudiante"
        subtitle="Datos mínimos obligatorios para habilitar el acceso del estudiante a encuestas"
        breadcrumbs={[
          { label: "Estudiantes", href: "/estudiantes" },
          { label: "Registro mínimo" },
        ]}
        actions={
          <Link href="/estudiantes/nuevo" className={buttonClass("secondary", "md")}>
            Registro completo
          </Link>
        }
      />

      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-semibold text-ink">1. Verificar documento</h2>
        <form onSubmit={handleCheck} className="flex flex-col gap-3 sm:flex-row">
          <label className="sm:w-56">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Tipo de documento
            </span>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className={selectClasses}
            >
              <option value="DNI">DNI</option>
              <option value="CE">Carné de Extranjería</option>
              <option value="PASS">Pasaporte</option>
            </select>
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Número de documento
            </span>
            <input
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="Ej. 70123456"
              inputMode="numeric"
              maxLength={20}
              className={inputClasses}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={checking || !dni.trim()}
              className={buttonClass("primary", "md")}
            >
              {checking ? "Verificando…" : "Verificar"}
            </button>
          </div>
        </form>

        {checkError && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {checkError}
          </p>
        )}

        {status === "active_own" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p>El estudiante ya existe con un período activo en su institución.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/estudiantes/${existingId}`}
                className={buttonClass("primary", "md")}
              >
                Ir a la ficha
              </Link>
            </div>
          </div>
        )}

        {status === "active_other" && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-semibold">Matrícula activa en otra institución</p>
            <p className="mt-1">
              El estudiante tiene un período activo en otra institución educativa. No es
              posible crear un registro nuevo: primero debe retirarse o transferirse
              desde su institución de origen.
            </p>
          </div>
        )}

        {status === "inactive" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p>
              El estudiante existe pero no tiene un período activo. Puede registrar un{" "}
              <strong>retorno</strong> (solo se abre un nuevo período, sin duplicar el
              estudiante).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/estudiantes/nuevo?doc=${encodeURIComponent(dni.trim())}&completar=1${
                  backTo ? `&desde=${encodeURIComponent(backTo)}` : ""
                }`}
                className={buttonClass("primary", "md")}
              >
                Registrar retorno
              </Link>
              <Link
                href={`/estudiantes/${existingId}`}
                className={buttonClass("secondary", "md")}
              >
                Ir a la ficha
              </Link>
            </div>
          </div>
        )}
      </Card>

      {status === "new" && (
        <Card className="space-y-4 p-6">
          <h2 className="text-sm font-semibold text-ink">2. Datos mínimos</h2>
          <p className="text-xs text-ink-muted">
            Documento nuevo: no existe ningún estudiante con {docType} {dni}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombres completos *">
              <input
                type="text"
                value={firstNames}
                onChange={(e) => setFirstNames(e.target.value)}
                placeholder="Nombres del estudiante"
                className={inputClasses}
                required
              />
            </Field>
            <Field label="Apellidos completos *">
              <input
                type="text"
                value={lastNames}
                onChange={(e) => setLastNames(e.target.value)}
                placeholder="Apellidos del estudiante"
                className={inputClasses}
                required
              />
            </Field>
            <Field label="Fecha de nacimiento *">
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className={inputClasses}
                required
              />
            </Field>
          </div>

          {duplicates && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">Posibles duplicados detectados</p>
              <p className="mt-1">
                Se encontraron {duplicates.count} registro(s) con datos similares. Verifique
                antes de continuar.
              </p>
              <button
                type="button"
                onClick={(e) => handleRegister(e, true)}
                disabled={saving}
                className={`mt-3 ${buttonClass("primary", "md")}`}
              >
                {saving ? "Forzando…" : "Forzar creación"}
              </button>
            </div>
          )}

          {saveError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {saveError}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={reset} className={buttonClass("secondary", "md")}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={(e) => handleRegister(e, false)}
              disabled={
                saving || !firstNames.trim() || !lastNames.trim() || !birthDate
              }
              className={buttonClass("primary", "md")}
            >
              {saving ? "Registrando…" : "Registrar estudiante"}
            </button>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-4 text-xs text-ink-muted">
            <span>
              El período escolar se completa luego con el registro completo.
            </span>
            <button
              type="button"
              onClick={() => router.push(`/estudiantes/nuevo?doc=${encodeURIComponent(dni.trim())}`)}
              className="text-brand-600 hover:underline"
            >
              Completar más datos ahora
            </button>
          </div>
        </Card>
      )}

      {status === null && !checkError && (
        <p className="text-xs text-ink-muted">
          Busque primero por DNI para verificar si el estudiante ya existe.
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-ink-muted">
        <Badge tone="indigo">S14</Badge>
        <span>Los datos clínicos se registran en la ficha del estudiante.</span>
      </div>
    </div>
  );
}
