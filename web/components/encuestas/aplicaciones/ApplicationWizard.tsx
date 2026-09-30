"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEncuestas } from "@/hooks/useEncuestas";
import { useUser } from "@/hooks/useUser";
import { useInstitutions } from "@/hooks/useInstitutions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Card,
  Field,
  inputClasses,
  selectClasses,
} from "@/components/ui/field";
import { Stepper, type StepDef } from "@/components/ui/stepper";
import { ErrorBanner, LoadingScreen } from "@/components/ui/feedback";

const STEPS: StepDef[] = [
  { id: 1, label: "Encuesta y versión" },
  { id: 2, label: "Año escolar" },
  { id: 3, label: "Respondientes" },
  { id: 4, label: "Ventana" },
  { id: 5, label: "Revisión" },
];

interface PublishedVersion {
  id: string;
  version_number: number;
  published_at: string | null;
}

interface SurveyOption {
  id: string;
  title: string;
  versions: PublishedVersion[];
}

interface StudentRow {
  student_id: string;
  grade_id: string;
  section: string;
  first_names: string;
  last_names: string;
  document_number: string;
  grade_name: string;
  level_name: string;
}

interface StaffRow {
  user_id: string;
  full_name: string;
  document_number: string;
}

function toLimaISO(local: string): string {
  return local ? new Date(`${local}:00-05:00`).toISOString() : "";
}

