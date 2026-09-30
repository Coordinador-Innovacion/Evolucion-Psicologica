"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useInstitutionScope } from "@/hooks/useInstitutionScope";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/ui/feedback";
import { SkeletonList } from "@/components/ui/skeleton";

export type PeriodoRow = {
  id: string;
  student_id: string;
  institution_id: string;
  school_year: number;
  nivel_id: string;
  grado_id: string;
  section: string;
  start_date: string;
  end_date: string | null;
  tipo: string;
  motivo_retiro: string | null;
  estudiantes: {
    id: string;
    first_names: string;
    last_names: string;
    document_type: string;
    document_number: string;
    birth_date: string | null;
  } | null;
  niveles_educativos: { name: string } | null;
  grados: { name: string } | null;
  institutions: { name: string } | null;
};

type Assignment = {
  school_year: number;
  nivel_id: string;
  grado_id: string;
  section: string;
};

export type LoadedStudents = {
  rows: PeriodoRow[];
  openCaseIds: string[];
  assignments: Assignment[] | null;
  assignmentsFallback: boolean;
  institutions: { id: string; name: string }[];
};

const PERIOD_SELECT =
  "id, student_id, institution_id, school_year, nivel_id, grado_id, section, start_date, end_date, tipo, motivo_retiro, " +
  "estudiantes(id, first_names, last_names, document_type, document_number, birth_date), " +
  "niveles_educativos(name), grados(name), institutions(name)";

export function estadoPeriodo(row: Pick<PeriodoRow, "end_date" | "tipo">): string {
  if (!row.end_date) return "activo";
  return row.tipo === "retiro" ? "retirado" : "egresado";
}

export const ESTADO_TONES: Record<string, BadgeTone> = {
  activo: "green",
  retirado: "amber",
  egresado: "slate",
};

function matchesAssignments(
  row: PeriodoRow,
  assignments: Assignment[] | null
): boolean {
  if (!assignments) return true;
  if (assignments.length === 0) return false;
  return assignments.some(
    (a) =>
      a.school_year === row.school_year &&
      a.nivel_id === row.nivel_id &&
      a.grado_id === row.grado_id &&
      (a.section === "U" || a.section === row.section)
  );
}

