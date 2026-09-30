"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorBanner, LoadingScreen, RestrictedAccess, Spinner } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";

const TODAY_ISO = new Date().toISOString().slice(0, 10);

type StudentHit = {
  id: string;
  first_names: string;
  last_names: string;
  document_number: string;
};

type PeriodRow = { institution_id: string; is_active: boolean; end_date: string | null };

export default function NuevaDerivacionPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const { upload, uploading, error: uploadError } = useDocumentUpload();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [activePeriod, setActivePeriod] = useState<PeriodRow | null>(null);
  const [loadingStudent, setLoadingStudent] = useState(false);

  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [fecha, setFecha] = useState(TODAY_ISO);
  const [derivadorNombre, setDerivadorNombre] = useState("");
  const [derivadorCargo, setDerivadorCargo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [resumen, setResumen] = useState("");
  const [accionesPrevias, setAccionesPrevias] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [withCase, setWithCase] = useState(false);
  const [situation, setSituation] = useState("");
  const [responsible, setResponsible] = useState("");
  const [psychologists, setPsychologists] = useState<
    { user_id: string; full_name: string }[]
  >([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill desde ?student=
  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const query = new URLSearchParams(window.location.search);
      const prefill = query.get("student");
      if (prefill) setSelectedId(prefill);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Datos del estudiante seleccionado
  useEffect(() => {
    if (!selectedId) {
      const raf = requestAnimationFrame(() => {
        setStudent(null);
        setActivePeriod(null);
        setPsychologists([]);
        setLoadingStudent(false);
      });
      return () => cancelAnimationFrame(raf);
    }

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) {
        setLoadingStudent(true);
        setError(null);
      }
    });

    (async () => {
      try {
        const supabase = createClient();
        const [studentRes, periodRes] = await Promise.all([
          supabase
            .from("estudiantes")
            .select("id, first_names, last_names, document_number")
            .eq("id", selectedId)
            .maybeSingle(),
          supabase
            .from("periodos_escolares")
            .select("institution_id, is_active, end_date")
            .eq("student_id", selectedId)
            .order("start_date", { ascending: false })
            .limit(5),
        ]);
        if (cancelled) return;
        setStudent((studentRes.data as StudentHit | null) ?? null);

        const periods = (periodRes.data ?? []) as PeriodRow[];
        const active = periods.find((p) => p.is_active && !p.end_date) ?? null;
        setActivePeriod(active);

        const instId = active?.institution_id ?? null;
        if (instId) {
          const { data } = await supabase.rpc("list_institution_psychologists", {
            p_institution_id: instId,
          });
          if (cancelled) return;
          setPsychologists(
            (data as { user_id: string; full_name: string }[]) ?? []
          );
        } else {
          setPsychologists([]);
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("derivation.create.loadStudent", err);
          setError(toUserMessage(err, "No se pudo cargar el estudiante"));
        }
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoadingStudent(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [selectedId]);

  const runSearch = async () => {
    const term = search.trim().replace(/[,()*]/g, "");
    if (!term) return;
    setSearching(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: searchError } = await supabase
        .from("estudiantes")
        .select("id, first_names, last_names, document_number")
        .or(
          `first_names.ilike.%${term}%,last_names.ilike.%${term}%,document_number.eq.${term}`
        )
        .limit(10);
      if (searchError) throw searchError;
      setHits((data as StudentHit[]) ?? []);
      if ((data ?? []).length === 0) {
        setError("No se encontraron estudiantes con esa búsqueda.");
      }
    } catch (err) {
      logClientError("derivation.create.search", err);
      setError(toUserMessage(err, "No se pudo buscar el estudiante"));
    } finally {
      setSearching(false);
    }
  };

  const effectiveResponsible =
    responsible ||
    (profile?.role === "psicologo" && profile?.user_id ? profile.user_id : "");

  const needsCaseFields = withCase;
  const caseMissingPeriod = withCase && !activePeriod;

  const canSubmit =
    !!selectedId &&
    !!student &&
    fecha.length > 0 &&
    derivadorNombre.trim().length > 0 &&
    derivadorCargo.trim().length > 0 &&
    motivo.trim().length > 0 &&
    !caseMissingPeriod &&
    (!needsCaseFields ||
      (situation.trim().length > 0 && effectiveResponsible.length > 0)) &&
    !submitting &&
    !uploading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      let adjuntoUrl: string | null = null;
      if (file) {
        const uploaded = await upload(selectedId, file, "Adjunto de derivación");
        if (!uploaded) return; // uploadError muestra el detalle
        adjuntoUrl = `doc:${uploaded.document_id}`;
      }

      const supabase = createClient();
      let data: {
        success?: boolean;
        error?: string;
        derivation_id?: string;
        case_id?: string;
      } | null;

      if (withCase) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "create_referral_with_case",
          {
            p_student_id: selectedId,
            p_derivation_date: fecha,
            p_derivador_nombre: derivadorNombre.trim(),
            p_derivador_cargo: derivadorCargo.trim(),
            p_motivo: motivo.trim(),
            p_resumen: resumen.trim() || null,
            p_acciones_previas: accionesPrevias.trim() || null,
            p_adjunto_url: adjuntoUrl,
            p_situation: situation.trim(),
            p_responsible_id: effectiveResponsible || null,
          }
        );
        if (rpcError) throw rpcError;
        data = rpcData;
      } else {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "create_derivation",
          {
            p_student_id: selectedId,
            p_derivation_date: fecha,
            p_derivador_nombre: derivadorNombre.trim(),
            p_derivador_cargo: derivadorCargo.trim(),
            p_motivo: motivo.trim(),
            p_resumen: resumen.trim() || null,
            p_acciones_previas: accionesPrevias.trim() || null,
            p_adjunto_url: adjuntoUrl,
          }
        );
        if (rpcError) throw rpcError;
        data = rpcData;
      }

      if (!data?.success) {
        setError(data?.error ?? "No se pudo registrar la derivación");
        return;
      }

      if (withCase && data.case_id) {
        router.push(`/casos/${data.case_id}?nueva=1`);
      } else if (data.derivation_id) {
        router.push(`/derivaciones/${data.derivation_id}`);
      } else {
        router.push("/derivaciones");
      }
    } catch (err) {
      logClientError("derivation.create.submit", err);
      setError(toUserMessage(err, "No se pudo registrar la derivación"));
    } finally {
      setSubmitting(false);
    }
  };

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "derivaciones.crear")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para crear derivaciones." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Nueva derivación"
        subtitle="El período escolar se determina por la fecha del evento. El registrador se guarda automáticamente."
        breadcrumbs={[
          { label: "Derivaciones", href: "/derivaciones" },
          { label: "Nueva" },
        ]}
      />

      <form onSubmit={submit} className="space-y-6">
        {(error || uploadError) && (
          <ErrorBanner>{error ?? uploadError}</ErrorBanner>
        )}

        {/* Estudiante */}
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">Estudiante</h2>
          {!selectedId ? (
            <div className="mt-4 space-y-3">
              <Field label="Buscar estudiante *">
                <div className="flex gap-2">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void runSearch();
                      }
                    }}
                    placeholder="Nombre o DNI..."
                    className={inputClasses}
                    aria-label="Buscar estudiante"
                  />
                  <button
                    type="button"
                    onClick={() => void runSearch()}
                    disabled={searching || !search.trim()}
                    className={buttonClass("secondary", "md")}
                  >
                    {searching ? "Buscando..." : "Buscar"}
                  </button>
                </div>
              </Field>
              {hits.length > 0 && (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(hit.id);
                          setHits([]);
                          setSearch("");
                        }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-surface"
                      >
                        <span className="font-medium text-ink">
                          {hit.first_names} {hit.last_names}
                        </span>
                        <span className="text-xs text-ink-muted">
                          DNI {hit.document_number}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {student
                    ? `${student.first_names} ${student.last_names}`
                    : "Estudiante"}
                </p>
                {student && (
                  <p className="text-xs text-ink-muted">DNI {student.document_number}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {loadingStudent && <Spinner className="h-4 w-4" />}
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
                >
                  Cambiar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Datos de la derivación */}
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">Derivación</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fecha del evento *">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={inputClasses}
                max={TODAY_ISO}
              />
            </Field>
            <div />
            <Field label="Derivado por *">
              <input
                type="text"
                value={derivadorNombre}
                onChange={(e) => setDerivadorNombre(e.target.value)}
                placeholder="Nombre de quien deriva"
                className={inputClasses}
              />
            </Field>
            <Field label="Cargo *">
              <input
                type="text"
                value={derivadorCargo}
                onChange={(e) => setDerivadorCargo(e.target.value)}
                placeholder="Cargo de quien deriva"
                className={inputClasses}
              />
            </Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Motivo *">
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Motivo de la derivación..."
                className={inputClasses}
              />
            </Field>
            <Field label="Resumen">
              <textarea
                value={resumen}
                onChange={(e) => setResumen(e.target.value)}
                rows={2}
                className={inputClasses}
              />
            </Field>
            <Field label="Acciones previas">
              <textarea
                value={accionesPrevias}
                onChange={(e) => setAccionesPrevias(e.target.value)}
                rows={2}
                className={inputClasses}
              />
            </Field>
            <Field label="Adjunto (opcional)">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={inputClasses}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt,.rtf"
              />
              <p className="mt-1 text-xs text-ink-muted">
                PDF, imágenes, Office o texto. Máx. 50 MiB.
              </p>
            </Field>
          </div>
        </div>

        {/* Caso opcional */}
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <label className="flex items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={withCase}
              onChange={(e) => setWithCase(e.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            Crear Caso a partir de esta derivación
          </label>
          <p className="mt-1 text-xs text-ink-muted">
            Se crea en una sola transacción (todo o nada). Puede guardarse sin Caso.
          </p>

          {withCase && (
            <div className="mt-4 space-y-4">
              {caseMissingPeriod && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  El estudiante no tiene un período activo; no se puede crear un caso.
                </p>
              )}
              <Field label="Situación del caso *">
                <textarea
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  rows={3}
                  placeholder="Describe la situación que motiva el caso..."
                  className={inputClasses}
                />
              </Field>
              <Field label="Responsable (Psicólogo) *">
                <select
                  value={effectiveResponsible}
                  onChange={(e) => setResponsible(e.target.value)}
                  className={selectClasses}
                >
                  <option value="">Selecciona un Psicólogo...</option>
                  {psychologists.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.full_name}
                      {p.user_id === profile?.user_id ? " (yo)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push("/derivaciones")}
            className={buttonClass("secondary", "md")}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={buttonClass("primary", "md")}
          >
            {submitting || uploading ? (
              <>
                <Icon name="spinner" className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : withCase ? (
              "Crear derivación y caso"
            ) : (
              "Crear derivación"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
