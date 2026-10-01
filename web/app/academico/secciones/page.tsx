"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useInstitutionScope } from "@/hooks/useInstitutionScope";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/button";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { SkeletonList } from "@/components/ui/skeleton";

type PeriodoActivo = {
  id: string;
  institution_id: string;
  school_year: number;
  nivel_id: string;
  grado_id: string;
  section: string;
  estudiantes: {
    id: string;
    first_names: string;
    last_names: string;
    document_number: string;
  } | null;
  niveles_educativos: { name: string } | null;
  grados: { name: string } | null;
  institutions: { name: string } | null;
};

type Group = {
  key: string;
  institution: string;
  school_year: number;
  nivel: string;
  grado: string;
  section: string;
  students: PeriodoActivo[];
};

type SeccionCat = {
  id: string;
  institution_id: string;
  name: string;
  active: boolean;
};

const SELECT =
  "id, institution_id, school_year, nivel_id, grado_id, section, " +
  "estudiantes(id, first_names, last_names, document_number), " +
  "niveles_educativos(name), grados(name), institutions(name)";

async function loadSecciones(scope: string | null): Promise<PeriodoActivo[]> {
  const supabase = createClient();
  let query = supabase
    .from("periodos_escolares")
    .select(SELECT)
    .is("end_date", null)
    .order("school_year", { ascending: false });
  if (scope) query = query.eq("institution_id", scope);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PeriodoActivo[];
}

/**
 * ACA-03 — Nómina por año/nivel/grado/sección con período activo.
 * Base visual para la promoción (conteos + estudiantes).
 */
