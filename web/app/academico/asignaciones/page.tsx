"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useInstitutionScope } from "@/hooks/useInstitutionScope";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { SkeletonList } from "@/components/ui/skeleton";

type Assignment = {
  id: string;
  institution_id: string;
  user_id: string;
  school_year: number;
  nivel_id: string;
  grado_id: string;
  section: string;
  start_date: string;
  end_date: string | null;
  institutions: { name: string } | null;
  niveles_educativos: { name: string } | null;
  grados: { name: string } | null;
};

type Docente = {
  user_id: string;
  full_name: string;
  document_number: string | null;
};

type NivelOption = {
  id: string;
  name: string;
  grados: { id: string; name: string; order_number: number }[];
};

const STATUS_TONES: Record<string, BadgeTone> = {
  activa: "green",
  cerrada: "slate",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadAssignments(scope: string | null): Promise<Assignment[]> {
  const supabase = createClient();
  let query = supabase
    .from("asignaciones_docentes")
    .select(
      "id, institution_id, user_id, school_year, nivel_id, grado_id, section, start_date, end_date, institutions(name), niveles_educativos(name), grados(name)"
    )
    .order("school_year", { ascending: false });
  if (scope) query = query.eq("institution_id", scope);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Assignment[];
}

async function loadDocentes(institutionId: string | null): Promise<Docente[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_institution_docentes", {
    p_institution_id: institutionId,
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "No se pudieron listar los docentes");
  return (data.docentes ?? []) as Docente[];
}

async function loadNiveles(institutionId: string): Promise<NivelOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("niveles_educativos")
    .select("id, name, grados(id, name, order_number)")
    .eq("institution_id", institutionId)
    .order("order_number");
  if (error) throw error;
  const rows = (data ?? []) as unknown as NivelOption[];
  return rows.map((row) => ({
    ...row,
    grados: [...(row.grados ?? [])].sort((a, b) => a.order_number - b.order_number),
  }));
}

/**
 * ACA-02 — Asignación de docentes a año/nivel/grado/sección
 * (create_teaching_assignment / close_teaching_assignment + list_institution_docentes).
 */
