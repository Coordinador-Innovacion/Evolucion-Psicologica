"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useInstitutionScope } from "@/hooks/useInstitutionScope";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
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
    </div>
  );
}