function formatLima(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApplicationWizard({
  initialSurveyId,
}: {
  initialSurveyId?: string;
}) {
  const router = useRouter();
  const { profile, loading: userLoading } = useUser();
  const { bulkCreateApplications } = useEncuestas();
  const isGlobal = profile?.role === "global";
  const { institutions } = useInstitutions(isGlobal === true);

  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [surveysLoading, setSurveysLoading] = useState(true);
  const [surveyId, setSurveyId] = useState(initialSurveyId ?? "");
  const [versionId, setVersionId] = useState("");

  const [institutionId, setInstitutionId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());

  const [respondentsLoading, setRespondentsLoading] = useState(false);
  const [respondentsLoaded, setRespondentsLoaded] = useState(false);
  const [respondentsError, setRespondentsError] = useState<string | null>(null);
  const [source, setSource] = useState<"estudiantes" | "docentes">(
    "estudiantes"
  );
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(
    new Set()
  );
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const [startedAt, setStartedAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [sameYearApps, setSameYearApps] = useState(0);
  const [creating, setCreating] = useState(false);

  const targetInstitution = isGlobal
    ? institutionId || profile?.institution_id || ""
    : profile?.institution_id || "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setSurveysLoading(true);
      try {
        const supabase = createClient();
        const { data, error: err } = await supabase
          .from("encuestas")
          .select(
            "id, title, created_at, encuesta_versiones(id, version_number, status, published_at)"
          )
          .order("created_at", { ascending: false });
        if (err) throw err;
        if (cancelled) return;
        const options: SurveyOption[] = [];
        for (const row of (data ?? []) as unknown as {
          id: string;
          title: string;
          encuesta_versiones: {
            id: string;
            version_number: number;
            status: string;
            published_at: string | null;
          }[];
        }[]) {
          const published = (row.encuesta_versiones ?? [])
            .filter((v) => v.status === "published")
            .sort((a, b) => b.version_number - a.version_number);
          if (published.length > 0) {
            options.push({
              id: row.id,
              title: row.title,
              versions: published.map((v) => ({
                id: v.id,
                version_number: v.version_number,
                published_at: v.published_at,
              })),
            });
          }
        }
        setSurveys(options);
        if (initialSurveyId && options.some((o) => o.id === initialSurveyId)) {
          setSurveyId(initialSurveyId);
          setVersionId(
            options.find((o) => o.id === initialSurveyId)?.versions[0]?.id ?? ""
          );
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("ApplicationWizard.surveys", err);
          setError(toUserMessage(err, "Error al cargar encuestas"));
        }
      }
      if (!cancelled) setSurveysLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [initialSurveyId]);

  const selectedSurvey = useMemo(
    () => surveys.find((s) => s.id === surveyId) ?? null,
    [surveys, surveyId]
  );

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!surveyId || year < 2000 || year > 2100) {
        if (!cancelled) setSameYearApps(0);
        return;
      }
      try {
        const supabase = createClient();
        const { data: versionRows } = await supabase
          .from("encuesta_versiones")
          .select("id")
          .eq("survey_id", surveyId);
        const ids = (versionRows ?? []).map((v) => v.id);
        if (ids.length === 0) {
          if (!cancelled) setSameYearApps(0);
          return;
        }
        const { count } = await supabase
          .from("encuesta_aplicaciones")
          .select("id", { count: "exact", head: true })
          .in("version_id", ids)
          .eq("year", year);
        if (!cancelled) setSameYearApps(count ?? 0);
      } catch {
        if (!cancelled) setSameYearApps(0);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [surveyId, year]);

  useEffect(() => {
    if (step < 3 || respondentsLoaded || !targetInstitution) return;
    let cancelled = false;
    async function load() {
      setRespondentsLoading(true);
      setRespondentsError(null);
      try {
        const supabase = createClient();
        const [periodsRes, staffRes] = await Promise.all([
          supabase
            .from("periodos_escolares")
            .select(
              "student_id, grado_id, section, grados(id, name, niveles_educativos(name)), estudiantes(id, first_names, last_names, document_number)"
            )
            .eq("institution_id", targetInstitution)
            .eq("school_year", year)
            .is("end_date", null),
          supabase.rpc("list_institution_docentes", {
            p_institution_id: targetInstitution,
          }),
        ]);
        if (cancelled) return;
        if (periodsRes.error) throw periodsRes.error;
        const rows: StudentRow[] = [];
        const seen = new Set<string>();
        for (const p of (periodsRes.data ?? []) as unknown as {
          student_id: string;
          grado_id: string;
          section: string;
          grados: {
            id: string;
            name: string;
            niveles_educativos: { name: string } | null;
          } | null;
          estudiantes: {
            id: string;
            first_names: string;
            last_names: string;
            document_number: string;
          } | null;
        }[]) {
          if (!p.estudiantes || seen.has(p.student_id)) continue;
          seen.add(p.student_id);
          rows.push({
            student_id: p.student_id,
            grade_id: p.grado_id,
            section: p.section,
            first_names: p.estudiantes.first_names,
            last_names: p.estudiantes.last_names,
            document_number: p.estudiantes.document_number,
            grade_name: p.grados?.name ?? "",
            level_name: p.grados?.niveles_educativos?.name ?? "",
          });
        }
        rows.sort(
          (a, b) =>
            a.level_name.localeCompare(b.level_name) ||
            a.grade_name.localeCompare(b.grade_name) ||
            a.section.localeCompare(b.section) ||
            a.last_names.localeCompare(b.last_names)
        );
        setStudents(rows);

        const staffData = staffRes.data as
          | { success?: boolean; error?: string; docentes?: StaffRow[] }
          | null;
        if (staffData?.success) {
          setStaff(staffData.docentes ?? []);
        } else {
          setStaff([]);
          setRespondentsError(
            staffData?.error || "No se pudo cargar el personal docente"
          );
        }
        setRespondentsLoaded(true);
      } catch (err) {
        if (!cancelled) {
          logClientError("ApplicationWizard.respondents", err);
          setRespondentsError(
            toUserMessage(err, "Error al cargar respondientes")
          );
        }
      }
      if (!cancelled) setRespondentsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [step, respondentsLoaded, targetInstitution, year]);

  const gradeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      if (!map.has(s.grade_id)) {
        map.set(s.grade_id, `${s.grade_name} · ${s.level_name}`);
      }
    }
    return [...map.entries()];
  }, [students]);

  const sectionOptions = useMemo(
    () => [...new Set(students.map((s) => s.section))].sort(),
    [students]
  );

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s) => {
      if (gradeFilter && s.grade_id !== gradeFilter) return false;
      if (sectionFilter && s.section !== sectionFilter) return false;
      if (
        term &&
        !`${s.first_names} ${s.last_names} ${s.document_number}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  }, [students, gradeFilter, sectionFilter, search]);

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff.filter((s) =>
      term
        ? `${s.full_name} ${s.document_number}`.toLowerCase().includes(term)
        : true
    );
  }, [staff, search]);

  const valid1 = Boolean(surveyId && versionId);
  const valid2 =
    Boolean(targetInstitution) && year >= 2000 && year <= 2100;
  const valid3 = selectedStudents.size + selectedUsers.size > 0;
  const valid4 = Boolean(
    startedAt &&
      endsAt &&
      new Date(toLimaISO(startedAt)) < new Date(toLimaISO(endsAt))
  );
  const validity: Record<number, boolean> = {
    1: valid1,
    2: valid2,
    3: valid3,
    4: valid4,
    5: true,
  };
  const completed = new Set(
    STEPS.filter((s) => s.id < step && validity[s.id]).map((s) => s.id)
  );

  const goNext = () => {
    if (!validity[step]) return;
    const next = Math.min(step + 1, 5);
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
    setError(null);
  };

  const goBack = () => {
    setStep((s) => Math.max(s - 1, 1));
    setError(null);
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    if (source === "estudiantes") {
      setSelectedStudents(new Set(filteredStudents.map((s) => s.student_id)));
    } else {
      setSelectedUsers(new Set(filteredStaff.map((s) => s.user_id)));
    }
  };

  const clearSelection = () => {
    setSelectedStudents(new Set());
    setSelectedUsers(new Set());
  };

  const handleCreate = async () => {
    if (!valid1 || !valid2 || !valid3 || !valid4) return;
    setCreating(true);
    setError(null);
    try {
      const studentIds = [...selectedStudents];
      const userIds = [...selectedUsers];
      const grades = new Set(
        studentIds
          .map((id) => students.find((s) => s.student_id === id)?.grade_id)
          .filter(Boolean)
      );
      const sections = new Set(
        studentIds
          .map((id) => students.find((s) => s.student_id === id)?.section)
          .filter(Boolean)
      );
      const result = await bulkCreateApplications({
        version_id: versionId,
        year,
        started_at: toLimaISO(startedAt),
        ends_at: toLimaISO(endsAt),
        grade_id: grades.size === 1 ? [...grades][0] : null,
        section_name: sections.size === 1 ? ([...sections][0] as string) : null,
        student_ids: studentIds,
        user_ids: userIds,
      });
      const firstId = result.application_ids[0];
      router.push(
        firstId ? `/encuestas/aplicaciones/${firstId}?links=1` : "/encuestas/aplicaciones"
      );
      return;
    } catch (err) {
      logClientError("ApplicationWizard.create", err);
      setError(toUserMessage(err, "Error al crear aplicaciones"));
    }
    setCreating(false);
  };

  if (userLoading) {
    return <LoadingScreen label="Cargando..." />;
  }

  const selectedStudentRows = students.filter((s) =>
    selectedStudents.has(s.student_id)
  );
  const selectedStaffRows = staff.filter((s) => selectedUsers.has(s.user_id));

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <Stepper
        steps={STEPS}
        active={step}
        completed={completed}
        onJump={(id) => {
          setStep(id);
          setError(null);
        }}
        canJump={(id) => id <= maxReached}
      />

      <Card className="p-6">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Encuesta y versión publicada
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Solo las versiones publicadas pueden generar aplicaciones.
              </p>
            </div>
            {surveysLoading ? (
              <LoadingScreen label="Cargando encuestas..." />
            ) : surveys.length === 0 ? (
              <p className="text-sm text-slate-500">
                No hay encuestas con versiones publicadas. Publica una versión
                primero.
              </p>
            ) : (
              <>
                <Field label="Encuesta *">
                  <select
                    value={surveyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSurveyId(id);
                      setVersionId(
                        surveys.find((s) => s.id === id)?.versions[0]?.id ?? ""
                      );
                    }}
                    className={selectClasses}
                  >
                    <option value="">Seleccionar encuesta...</option>
                    {surveys.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </Field>
                {selectedSurvey && (
                  <Field label="Versión publicada *">
                    <select
                      value={versionId}
                      onChange={(e) => setVersionId(e.target.value)}
                      className={selectClasses}
                    >
                      {selectedSurvey.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          Versión {v.version_number}
                          {v.published_at
                            ? ` — publicada ${new Date(
                                v.published_at
                              ).toLocaleDateString("es-PE")}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Año escolar y contexto
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                El año escolar agrupa las aplicaciones y los filtros de
                respondientes.
              </p>
            </div>
            {isGlobal && (
              <Field label="Institución educativa *">
                <select
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                  className={selectClasses}
                  required
                >
                  <option value="">Seleccione una institución</option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Año escolar *">
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || 0)}
                className={inputClasses}
              />
            </Field>
            {sameYearApps > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Ya existen {sameYearApps}{" "}
                {sameYearApps === 1 ? "aplicación" : "aplicaciones"} para esta
                encuesta en {year}. Se creará una nueva aplicación
                independiente.
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Respondientes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Se creará una aplicación con enlace propio por respondiente.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={source === "estudiantes" ? "primary" : "secondary"}
                onClick={() => {
                  setSource("estudiantes");
                  setSearch("");
                }}
              >
                Estudiantes ({students.length})
              </Button>
              <Button
                size="sm"
                variant={source === "docentes" ? "primary" : "secondary"}
                onClick={() => {
                  setSource("docentes");
                  setSearch("");
                  setGradeFilter("");
                  setSectionFilter("");
                }}
              >
                Docentes ({staff.length})
              </Button>
            </div>

            {respondentsLoading ? (
              <LoadingScreen label="Cargando respondientes..." />
            ) : (
              <>
                {respondentsError && (
                  <p className="text-sm text-rose-600">{respondentsError}</p>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Buscar" className="min-w-48 flex-1">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Nombre o documento"
                      className={inputClasses}
                    />
                  </Field>
                  {source === "estudiantes" && (
                    <>
                      <Field label="Grado">
                        <select
                          value={gradeFilter}
                          onChange={(e) => setGradeFilter(e.target.value)}
                          className={selectClasses}
                        >
                          <option value="">Todos</option>
                          {gradeOptions.map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Sección">
                        <select
                          value={sectionFilter}
                          onChange={(e) => setSectionFilter(e.target.value)}
                          className={selectClasses}
                        >
                          <option value="">Todas</option>
                          {sectionOptions.map((sec) => (
                            <option key={sec} value={sec}>
                              {sec}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={selectAllFiltered}
                    >
                      Seleccionar todos
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearSelection}>
                      Limpiar
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-slate-600">
                  Seleccionados: {selectedStudents.size + selectedUsers.size}
                </p>

                <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                  {source === "estudiantes" ? (
                    filteredStudents.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-slate-500">
                        No hay estudiantes para este año/grado.
                      </p>
                    ) : (
                      filteredStudents.map((s) => (
                        <label
                          key={s.student_id}
                          className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudents.has(s.student_id)}
                            onChange={() => toggleStudent(s.student_id)}
                            className="h-4 w-4"
                          />
                          <span className="flex-1 text-slate-800">
                            {s.last_names}, {s.first_names}
                          </span>
                          <span className="text-xs text-slate-500">
                            DNI {s.document_number} · {s.grade_name} {s.section}
                          </span>
                        </label>
                      ))
                    )
                  ) : filteredStaff.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">
                      No hay docentes disponibles.
                    </p>
                  ) : (
                    filteredStaff.map((s) => (
                      <label
                        key={s.user_id}
                        className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(s.user_id)}
                          onChange={() => toggleUser(s.user_id)}
                          className="h-4 w-4"
                        />
                        <span className="flex-1 text-slate-800">
                          {s.full_name}
                        </span>
                        <span className="text-xs text-slate-500">
                          DNI {s.document_number}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Ventana de respuesta
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Horario de Lima (GMT-5). Fuera de la ventana el enlace no
                estará disponible.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Inicio *">
                <input
                  type="datetime-local"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  className={inputClasses}
                  required
                />
              </Field>
              <Field label="Fin *">
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className={inputClasses}
                  required
                />
              </Field>
            </div>
            {startedAt && endsAt && !valid4 && (
              <p className="text-sm text-rose-600">
                La fecha de inicio debe ser anterior a la fecha de fin.
              </p>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Revisión
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Verifica los datos antes de crear las aplicaciones.
              </p>
            </div>
            <dl className="divide-y divide-line rounded-lg border border-line text-sm">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Encuesta</dt>
                <dd className="text-right font-medium text-slate-900">
                  {selectedSurvey?.title ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Versión</dt>
                <dd className="text-right font-medium text-slate-900">
                  V
                  {selectedSurvey?.versions.find((v) => v.id === versionId)
                    ?.version_number ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Año escolar</dt>
                <dd className="text-right font-medium text-slate-900">
                  {year}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Respondientes</dt>
                <dd className="text-right font-medium text-slate-900">
                  {selectedStudentRows.length} estudiante
                  {selectedStudentRows.length === 1 ? "" : "s"} ·{" "}
                  {selectedStaffRows.length} docente
                  {selectedStaffRows.length === 1 ? "" : "s"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Ventana (Lima)</dt>
                <dd className="text-right font-medium text-slate-900">
                  {formatLima(toLimaISO(startedAt))} —{" "}
                  {formatLima(toLimaISO(endsAt))}
                </dd>
              </div>
            </dl>
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {(selectedStudentRows.length + selectedStaffRows.length <= 8
                ? [
                    ...selectedStudentRows.map(
                      (s) => `${s.last_names}, ${s.first_names}`
                    ),
                    ...selectedStaffRows.map((s) => s.full_name),
                    ]
                : [
                    ...selectedStudentRows
                      .slice(0, 6)
                      .map((s) => `${s.last_names}, ${s.first_names}`),
                    ...selectedStaffRows
                      .slice(0, 2)
                      .map((s) => s.full_name),
                  ]
              ).join(" · ")}
              {selectedStudentRows.length + selectedStaffRows.length > 8 &&
                ` — y ${selectedStudentRows.length + selectedStaffRows.length - 8} más`}
            </div>
            {sameYearApps > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Ya existen aplicaciones para esta encuesta en {year}. Se creará
                una nueva aplicación independiente.
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={goBack}
            disabled={step === 1 || creating}
          >
            Atrás
          </Button>
          <div className="flex items-center gap-3">
            <LinkButton onClick={() => router.push("/encuestas/aplicaciones")}>
              Cancelar
            </LinkButton>
            {step < 5 ? (
              <Button onClick={goNext} disabled={!validity[step]}>
                Siguiente
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={
                  creating || !valid1 || !valid2 || !valid3 || !valid4
                }
              >
                {creating
                  ? "Creando..."
                  : `Crear ${
                      selectedStudents.size + selectedUsers.size
                    } aplicaciones`}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function LinkButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium text-slate-500 hover:text-slate-700"
    >
      {children}
    </button>
  );
}