export default function AcademicoAsignacionesPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const scope = useInstitutionScope(profile?.institution_id, isGlobal);

  const [rows, setRows] = useState<Assignment[] | null>(null);
  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [modalDocentes, setModalDocentes] = useState<Docente[]>([]);
  const [niveles, setNiveles] = useState<NivelOption[]>([]);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Assignment | null>(null);
  const [instSel, setInstSel] = useState("");
  const [docenteSel, setDocenteSel] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [nivelId, setNivelId] = useState("");
  const [gradoId, setGradoId] = useState("");
  const [section, setSection] = useState("A");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);
  const canManage = can(role, "academico.gestionar");
  const effectiveInst = isGlobal ? scope || instSel : profile?.institution_id ?? null;

  useEffect(() => {
    if (profileLoading || !role) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) setError(null);
    });
    loadAssignments(scope)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        logClientError("academico.asignaciones.load", err);
        if (!cancelled) {
          const msg = toUserMessage(err, "No se pudieron cargar las asignaciones");
          setError(
            /asignaciones_docentes|does not exist|schema cache/i.test(String(err?.message ?? ""))
              ? "La tabla asignaciones_docentes aún no está disponible. Ejecute las migraciones pendientes (053) y reintente."
              : msg
          );
        }
      })
      .finally(() => cancelAnimationFrame(raf));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [profileLoading, role, scope, reloadToken]);

  // Nombres de docentes para la tabla (una I.E. o la unión de las visibles)
  useEffect(() => {
    if (profileLoading || !role || !canManage || !rows || rows.length === 0) return;
    let cancelled = false;
    const instIds = [...new Set(rows.map((r) => r.institution_id))];
    Promise.all(
      instIds.map((id) => loadDocentes(id).catch(() => [] as Docente[]))
    ).then((results) => {
      if (!cancelled) setDocentes(results.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [profileLoading, role, canManage, rows]);

  // Catálogos para el modal de creación
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    const inst = effectiveInst;

    if (isGlobal && !scope && !instSel) {
      const supabase = createClient();
      supabase
        .from("institutions")
        .select("id, name")
        .order("name")
        .then(({ data, error }) => {
          if (!cancelled && !error) setInstitutions((data ?? []) as { id: string; name: string }[]);
        });
      return;
    }
    if (!inst) return;

    loadDocentes(inst)
      .then((d) => {
        if (!cancelled) setModalDocentes(d);
      })
      .catch((err) => {
        logClientError("academico.asignaciones.docentes", err);
        if (!cancelled) toast.error(toUserMessage(err, "No se pudieron listar los docentes"));
      });
    loadNiveles(inst)
      .then((n) => {
        if (!cancelled) setNiveles(n);
      })
      .catch(() => {
        if (!cancelled) setNiveles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [modalOpen, isGlobal, scope, instSel, effectiveInst]);

  const openCreate = () => {
    setDocenteSel("");
    setYear(String(new Date().getFullYear()));
    setNivelId("");
    setGradoId("");
    setSection("A");
    setStartDate(today());
    setInstSel(scope ?? "");
    setModalOpen(true);
  };

  const createAssignment = async () => {
    const inst = effectiveInst;
    if (!inst) {
      toast.error("Seleccione una institución educativa");
      return;
    }
    if (!docenteSel) {
      toast.error("Seleccione un docente");
      return;
    }
    if (!nivelId || !gradoId) {
      toast.error("Seleccione nivel y grado");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_teaching_assignment", {
        p_institution_id: inst,
        p_user_id: docenteSel,
        p_school_year: Number(year),
        p_nivel_id: nivelId,
        p_grado_id: gradoId,
        p_section: section,
        p_start_date: startDate || null,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error ?? "No se pudo crear la asignación");
        return;
      }
      toast.success("Asignación creada");
      setModalOpen(false);
      refresh();
    } catch (err) {
      logClientError("academico.asignaciones.create", err);
      toast.error(toUserMessage(err, "No se pudo crear la asignación"));
    }
    setSaving(false);
  };

  const closeAssignment = async () => {
    if (!closeTarget) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("close_teaching_assignment", {
        p_assignment_id: closeTarget.id,
        p_end_date: endDate || null,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error ?? "No se pudo cerrar la asignación");
        return;
      }
      toast.success("Asignación cerrada");
      setCloseTarget(null);
      refresh();
    } catch (err) {
      logClientError("academico.asignaciones.close", err);
      toast.error(toUserMessage(err, "No se pudo cerrar la asignación"));
    }
    setSaving(false);
  };

  if (profileLoading) return <LoadingScreen label="Cargando..." />;
  if (!profile) {
    return <RestrictedAccess message="Debe iniciar sesión para ver las asignaciones." />;
  }
  if (!canManage) {
    return <RestrictedAccess message="Su rol no puede gestionar asignaciones docentes." />;
  }

  const docenteName = (userId: string): string => {
    const found = docentes.find((d) => d.user_id === userId);
    return found?.full_name ?? userId.slice(0, 8);
  };

  const gradoActual = niveles.find((n) => n.id === nivelId)?.grados ?? [];

  return (
    <div>
      <PageHeader
        title="Asignaciones docentes"
        subtitle="Docente por año, nivel, grado y sección"
        breadcrumbs={[
          { label: "Académico", href: "/academico/niveles" },
          { label: "Asignaciones" },
        ]}
        actions={
          <button type="button" onClick={openCreate} className={buttonClass("primary", "md")}>
            Nueva asignación
          </button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {rows === null && !error && <SkeletonList rows={5} />}

      {rows !== null && rows.length === 0 && !error && (
        <EmptyState
          title="Sin asignaciones docentes"
          description="Asigne docentes a año/nivel/grado/sección para operar los filtros docente y el panel DASH-DO."
          action={
            <button
              type="button"
              onClick={openCreate}
              className={buttonClass("primary", "md")}
            >
              Nueva asignación
            </button>
          }
        />
      )}

      {rows !== null && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {/* Tabla desktop */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2.5">Año</th>
                <th className="px-4 py-2.5">Docente</th>
                <th className="px-4 py-2.5">Institución</th>
                <th className="px-4 py-2.5">Nivel / Grado</th>
                <th className="px-4 py-2.5">Sección</th>
                <th className="px-4 py-2.5">Desde</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const activa = !row.end_date;
                return (
                  <tr key={row.id} className="hover:bg-surface/60">
                    <td className="px-4 py-2.5 font-medium text-ink">{row.school_year}</td>
                    <td className="px-4 py-2.5 text-ink">{docenteName(row.user_id)}</td>
                    <td className="px-4 py-2.5 text-ink-muted">
                      {row.institutions?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink">
                      {row.niveles_educativos?.name ?? "—"} · {row.grados?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink">{row.section}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{row.start_date}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONES[activa ? "activa" : "cerrada"]}>
                        {activa ? "activa" : "cerrada"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {activa && (
                        <button
                          type="button"
                          onClick={() => {
                            setCloseTarget(row);
                            setEndDate(today());
                          }}
                          className={buttonClass("ghost", "sm")}
                        >
                          Cerrar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Tarjetas móvil */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map((row) => {
              const activa = !row.end_date;
              return (
                <li key={row.id} className="space-y-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink">
                      {row.school_year} · {docenteName(row.user_id)}
                    </p>
                    <Badge tone={STATUS_TONES[activa ? "activa" : "cerrada"]}>
                      {activa ? "activa" : "cerrada"}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {row.niveles_educativos?.name ?? "—"} · {row.grados?.name ?? "—"} ·
                    Sección {row.section} · {row.institutions?.name ?? "—"}
                  </p>
                  {activa && (
                    <button
                      type="button"
                      onClick={() => {
                        setCloseTarget(row);
                        setEndDate(today());
                      }}
                      className={buttonClass("ghost", "sm")}
                    >
                      Cerrar asignación
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Modal: nueva asignación */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva asignación docente">
        <div className="space-y-4">
          {isGlobal && !scope && (
            <Field label="Institución educativa *">
              <select
                value={instSel}
                onChange={(e) => setInstSel(e.target.value)}
                className={selectClasses}
              >
                <option value="">Seleccione…</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Docente *">
            <select
              value={docenteSel}
              onChange={(e) => setDocenteSel(e.target.value)}
              className={selectClasses}
            >
              <option value="">
                {effectiveInst ? "Seleccione…" : "Primero seleccione la I.E."}
              </option>
              {modalDocentes.map((doc) => (
                <option key={doc.user_id} value={doc.user_id}>
                  {doc.full_name}
                  {doc.document_number ? ` · ${doc.document_number}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Año escolar *">
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={inputClasses}
              />
            </Field>
            <Field label="Sección *">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className={selectClasses}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="U">U</option>
              </select>
            </Field>
          </div>

          <Field label="Nivel *">
            <select
              value={nivelId}
              onChange={(e) => {
                setNivelId(e.target.value);
                setGradoId("");
              }}
              className={selectClasses}
            >
              <option value="">Seleccione…</option>
              {niveles.map((nivel) => (
                <option key={nivel.id} value={nivel.id}>
                  {nivel.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Grado *">
            <select
              value={gradoId}
              onChange={(e) => setGradoId(e.target.value)}
              className={selectClasses}
              disabled={!nivelId}
            >
              <option value="">
                {nivelId ? "Seleccione…" : "Primero seleccione el nivel"}
              </option>
              {gradoActual.map((grado) => (
                <option key={grado.id} value={grado.id}>
                  {grado.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fecha de inicio">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClasses}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createAssignment}
              disabled={saving}
              className={buttonClass("primary", "md")}
            >
              {saving ? "Guardando…" : "Crear asignación"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: cerrar asignación */}
      <Modal
        open={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        title="Cerrar asignación"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {closeTarget
              ? `${closeTarget.school_year} · ${closeTarget.niveles_educativos?.name ?? ""} · ${
                  closeTarget.grados?.name ?? ""
                } · Sección ${closeTarget.section}`
              : ""}
          </p>
          <Field label="Fecha de cierre">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCloseTarget(null)}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={closeAssignment}
              disabled={saving}
              className={buttonClass("danger", "md")}
            >
              {saving ? "Cerrando…" : "Cerrar asignación"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