export default function AcademicoSeccionesPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const scope = useInstitutionScope(profile?.institution_id, isGlobal);

  const [rows, setRows] = useState<PeriodoActivo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [yearF, setYearF] = useState("");
  const [nivelF, setNivelF] = useState("");
  const [gradoF, setGradoF] = useState("");
  const [sectionF, setSectionF] = useState("");

  const canManage = can(role, "academico.gestionar");

  // Catálogo de secciones (tabla secciones, 062) para agregar/editar secciones
  const [catRows, setCatRows] = useState<SeccionCat[] | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [catVersion, setCatVersion] = useState(0);
  const [catBusy, setCatBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SeccionCat | null>(null);

  useEffect(() => {
    if (profileLoading || !role) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) setError(null);
    });
    loadSecciones(scope)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        logClientError("academico.secciones.load", err);
        if (!cancelled) setError(toUserMessage(err, "No se pudo cargar la nómina"));
      })
      .finally(() => cancelAnimationFrame(raf));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [profileLoading, role, scope]);

  // Carga del catálogo de secciones de la I.E. en alcance
  useEffect(() => {
    if (profileLoading || !canManage) return;
    if (!scope) {
      const raf = requestAnimationFrame(() => setCatRows(null));
      return () => cancelAnimationFrame(raf);
    }
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("secciones")
      .select("id, institution_id, name, active")
      .eq("institution_id", scope)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setCatRows(null);
          setCatError("No se pudo cargar el catálogo de secciones.");
        } else {
          setCatRows((data ?? []) as unknown as SeccionCat[]);
          setCatError(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileLoading, canManage, scope, catVersion]);

  const catMessage = (err: unknown, fallback: string) => {
    logClientError("academico.secciones.catalogo", err);
    return toUserMessage(err, fallback);
  };

  const addSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope) return;
    const name = newName.trim().toUpperCase();
    if (!name) return;
    setCatBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("secciones")
      .insert({ institution_id: scope, name });
    if (error) {
      if (error.code === "23505") {
        toast.error(`La sección ${name} ya existe en el catálogo.`);
      } else {
        toast.error(catMessage(error, "No se pudo agregar la sección"));
      }
    } else {
      setNewName("");
      toast.success(`Sección ${name} agregada al catálogo`);
      setCatVersion((v) => v + 1);
    }
    setCatBusy(false);
  };

  const saveRename = async (row: SeccionCat) => {
    const name = editName.trim().toUpperCase();
    if (!name) return;
    setCatBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("secciones")
      .update({ name })
      .eq("id", row.id);
    if (error) {
      if (error.code === "23505") {
        toast.error(`La sección ${name} ya existe en el catálogo.`);
      } else {
        toast.error(catMessage(error, "No se pudo renombrar la sección"));
      }
    } else {
      setEditId(null);
      toast.success("Sección renombrada");
      setCatVersion((v) => v + 1);
    }
    setCatBusy(false);
  };

  const toggleActive = async (row: SeccionCat) => {
    setCatBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("secciones")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) {
      toast.error(catMessage(error, "No se pudo cambiar el estado"));
    } else {
      toast.success(row.active ? `Sección ${row.name} desactivada` : `Sección ${row.name} activada`);
      setCatVersion((v) => v + 1);
    }
    setCatBusy(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setCatBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("secciones")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error(catMessage(error, "No se pudo eliminar la sección"));
    } else {
      toast.success(`Sección ${deleteTarget.name} eliminada del catálogo`);
      setDeleteTarget(null);
      setCatVersion((v) => v + 1);
    }
    setCatBusy(false);
  };

  const years = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.school_year))].sort((a, b) => b - a),
    [rows]
  );
  const niveles = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows ?? []) map.set(r.nivel_id, r.niveles_educativos?.name ?? r.nivel_id);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const grados = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows ?? []) {
      if (!nivelF || r.nivel_id === nivelF) {
        map.set(r.grado_id, r.grados?.name ?? r.grado_id);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, nivelF]);
  const sections = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.section))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (yearF && String(row.school_year) !== yearF) return false;
      if (nivelF && row.nivel_id !== nivelF) return false;
      if (gradoF && row.grado_id !== gradoF) return false;
      if (sectionF && row.section !== sectionF) return false;
      if (needle) {
        const name = `${row.estudiantes?.first_names ?? ""} ${row.estudiantes?.last_names ?? ""}`.toLowerCase();
        const doc = row.estudiantes?.document_number ?? "";
        if (!name.includes(needle) && !doc.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, yearF, nivelF, gradoF, sectionF]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const row of filtered) {
      const key = `${row.institution_id}|${row.school_year}|${row.nivel_id}|${row.grado_id}|${row.section}`;
      const group =
        map.get(key) ??
        ({
          key,
          institution: row.institutions?.name ?? "—",
          school_year: row.school_year,
          nivel: row.niveles_educativos?.name ?? "—",
          grado: row.grados?.name ?? "—",
          section: row.section,
          students: [],
        } satisfies Group);
      group.students.push(row);
      map.set(key, group);
    }
    return [...map.values()].sort(
      (a, b) =>
        b.school_year - a.school_year ||
        a.institution.localeCompare(b.institution) ||
        a.nivel.localeCompare(b.nivel) ||
        a.grado.localeCompare(b.grado) ||
        a.section.localeCompare(b.section)
    );
  }, [filtered]);

  if (profileLoading) return <LoadingScreen label="Cargando..." />;
  if (!profile) {
    return <RestrictedAccess message="Debe iniciar sesión para ver la nómina de secciones." />;
  }
  if (!canManage) {
    return <RestrictedAccess message="Su rol no puede consultar la nómina académica." />;
  }

  return (
    <div>
      <PageHeader
        title="Nómina de secciones"
        subtitle="Estudiantes con período activo por año, nivel, grado y sección"
        breadcrumbs={[
          { label: "Académico", href: "/academico/niveles" },
          { label: "Secciones" },
        ]}
      />

      {error && (
        <div className="mb-4">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {canManage && (
        <Card className="mb-6 space-y-4 p-5">
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              Catálogo de secciones
            </h2>
            <p className="text-xs text-ink-muted">
              Secciones disponibles en los selectores de matrícula, retorno y
              transferencia de la institución.
            </p>
          </div>

          {!scope && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Seleccione una institución en el selector superior para gestionar sus
              secciones.
            </p>
          )}

          {scope && (
            <>
              <form onSubmit={addSection} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Nueva sección" hint="Máx. 10 caracteres" className="flex-1">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={10}
                    placeholder="Ej. C"
                    className={inputClasses}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={catBusy || !newName.trim()}
                  className={buttonClass("primary", "md")}
                >
                  Agregar
                </button>
              </form>

              {catError && <ErrorBanner>{catError}</ErrorBanner>}

              {catRows === null && !catError && <SkeletonList rows={2} />}

              {catRows && catRows.length === 0 && !catError && (
                <p className="text-sm text-ink-muted">
                  Sin secciones en el catálogo. Agregue al menos una para que aparezca en
                  los selectores.
                </p>
              )}

              {catRows && catRows.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {catRows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
                    >
                      {editId === row.id ? (
                        <>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={10}
                            className={`${inputClasses} w-24 py-1.5`}
                          />
                          <button
                            type="button"
                            onClick={() => saveRename(row)}
                            disabled={catBusy || !editName.trim()}
                            className="text-xs font-medium text-brand-700 hover:underline"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditId(null)}
                            className="text-xs text-ink-muted hover:underline"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            className={
                              row.active
                                ? "font-semibold text-ink"
                                : "text-ink-muted line-through"
                            }
                            title={row.active ? "Activa" : "Desactivada"}
                          >
                            {row.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditId(row.id);
                              setEditName(row.name);
                            }}
                            className="text-xs text-ink-muted hover:underline"
                          >
                            Renombrar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(row)}
                            disabled={catBusy}
                            className="text-xs text-ink-muted hover:underline"
                          >
                            {row.active ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="text-xs text-rose-600 hover:underline"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-ink-muted">
                Desactivar oculta la sección de los selectores; eliminar impide usarla en
                nuevas matrículas. Las matrículas existentes conservan su valor.
              </p>
            </>
          )}
        </Card>
      )}

      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Buscar estudiante">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre o DNI"
              className={inputClasses}
            />
          </Field>
          <Field label="Año">
            <select
              value={yearF}
              onChange={(e) => setYearF(e.target.value)}
              className={selectClasses}
            >
              <option value="">Todos</option>
              {years.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nivel">
            <select
              value={nivelF}
              onChange={(e) => {
                setNivelF(e.target.value);
                setGradoF("");
              }}
              className={selectClasses}
            >
              <option value="">Todos</option>
              {niveles.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grado">
            <select
              value={gradoF}
              onChange={(e) => setGradoF(e.target.value)}
              className={selectClasses}
            >
              <option value="">Todos</option>
              {grados.map(([id, name]) => (
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
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {rows === null && !error && <SkeletonList rows={6} />}

      {rows !== null && groups.length === 0 && !error && (
        <EmptyState
          title="Sin estudiantes con período activo"
          description="No hay matrículas activas para los filtros seleccionados."
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.key}
            className="rounded-2xl border border-line bg-white p-5 shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-ink">
                  {group.school_year} · {group.nivel} · {group.grado} · Sección{" "}
                  {group.section}
                </h2>
                <p className="text-xs text-ink-muted">{group.institution}</p>
              </div>
              <Badge tone="green">{group.students.length} estudiante(s)</Badge>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {group.students.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/estudiantes/${row.estudiantes?.id ?? ""}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm transition hover:border-brand-300 hover:bg-brand-soft"
                    title={
                      row.estudiantes?.document_number
                        ? `DNI ${row.estudiantes.document_number}`
                        : undefined
                    }
                  >
                    <span className="font-medium text-ink">
                      {row.estudiantes?.last_names ?? ""},{" "}
                      {row.estudiantes?.first_names ?? "—"}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {row.estudiantes?.document_number}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-ink-muted">
        Nómina basada en <code>periodos_escolares</code> con <code>end_date</code> nulo
        (período activo). Los conteos son la base visual para la promoción de estudiantes.
      </p>

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title="Eliminar sección del catálogo"
        >
          <p className="text-sm text-ink-muted">
            ¿Eliminar la sección <strong>{deleteTarget.name}</strong>? Las matrículas
            existentes conservan su valor, pero la sección no podrá elegirse en nuevas
            matrículas.
          </p>
          <div className="mt-4 flex justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={catBusy}
              className={buttonClass("danger", "md")}
            >
              {catBusy ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
