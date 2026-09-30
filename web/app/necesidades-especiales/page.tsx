"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Field, inputClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorBanner, LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";

type NeedRow = {
  id: string;
  condition_type: string;
  teacher_orientation: string | null;
  certifying_entity: string | null;
  certification_date: string | null;
  estudiantes: {
    id: string;
    first_names: string;
    last_names: string;
    document_number: string;
  } | null;
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function NecesidadesEspecialesPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [rows, setRows] = useState<NeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [condicion, setCondicion] = useState("");

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("necesidades_especiales")
          .select(
            `id, condition_type, teacher_orientation, certifying_entity, certification_date,
             estudiantes(id, first_names, last_names, document_number)`
          )
          .order("updated_at", { ascending: false })
          .limit(300);
        if (cancelled) return;
        if (fetchError) throw fetchError;
        setRows((data ?? []) as unknown as NeedRow[]);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("necesidades.load", err);
        setError(toUserMessage(err, "Error al cargar las necesidades especiales"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [reloadVersion]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const c = condicion.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const student = row.estudiantes;
        const haystack = student
          ? `${student.first_names} ${student.last_names} ${student.document_number}`.toLowerCase()
          : "";
        if (!haystack.includes(q)) return false;
      }
      if (c && !row.condition_type.toLowerCase().includes(c)) return false;
      return true;
    });
  }, [rows, search, condicion]);

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "necesidades.consultar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para ver las necesidades especiales." />
      </div>
    );
  }

  if (loading) return <LoadingScreen label="Cargando necesidades especiales..." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Necesidades especiales"
        subtitle="Una sola entidad por estudiante. La orientación docente es de solo lectura."
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Necesidades especiales" },
        ]}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Buscar estudiante">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o DNI..."
              className={inputClasses}
            />
          </Field>
          <Field label="Condición">
            <input
              type="text"
              value={condicion}
              onChange={(e) => setCondicion(e.target.value)}
              placeholder="Tipo de condición..."
              className={inputClasses}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white shadow-card">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin necesidades especiales"
              description="No hay registros que coincidan con los filtros."
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((row) => {
              const student = row.estudiantes;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {student
                        ? `${student.first_names} ${student.last_names}`
                        : "Estudiante"}
                      {student && (
                        <span className="ml-2 font-normal text-ink-muted">
                          DNI {student.document_number}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {row.condition_type}
                      {row.certifying_entity
                        ? ` · ${row.certifying_entity}`
                        : ""}
                      {row.certification_date
                        ? ` · certificada ${fmtDate(row.certification_date)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {row.teacher_orientation && (
                      <Badge tone="indigo">con orientación</Badge>
                    )}
                    {student && (
                      <Link
                        href={`/estudiantes/${student.id}`}
                        className={buttonClass("secondary", "sm")}
                      >
                        Ver ficha
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-ink-muted">
        El alta y la edición se realizan desde la pestaña «Necesidad especial» de
        la ficha del estudiante (NEC-01).
      </p>
    </div>
  );
}