export async function loadStudents(
  role: string,
  scope: string | null
): Promise<LoadedStudents> {
  const supabase = createClient();

  let query = supabase
    .from("periodos_escolares")
    .select(PERIOD_SELECT)
    .order("start_date", { ascending: false })
    .limit(2000);
  if (scope) query = query.eq("institution_id", scope);

  const { data, error } = await query;
  if (error) throw error;

  const [casosRes, asignRes, instRes] = await Promise.all([
    supabase
      .from("casos")
      .select("student_id")
      .in("estado", ["inicio", "en_proceso"]),
    role === "docente"
      ? supabase
          .from("asignaciones_docentes")
          .select("school_year, nivel_id, grado_id, section")
          .is("end_date", null)
      : Promise.resolve({ data: null, error: null }),
    role === "global"
      ? supabase.from("institutions").select("id, name").order("name")
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    rows: (data ?? []) as unknown as PeriodoRow[],
    openCaseIds: (casosRes.data ?? []).map((r) => r.student_id),
    assignments:
      role === "docente"
        ? asignRes.error
          ? null
          : ((asignRes.data ?? []) as unknown as Assignment[])
        : null,
    assignmentsFallback: role === "docente" && !!asignRes.error,
    institutions: (instRes.data ?? []) as { id: string; name: string }[],
  };
}

export default function EstudiantesPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const scope = useInstitutionScope(profile?.institution_id, isGlobal);

  const [loaded, setLoaded] = useState<LoadedStudents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [yearF, setYearF] = useState("");
  const [nivelF, setNivelF] = useState("");
  const [gradoF, setGradoF] = useState("");
  const [sectionF, setSectionF] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [ieF, setIeF] = useState("");
  const [conCaso, setConCaso] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!role) {
      const id = requestAnimationFrame(() => {
        setLoaded(null);
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) setLoading(true);
    });
    loadStudents(role, scope)
      .then((result) => {
        if (!cancelled) {
          setLoaded(result);
          setError(null);
        }
      })
      .catch((err) => {
        logClientError("estudiantes.load", err);
        if (!cancelled) setError(toUserMessage(err, "Error al cargar estudiantes"));
      })
      .finally(() => {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [role, scope]);

  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: PeriodoRow[] = [];
    for (const row of loaded?.rows ?? []) {
      if (seen.has(row.student_id)) continue;
      seen.add(row.student_id);
      out.push(row);
    }
    return out;
  }, [loaded]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const openCases = new Set(loaded?.openCaseIds ?? []);
    return deduped.filter((row) => {
      const est = row.estudiantes;
      if (!est) return false;
      if (role === "docente" && !matchesAssignments(row, loaded?.assignments ?? null)) {
        return false;
      }
      if (ieF && row.institution_id !== ieF) return false;
      if (yearF && String(row.school_year) !== yearF) return false;
      if (nivelF && row.nivel_id !== nivelF) return false;
      if (gradoF && row.grado_id !== gradoF) return false;
      if (sectionF && row.section !== sectionF) return false;
      if (estadoF && estadoPeriodo(row) !== estadoF) return false;
      if (conCaso && !openCases.has(row.student_id)) return false;
      if (needle) {
        const haystack = [
          est.first_names,
          est.last_names,
          `${est.first_names} ${est.last_names}`,
          est.document_number,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [deduped, loaded, q, ieF, yearF, nivelF, gradoF, sectionF, estadoF, conCaso, role]);

  const options = useMemo(() => {
    const years = new Set<string>();
    const niveles = new Map<string, string>();
    const grados = new Map<string, string>();
    const secciones = new Set<string>();
    for (const row of deduped) {
      if (ieF && row.institution_id !== ieF) continue;
      if (role === "docente" && !matchesAssignments(row, loaded?.assignments ?? null)) {
        continue;
      }
      years.add(String(row.school_year));
      if (row.niveles_educativos) niveles.set(row.nivel_id, row.niveles_educativos.name);
      if (row.grados) grados.set(row.grado_id, row.grados.name);
      secciones.add(row.section);
    }
    return {
      years: [...years].sort((a, b) => Number(b) - Number(a)),
      niveles: [...niveles.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      grados: [...grados.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      secciones: [...secciones].sort(),
    };
  }, [deduped, ieF, loaded, role]);

  const selected = useMemo(
    () => filtered.find((row) => row.student_id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  if (profileLoading || (loading && !loaded)) {
    return (
      <div className="mx-auto max-w-7xl">
        <LoadingScreen label="Cargando estudiantes..." />
      </div>
    );
  }

  if (!profile || !role) {
    return (
      <div className="mx-auto max-w-7xl">
        <EmptyState title="Debe iniciar sesión para ver los estudiantes." />
      </div>
    );
  }

  const canRegister = can(role, "estudiantes.registro");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Estudiantes"
        subtitle="Búsqueda, matrícula y seguimiento por institución"
        actions={
          canRegister ? (
            <>
              <Link href="/estudiantes/nuevo" className={buttonClass("primary", "md")}>
                Registrar estudiante
              </Link>
              <Link
                href="/estudiantes/nuevo?modo=minimo"
                className={buttonClass("secondary", "md")}
              >
                Registro mínimo
              </Link>
            </>
          ) : undefined
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {role === "docente" && loaded?.assignmentsFallback && (
        <p className="mb-4 rounded-xl border border-line bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No se pudieron cargar tus asignaciones; se muestra todos los estudiantes
          visibles de tu institución.
        </p>
      )}
      {role === "docente" && loaded && !loaded.assignmentsFallback && (loaded.assignments?.length ?? 0) === 0 && (
        <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          No tienes asignaciones activas; se muestra todos los estudiantes visibles de
          tu institución.
        </p>
      )}

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Buscar por nombre o DNI">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ej. María o 70123456"
              className={inputClasses}
            />
          </Field>
          {isGlobal && (
            <Field label="Institución">
              <select
                value={ieF}
                onChange={(e) => setIeF(e.target.value)}
                className={selectClasses}
              >
                <option value="">Todas las I.E.</option>
                {(loaded?.institutions ?? []).map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Año escolar">
            <select value={yearF} onChange={(e) => setYearF(e.target.value)} className={selectClasses}>
              <option value="">Todos</option>
              {options.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nivel">
            <select value={nivelF} onChange={(e) => setNivelF(e.target.value)} className={selectClasses}>
              <option value="">Todos</option>
              {options.niveles.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grado">
            <select value={gradoF} onChange={(e) => setGradoF(e.target.value)} className={selectClasses}>
              <option value="">Todos</option>
              {options.grados.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sección">
            <select
              value={sectionF}
              onChange={(e) => setSectionF(e.target.value)}
              className={selectClasses}
            >
              <option value="">Todas</option>
              {options.secciones.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado del período">
            <select
              value={estadoF}
              onChange={(e) => setEstadoF(e.target.value)}
              className={selectClasses}
            >
              <option value="">Todos</option>
              <option value="activo">Activo</option>
              <option value="retirado">Retirado</option>
              <option value="egresado">Egresado</option>
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={conCaso}
              onChange={(e) => setConCaso(e.target.checked)}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
            />
            Solo con caso abierto
          </label>
        </div>
      </Card>

      {loading && (
        <div className="mb-4 rounded-xl border border-line bg-surface px-4 py-2 text-sm text-ink-muted">
          Actualizando listado…
        </div>
      )}

      {filtered.length === 0 && !loading ? (
        <EmptyState
          title="No se encontraron estudiantes"
          description="Ajusta la búsqueda o los filtros. Si es un registro nuevo, usa los botones de la cabecera."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            {/* Escritorio: tabla */}
            <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-card md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3 font-semibold">Estudiante</th>
                    <th className="px-4 py-3 font-semibold">Documento</th>
                    <th className="px-4 py-3 font-semibold">Grado · Sección</th>
                    <th className="px-4 py-3 font-semibold">Año</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Caso</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const est = row.estudiantes!;
                    const estado = estadoPeriodo(row);
                    const hasCase = (loaded?.openCaseIds ?? []).includes(row.student_id);
                    const isSelected = selected?.student_id === row.student_id;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.student_id)}
                        className={`cursor-pointer border-b border-line last:border-0 transition ${
                          isSelected ? "bg-primary-soft/60" : "hover:bg-surface"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={`${est.first_names} ${est.last_names}`}
                              size="sm"
                            />
                            <div>
                              <p className="font-medium text-ink">
                                {est.first_names} {est.last_names}
                              </p>
                              {isGlobal && row.institutions && (
                                <p className="text-xs text-ink-muted">
                                  {row.institutions.name}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          {est.document_type} {est.document_number}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          {row.grados?.name ?? "—"} · {row.section}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">{row.school_year}</td>
                        <td className="px-4 py-3">
                          <Badge tone={ESTADO_TONES[estado]}>{estado}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {hasCase ? (
                            <Badge tone="amber">abiertos</Badge>
                          ) : (
                            <span className="text-xs text-ink-muted">sin caso</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas */}
            <div className="grid gap-3 md:hidden">
              {filtered.map((row) => {
                const est = row.estudiantes!;
                const estado = estadoPeriodo(row);
                return (
                  <Link
                    key={row.id}
                    href={`/estudiantes/${row.student_id}`}
                    className="rounded-2xl border border-line bg-white p-4 shadow-card"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={`${est.first_names} ${est.last_names}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">
                          {est.first_names} {est.last_names}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {est.document_type} {est.document_number}
                        </p>
                      </div>
                      <Badge tone={ESTADO_TONES[estado]}>{estado}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">
                      {row.grados?.name ?? "—"} · Sección {row.section} · {row.school_year}
                    </p>
                  </Link>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-ink-muted">
              Mostrando {filtered.length} de {deduped.length} estudiantes con período
              registrado.
            </p>
          </div>

          {/* Panel de detalle (escritorio) */}
          <aside className="hidden lg:block">
            {selected ? (
              <Card className="sticky top-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={`${selected.estudiantes?.first_names} ${selected.estudiantes?.last_names}`}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-bold text-ink">
                      {selected.estudiantes?.first_names} {selected.estudiantes?.last_names}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {selected.estudiantes?.document_type}{" "}
                      {selected.estudiantes?.document_number}
                    </p>
                  </div>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Grado · Sección</dt>
                    <dd className="text-right font-medium text-ink">
                      {selected.grados?.name ?? "—"} · {selected.section}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Año escolar</dt>
                    <dd className="font-medium text-ink">{selected.school_year}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Nivel</dt>
                    <dd className="font-medium text-ink">
                      {selected.niveles_educativos?.name ?? "—"}
                    </dd>
                  </div>
                  {isGlobal && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-muted">Institución</dt>
                      <dd className="text-right font-medium text-ink">
                        {selected.institutions?.name ?? "—"}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Período</dt>
                    <dd>
                      <Badge tone={ESTADO_TONES[estadoPeriodo(selected)]}>
                        {estadoPeriodo(selected)}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Caso</dt>
                    <dd>
                      {(loaded?.openCaseIds ?? []).includes(selected.student_id) ? (
                        <Badge tone="amber">caso abierto</Badge>
                      ) : (
                        <Badge tone="slate">sin caso</Badge>
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/estudiantes/${selected.student_id}`}
                    className={buttonClass("primary", "md")}
                  >
                    Ver ficha completa
                  </Link>
                  {canRegister && (
                    <button
                      type="button"
                      onClick={() => router.push(`/estudiantes/nuevo?doc=${selected.estudiantes?.document_number ?? ""}&completar=1`)}
                      className={buttonClass("secondary", "md")}
                    >
                      Completar datos
                    </button>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="p-6 text-center text-sm text-ink-muted">
                Selecciona un estudiante para ver el detalle.
              </Card>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
