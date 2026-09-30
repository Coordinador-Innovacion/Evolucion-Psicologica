"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { CaseStatusBadge } from "@/components/casos/CaseStatusBadge";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { CasoEstado } from "@/types/supabase";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorBanner, LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";

const PAGE_SIZE = 20;

type AtencionRow = {
  id: string;
  caso_id: string;
  fecha: string;
  casos: {
    id: string;
    estado: CasoEstado;
    current_responsible_id: string | null;
    estudiantes: {
      id: string;
      first_names: string;
      last_names: string;
      document_number: string;
    } | null;
  } | null;
};

function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AtencionesPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [rows, setRows] = useState<AtencionRow[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [tab, setTab] = useState("todas");
  const [search, setSearch] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [page, setPage] = useState(0);

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
          .from("atenciones")
          .select(
            `id, caso_id, fecha,
             casos(id, estado, current_responsible_id,
               estudiantes(id, first_names, last_names, document_number))`
          )
          .order("fecha", { ascending: false })
          .limit(300);
        if (cancelled) return;
        if (fetchError) throw fetchError;
        const list = (data ?? []) as unknown as AtencionRow[];
        setRows(list);

        const responsibleIds = [
          ...new Set(
            list.map((r) => r.casos?.current_responsible_id).filter((v): v is string => !!v)
          ),
        ].slice(0, 30);
        if (responsibleIds.length > 0) {
          const { data: names } = await supabase
            .from("perfiles")
            .select("user_id, full_name")
            .in("user_id", responsibleIds);
          if (cancelled) return;
          const map: Record<string, string> = {};
          for (const row of (names ?? []) as { user_id: string; full_name: string }[]) {
            map[row.user_id] = row.full_name;
          }
          setUserNames(map);
        } else {
          setUserNames({});
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("atenciones.load", err);
        setError(toUserMessage(err, "Error al cargar las atenciones"));
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
    return rows.filter((row) => {
      const student = row.casos?.estudiantes ?? null;
      if (q) {
        const haystack = student
          ? `${student.first_names} ${student.last_names} ${student.document_number}`.toLowerCase()
          : "";
        if (!haystack.includes(q)) return false;
      }
      if (desde && new Date(row.fecha) < new Date(`${desde}T00:00:00`)) return false;
      if (hasta && new Date(row.fecha) > new Date(`${hasta}T23:59:59`)) return false;
      if (estadoFilter && row.casos?.estado !== estadoFilter) return false;
      if (tab === "mia") {
        if (row.casos?.current_responsible_id !== profile?.user_id) return false;
      }
      if (tab === "sin_caso" && row.casos) return false;
      return true;
    });
  }, [rows, search, desde, hasta, estadoFilter, tab, profile?.user_id]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  if (profileLoading) {
    return <LoadingScreen label="Cargando perfil..." />;
  }

  if (!can(role, "atenciones.consultar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para ver las atenciones." />
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen label="Cargando atenciones..." />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Atenciones"
        subtitle="Lista global de atenciones psicológicas visibles para su rol."
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Atenciones" },
        ]}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Tabs
        tabs={[
          { id: "todas", label: "Todas", count: rows.length },
          { id: "mia", label: "Mi responsable" },
          { id: "sin_caso", label: "Sin caso" },
        ]}
        active={tab}
        onChange={(id) => {
          setTab(id);
          setPage(0);
        }}
      />

      <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Buscar estudiante">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o DNI..."
              className={inputClasses}
            />
          </Field>
          <Field label="Estado del caso">
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className={selectClasses}
            >
              <option value="">Todos</option>
              <option value="inicio">Inicio</option>
              <option value="en_proceso">En proceso</option>
              <option value="cerrado">Cerrado</option>
            </select>
          </Field>
          <Field label="Fecha desde">
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Fecha hasta">
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className={inputClasses}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white shadow-card">
        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin atenciones"
              description="No hay atenciones que coincidan con los filtros."
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((row) => {
              const student = row.casos?.estudiantes ?? null;
              const studentName = student
                ? `${student.first_names} ${student.last_names}`
                : "Estudiante";
              const responsible = row.casos?.current_responsible_id
                ? userNames[row.casos.current_responsible_id] ?? "—"
                : "—";
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {studentName}
                      {student && (
                        <span className="ml-2 font-normal text-ink-muted">
                          DNI {student.document_number}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {fmtDateTime(row.fecha)} · Responsable: {responsible}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {row.casos && <CaseStatusBadge estado={row.casos.estado} />}
                    <Link
                      href={`/casos/${row.caso_id}/atenciones/${row.id}`}
                      className={buttonClass("secondary", "sm")}
                    >
                      Ver
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <span>
            {filtered.length} atenciones · Página {currentPage + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className={buttonClass("secondary", "sm")}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage(currentPage + 1)}
              className={buttonClass("secondary", "sm")}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-ink-muted">
        Las notas clínicas no aparecen en esta lista. Abra la atención para ver su
        detalle.
      </p>
    </div>
  );
}
