"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";

type StudentHit = {
  id: string;
  first_names: string;
  last_names: string;
  document_number: string;
};

type PeriodRow = { institution_id: string };

type DerivationHit = {
  id: string;
  derivation_date: string;
  motivo: string;
  derivador_nombre: string;
};

const TODAY_ISO = new Date().toISOString().slice(0, 10);

/**
 * CAS-02 — Crear Caso (compartido entre `/casos/nuevo` y el drawer de EST-04).
 * Reglas del spec: estudiante con período activo, situación obligatoria,
 * derivación opcional (sin duplicar Caso), responsable = Psicólogo de la I.E.
 * Crear un Caso NO está bloqueado por licencia vencida.
 */
export function CaseCreateForm({
  studentId,
  currentUserId,
  isPsychologist,
  onCreated,
  onCancel,
}: {
  studentId?: string | null;
  currentUserId: string | null;
  isPsychologist: boolean;
  onCreated: (caseId: string) => void;
  onCancel?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(studentId ?? null);
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [activePeriod, setActivePeriod] = useState<PeriodRow | null>(null);
  const [derivaciones, setDerivaciones] = useState<DerivationHit[]>([]);
  const [psychologists, setPsychologists] = useState<
    { user_id: string; full_name: string }[]
  >([]);
  const [loadingStudent, setLoadingStudent] = useState(false);

  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [situation, setSituation] = useState("");
  const [derivationId, setDerivationId] = useState("");
  const [responsible, setResponsible] = useState("");
  const [withDerivation, setWithDerivation] = useState(false);
  const [derFecha, setDerFecha] = useState(TODAY_ISO);
  const [derNombre, setDerNombre] = useState("");
  const [derCargo, setDerCargo] = useState("");
  const [derMotivo, setDerMotivo] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos del estudiante seleccionado: período activo, derivaciones y psicólogos
  useEffect(() => {
    if (!selectedId) {
      const raf = requestAnimationFrame(() => {
        setStudent(null);
        setActivePeriod(null);
        setDerivaciones([]);
        setPsychologists([]);
        setDerivationId("");
        setResponsible("");
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
            .select("institution_id")
            .eq("student_id", selectedId)
            .is("end_date", null)
            .maybeSingle(),
        ]);
        if (cancelled) return;

        setStudent((studentRes.data as StudentHit | null) ?? null);
        setActivePeriod((periodRes.data as PeriodRow | null) ?? null);

        const derRes = await supabase
          .from("derivaciones")
          .select("id, derivation_date, motivo, derivador_nombre")
          .eq("student_id", selectedId)
          .is("caso_id", null)
          .order("derivation_date", { ascending: false })
          .limit(20);
        if (cancelled) return;
        setDerivaciones((derRes.data as DerivationHit[]) ?? []);

        const instId = (periodRes.data as PeriodRow | null)?.institution_id ?? null;
        if (instId) {
          const { data } = await supabase.rpc("list_institution_psychologists", {
            p_institution_id: instId,
          });
          if (cancelled) return;
          setPsychologists((data as { user_id: string; full_name: string }[]) ?? []);
        } else {
          setPsychologists([]);
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("case.create.loadStudent", err);
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
      logClientError("case.create.search", err);
      setError(toUserMessage(err, "No se pudo buscar el estudiante"));
    } finally {
      setSearching(false);
    }
  };

  const effectiveResponsible =
    responsible || (isPsychologist && currentUserId ? currentUserId : "");

  const derivationMissing =
    withDerivation &&
    (!derFecha || !derNombre.trim() || !derCargo.trim() || !derMotivo.trim());

  const canSubmit =
    !!selectedId &&
    !!student &&
    !!activePeriod &&
    situation.trim().length > 0 &&
    !derivationMissing &&
    !loadingStudent &&
    !submitting &&
    (withDerivation || effectiveResponsible.length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      let data: { success?: boolean; error?: string; case_id?: string } | null;

      if (withDerivation) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "create_referral_with_case",
          {
            p_student_id: selectedId,
            p_derivation_date: derFecha,
            p_derivador_nombre: derNombre.trim(),
            p_derivador_cargo: derCargo.trim(),
            p_motivo: derMotivo.trim(),
            p_resumen: null,
            p_acciones_previas: null,
            p_adjunto_url: null,
            p_situation: situation.trim(),
            p_responsible_id: effectiveResponsible || null,
          }
        );
        if (rpcError) throw rpcError;
        data = rpcData;
      } else {
        const { data: rpcData, error: rpcError } = await supabase.rpc("create_case", {
          p_student_id: selectedId,
          p_situation: situation.trim(),
          p_derivation_id: derivationId || null,
          p_responsible_id: effectiveResponsible || null,
        });
        if (rpcError) throw rpcError;
        data = rpcData;
      }

      if (!data?.success || !data.case_id) {
        setError(data?.error ?? "No se pudo crear el caso");
        return;
      }

      onCreated(data.case_id);
    } catch (err) {
      logClientError("case.create.submit", err);
      setError(toUserMessage(err, "No se pudo crear el caso"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Paso 1: estudiante (si no viene precargado desde la ficha) */}
      {!selectedId ? (
        <div className="space-y-3">
          <Field label="Estudiante *">
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
                placeholder="Buscar por nombre o DNI..."
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
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-slate-50"
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
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-line bg-slate-50 px-4 py-3">
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
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
            >
              Cambiar
            </button>
          </div>

          {loadingStudent && (
            <p className="text-xs text-ink-muted">Cargando datos del estudiante...</p>
          )}

          {!loadingStudent && !activePeriod && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              El estudiante no tiene un período activo; no se puede crear un caso.
            </p>
          )}

          <Field label="Situación *">
            <textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              rows={3}
              placeholder="Describe la situación que motiva el caso..."
              className={inputClasses}
              required
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
                  {p.user_id === currentUserId ? " (yo)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Derivación (opcional)">
            <select
              value={derivationId}
              onChange={(e) => {
                setDerivationId(e.target.value);
                if (e.target.value) setWithDerivation(false);
              }}
              className={selectClasses}
            >
              <option value="">Sin derivación</option>
              {derivaciones.map((d) => (
                <option key={d.id} value={d.id}>
                  {new Date(d.derivation_date).toLocaleDateString("es-PE")} ·{" "}
                  {d.motivo.slice(0, 60)}
                </option>
              ))}
            </select>
          </Field>

          {derivaciones.length === 0 && !withDerivation && (
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={withDerivation}
                onChange={(e) => setWithDerivation(e.target.checked)}
                className="h-4 w-4 rounded border-line text-indigo-600"
              />
              Crear derivación ahora
            </label>
          )}

          {withDerivation && (
            <div className="space-y-3 rounded-xl border border-line bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Nueva derivación</p>
                <button
                  type="button"
                  onClick={() => setWithDerivation(false)}
                  className="text-xs text-ink-muted hover:underline"
                >
                  Quitar
                </button>
              </div>
              <Field label="Fecha del evento *">
                <input
                  type="date"
                  value={derFecha}
                  onChange={(e) => setDerFecha(e.target.value)}
                  className={inputClasses}
                />
              </Field>
              <Field label="Derivado por *">
                <input
                  type="text"
                  value={derNombre}
                  onChange={(e) => setDerNombre(e.target.value)}
                  placeholder="Nombre de quien deriva"
                  className={inputClasses}
                />
              </Field>
              <Field label="Cargo *">
                <input
                  type="text"
                  value={derCargo}
                  onChange={(e) => setDerCargo(e.target.value)}
                  placeholder="Cargo de quien deriva"
                  className={inputClasses}
                />
              </Field>
              <Field label="Motivo *">
                <textarea
                  value={derMotivo}
                  onChange={(e) => setDerMotivo(e.target.value)}
                  rows={2}
                  className={inputClasses}
                />
              </Field>
              <p className="text-xs text-ink-muted">
                La derivación y el caso se crean en una sola transacción.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass("secondary", "md")}>
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className={buttonClass("primary", "md")}
        >
          {submitting ? (
            <>
              <Icon name="spinner" className="h-4 w-4 animate-spin" />
              Creando...
            </>
          ) : (
            "Crear caso"
          )}
        </button>
      </div>
    </form>
  );
}
