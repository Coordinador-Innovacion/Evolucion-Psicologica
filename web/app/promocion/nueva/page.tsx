"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useInstitutionScope } from "@/hooks/useInstitutionScope";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { toast } from "sonner";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Stepper, type StepDef } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { PromotionExceptionsPanel } from "@/components/promocion/PromotionExceptionsPanel";
import { ErrorBanner, LoadingScreen, RestrictedAccess, Spinner } from "@/components/ui/feedback";

const ANIO_ACTUAL = new Date().getFullYear();

const STEPS: StepDef[] = [
  { id: 1, label: "Ámbito" },
  { id: 2, label: "Preparar" },
  { id: 3, label: "Revisar" },
  { id: 4, label: "Ejecutar" },
];

type PreviewStudent = {
  student_id: string;
  first_names: string;
  last_names: string;
  document_number: string;
  current_grado: string;
  current_nivel: string;
  section: string;
  is_egreso: boolean;
  next_grado_id: string | null;
  next_grado_name: string | null;
  next_nivel_id: string | null;
  next_nivel_name: string | null;
};

type Preview = {
  origin_year: number;
  destination_year: number;
  total_students: number;
  promoted: number;
  egreso: number;
  retired: number;
  students: PreviewStudent[] | null;
};

type PrepareData = {
  batch_id: string;
  status: string;
  total_students?: number;
  promoted?: number;
  egreso?: number;
  retired?: number;
  preview?: Preview;
  idempotent?: boolean;
  message?: string;
};

type ExecuteData = {
  batch_id: string;
  status: string;
  total: number;
  processed: number;
  egreso: number;
  errors: number;
  already_processed: number;
  idempotent?: boolean;
  message?: string;
};

function parsePreview(value: unknown): Preview | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Preview;
  if (!Array.isArray(p.students) && p.students !== null) {
    return { ...p, students: null };
  }
  return p;
}

/**
 * PRO-02 — Wizard de 4 pasos: Ámbito → Preparar → Revisar → Ejecutar.
 * Preparar crea el lote PREPARED sin mutar datos; Ejecutar aplica la
 * promoción con confirmación tipeada ("PROMOVER") y es idempotente.
 * La promoción es siempre manual (DC-011): sin opción de programar.
 */
export default function PromocionNuevaPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const scope = useInstitutionScope(profile?.institution_id, isGlobal);

  const [execLoading, setExecLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [originYear, setOriginYear] = useState(ANIO_ACTUAL - 1);
  const [destinationYear, setDestinationYear] = useState(ANIO_ACTUAL);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [prepareResult, setPrepareResult] = useState<PrepareData | null>(null);

  const [confirmText, setConfirmText] = useState("");
  const [execResult, setExecResult] = useState<ExecuteData | null>(null);
  const [idempotentHit, setIdempotentHit] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  // I.E. efectiva
  const effectiveInstitution = isGlobal ? institutionId : scope;

  useEffect(() => {
    if (profileLoading || !isGlobal) return;
    if (!can(role, "promocion.gestionar")) return;

    let cancelled = false;
    const raf = requestAnimationFrame(async () => {
      if (cancelled) return;
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("institutions")
          .select("id, name")
          .order("name");
        if (cancelled) return;
        if (fetchError) throw fetchError;
        setInstitutions((data ?? []) as { id: string; name: string }[]);
      } catch (err) {
        if (cancelled) return;
        logClientError("promocion.nueva.institutions", err);
        setError(toUserMessage(err, "Error al cargar instituciones"));
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [profileLoading, isGlobal, role]);

  const ambitoValid = Boolean(
    effectiveInstitution &&
      originYear &&
      destinationYear &&
      destinationYear > originYear
  );

  const markDone = (id: number) =>
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const canJump = (id: number): boolean => {
    if (id <= step) return true;
    if (id === 2) return ambitoValid;
    if (id === 3 || id === 4) return Boolean(batchId);
    return false;
  };

  const handlePrepare = async () => {
    if (!effectiveInstitution) return;
    setStepError(null);
    setExecLoading(true);
    const key = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(key);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("prepare_promotion", {
        p_institution_id: effectiveInstitution,
        p_origin_year: originYear,
        p_destination_year: destinationYear,
        p_idempotency_key: key,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        const serverError = String(data?.error ?? "");
        if (
          serverError.includes("Ya existe un lote de promoción activo para este contexto")
        ) {
          // Adoptar el lote activo del contexto y continuar.
          const { data: lote } = await supabase
            .from("lotes_promocion")
            .select("id, idempotency_key, counts")
            .eq("institution_id", effectiveInstitution)
            .eq("origin_year", originYear)
            .eq("destination_year", destinationYear)
            .in("status", ["PREPARED", "RUNNING"])
            .maybeSingle();
          if (lote) {
            const counts = (lote as { counts: unknown }).counts;
            const p =
              counts && typeof counts === "object"
                ? parsePreview((counts as Record<string, unknown>).preview)
                : null;
            setBatchId((lote as { id: string }).id);
            setIdempotencyKey((lote as { idempotency_key: string }).idempotency_key);
            setPreview(p);
            markDone(1);
            markDone(2);
            setStep(3);
            toast.info("Se adoptó el lote activo de este contexto");
            return;
          }
        }
        setStepError(serverError || "No se pudo preparar el lote de promoción.");
        return;
      }

      const prepared = data as unknown as PrepareData;
      setPrepareResult(prepared);
      setBatchId(prepared.batch_id);
      if (prepared.preview) {
        setPreview(parsePreview(prepared.preview));
      } else if (prepared.idempotent) {
        // Ruta idempotente sin preview: leerlo del lote.
        const { data: lote } = await supabase
          .from("lotes_promocion")
          .select("counts")
          .eq("id", prepared.batch_id)
          .maybeSingle();
        const counts = (lote as { counts: unknown } | null)?.counts;
        if (counts && typeof counts === "object") {
          setPreview(parsePreview((counts as Record<string, unknown>).preview));
        }
      }
      markDone(1);
      markDone(2);
      setStep(3);
    } catch (err) {
      logClientError("promocion.nueva.prepare", err);
      setStepError(toUserMessage(err, "No se pudo preparar el lote de promoción"));
    } finally {
      setExecLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!effectiveInstitution || !idempotencyKey) return;
    if (confirmText !== "PROMOVER") return;
    setStepError(null);
    setExecLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("execute_promotion", {
        p_institution_id: effectiveInstitution,
        p_origin_year: originYear,
        p_destination_year: destinationYear,
        p_idempotency_key: idempotencyKey,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        const serverError = String(data?.error ?? "");
        if (
          serverError.includes("Ya existe un lote de promoción activo para este contexto")
        ) {
          setStepError("Ya existe un lote de promoción activo para este contexto.");
        } else {
          setStepError(
            serverError ||
              "No se pudo ejecutar la promoción. Puedes reanudarla desde el detalle."
          );
        }
        return;
      }
      const executed = data as unknown as ExecuteData;
      setExecResult(executed);
      setBatchId(executed.batch_id);
      if (executed.idempotent) {
        setIdempotentHit(true);
        markDone(3);
        markDone(4);
        setStep(4);
        return;
      }
      toast.success("Promoción ejecutada");
      markDone(3);
      markDone(4);
      setStep(4);
    } catch (err) {
      logClientError("promocion.nueva.execute", err);
      setStepError(
        toUserMessage(err, "No se pudo ejecutar la promoción. Puedes reanudarla desde el detalle.")
      );
    } finally {
      setExecLoading(false);
    }
  };

  const grupos = useMemo(() => {
    if (!preview?.students) return [];
    const map = new Map<
      string,
      {
        key: string;
        origen: string;
        destino: string;
        count: number;
        cambioNivel: boolean;
        egreso: boolean;
      }
    >();
    for (const s of preview.students) {
      const origen = `${s.current_nivel} ${s.current_grado}`;
      const destino = s.is_egreso
        ? "Egreso"
        : `${s.next_nivel_name ?? ""} ${s.next_grado_name ?? ""}`.trim();
      const key = `${origen}→${destino}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          key,
          origen,
          destino,
          count: 1,
          cambioNivel: !s.is_egreso && s.current_nivel !== s.next_nivel_name,
          egreso: s.is_egreso,
        });
      }
    }
    return [...map.values()];
  }, [preview]);

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "promocion.gestionar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para gestionar promociones." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Nueva promoción"
        subtitle="Wizard de 4 pasos: Ámbito → Preparar → Revisar → Ejecutar."
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Promoción", href: "/promocion" },
          { label: "Nueva promoción" },
        ]}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {stepError && <ErrorBanner>{stepError}</ErrorBanner>}

      <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
        <Stepper
          steps={STEPS}
          active={step}
          completed={completed}
          onJump={(id) => setStep(id)}
          canJump={canJump}
        />
      </div>

      {/* Paso 1 — Ámbito */}
      {step === 1 && (
        <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">1 · Ámbito</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Institución educativa"
              hint={isGlobal ? undefined : "Fijada por tu perfil"}
            >
              {isGlobal ? (
                <select
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                  className={selectClasses}
                >
                  <option value="">Seleccionar I.E....</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  readOnly
                  value={institutions.find((i) => i.id === scope)?.name ?? "Mi institución"}
                  className={inputClasses}
                  disabled
                />
              )}
            </Field>
            <Field label="Año origen" hint="Año anterior (prefijado)">
              <input
                type="number"
                value={originYear}
                onChange={(e) => setOriginYear(Number(e.target.value))}
                className={inputClasses}
              />
            </Field>
            <Field label="Año destino" hint="Año actual (prefijado)">
              <input
                type="number"
                value={destinationYear}
                onChange={(e) => setDestinationYear(Number(e.target.value))}
                className={inputClasses}
              />
            </Field>
          </div>
          {destinationYear <= originYear && (
            <p className="mt-3 text-xs text-rose-600">
              El año destino debe ser mayor que el año origen.
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={!ambitoValid}
              onClick={() => {
                markDone(1);
                setStep(2);
              }}
              className={buttonClass("primary", "md")}
            >
              Continuar
            </button>
          </div>
        </section>
      )}

      {/* Paso 2 — Preparar */}
      {step === 2 && (
        <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">2 · Preparar</h2>
          <p className="mt-2 text-sm text-ink-muted">
            El botón <strong>Preparar lote</strong> llama a{" "}
            <code className="text-xs">prepare_promotion</code>: crea el lote en estado{" "}
            <strong>PREPARED</strong> con el preview calculado, sin mutar datos de
            estudiantes ni períodos. Los cambios se aplican solo al ejecutar.
          </p>
          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {institutions.find((i) => i.id === effectiveInstitution)?.name ??
              "Mi institución"}{" "}
            · {originYear} → {destinationYear}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handlePrepare()}
              disabled={execLoading}
              className={buttonClass("primary", "md")}
            >
              {execLoading ? <Spinner className="h-4 w-4" /> : null}
              {execLoading ? "Preparando..." : "Preparar lote"}
            </button>
          </div>
        </section>
      )}

      {/* Paso 3 — Revisar */}
      {step === 3 && (
        <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">3 · Revisar</h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-xs text-ink-muted">Total</p>
              <p className="text-lg font-bold text-ink">
                {preview?.total_students ?? prepareResult?.total_students ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-xs text-ink-muted">Promovidos</p>
              <p className="text-lg font-bold text-ink">
                {preview?.promoted ?? prepareResult?.promoted ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-xs text-ink-muted">Egreso</p>
              <p className="text-lg font-bold text-ink">
                {preview?.egreso ?? prepareResult?.egreso ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-xs text-ink-muted">Retirados excluidos</p>
              <p className="text-lg font-bold text-ink">
                {preview?.retired ?? prepareResult?.retired ?? 0}
              </p>
            </div>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-ink">Conteos por grado</h3>
          {grupos.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">
              No hay estudiantes en el preview.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {grupos.map((g) => (
                <li
                  key={g.key}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                >
                  <span className="font-medium text-ink">
                    {g.origen} → {g.destino}
                  </span>
                  <span className="flex items-center gap-2">
                    {g.cambioNivel && <Badge tone="indigo">Cambio de nivel</Badge>}
                    {g.egreso && <Badge tone="amber">Egreso</Badge>}
                    <span className="text-ink-muted">{g.count} estudiantes</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-ink-muted">
            Conflictos/solapamientos: el servidor no reporta conflictos en esta versión.
            Los retirados del año origen quedan excluidos del preview.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-ink">
            Excepciones (repetidores)
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            Las excepciones se aplican sobre las acciones pendientes del lote y se
            reflejarán al ejecutar. Cada excepción queda auditada con su motivo.
          </p>
          <div className="mt-2">
            {batchId ? (
              <PromotionExceptionsPanel batchId={batchId} />
            ) : (
              <p className="text-sm text-ink-muted">Prepara el lote para marcar excepciones.</p>
            )}
          </div>

          <div className="mt-5 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className={buttonClass("secondary", "md")}
            >
              Volver
            </button>
            <button
              type="button"
              onClick={() => {
                markDone(3);
                setStep(4);
              }}
              className={buttonClass("primary", "md")}
            >
              Continuar
            </button>
          </div>
        </section>
      )}

      {/* Paso 4 — Ejecutar */}
      {step === 4 && (
        <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">4 · Ejecutar</h2>

          {execResult || idempotentHit ? (
            <div className="mt-4 space-y-4">
              {idempotentHit ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  Ya existe una promoción completada para este contexto.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-line px-3 py-2.5">
                    <p className="text-xs text-ink-muted">Procesados</p>
                    <p className="text-lg font-bold text-ink">
                      {execResult?.processed ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2.5">
                    <p className="text-xs text-ink-muted">Total</p>
                    <p className="text-lg font-bold text-ink">{execResult?.total ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2.5">
                    <p className="text-xs text-ink-muted">Egreso</p>
                    <p className="text-lg font-bold text-ink">{execResult?.egreso ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-line px-3 py-2.5">
                    <p className="text-xs text-ink-muted">Con error</p>
                    <p className="text-lg font-bold text-ink">{execResult?.errors ?? 0}</p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill tone="green">
                  {execResult?.status ?? "COMPLETED"}
                </StatusPill>
                {execResult && execResult.errors > 0 && (
                  <Link
                    href={`/promocion/${execResult.batch_id}`}
                    className="text-sm font-medium text-indigo-600 underline"
                  >
                    Ver excepciones en el detalle
                  </Link>
                )}
                <Link
                  href={`/promocion/${execResult?.batch_id ?? batchId ?? ""}`}
                  className={buttonClass("secondary", "md")}
                >
                  Ver detalle del lote
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-ink-muted">
                Ejecutar aplica la promoción: cierra los períodos de {originYear} y crea
                los de {destinationYear} (o egreso en el último grado). La ejecución es
                idempotente y <strong>no se puede programar</strong>: la promoción es
                siempre manual (DC-011).
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label='Escribe "PROMOVER" para confirmar'
                  hint="La doble ejecución queda bloqueada: solo se procesa una vez."
                >
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="PROMOVER"
                    className={inputClasses}
                  />
                </Field>
              </div>
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className={buttonClass("secondary", "md")}
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={confirmText !== "PROMOVER" || execLoading}
                  onClick={() => void handleExecute()}
                  className={buttonClass("primary", "md")}
                >
                  {execLoading ? <Spinner className="h-4 w-4" /> : null}
                  {execLoading ? "Ejecutando..." : "Ejecutar promoción"}
                </button>
              </div>
              {execLoading && (
                <p className="text-sm text-ink-muted">
                  Procesando estudiantes del lote (procesados/total se confirma al
                  finalizar)...
                </p>
              )}
            </div>
          )}

          {execResult && !idempotentHit && (
            <div className="mt-4 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => router.push("/promocion")}
                className={buttonClass("ghost", "md")}
              >
                Volver a la lista
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
