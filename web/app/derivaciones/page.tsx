"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorBanner, LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";

const PAGE_SIZE = 20;

type DerRow = {
  id: string;
  derivation_date: string;
  derivador_nombre: string;
  derivador_cargo: string;
  motivo: string;
  caso_id: string | null;
  estudiantes: {
    id: string;
    first_names: string;
    last_names: string;
    document_number: string;
  } | null;
};

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function DerivacionesPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [rows, setRows] = useState<DerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [tab, setTab] = useState("todas");
  const [search, setSearch] = useState("");
  const [derivador, setDerivador] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
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
          .from("derivaciones")
          .select(
            `id, derivation_date, derivador_nombre, derivador_cargo, motivo, caso_id,
             estudiantes(id, first_names, last_names, document_number)`
          )
          .order("derivation_date", { ascending: false })
          .limit(300);
        if (cancelled) return;
        if (fetchError) throw fetchError;
        setRows((data ?? []) as unknown as DerRow[]);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("derivaciones.load", err);
        setError(toUserMessage(err, "Error al cargar las derivaciones"));
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
    const d = derivador.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab === "sin_caso" && row.caso_id) return false;
      if (tab === "con_caso" && !row.caso_id) return false;
      if (q) {
        const student = row.estudiantes;
        const haystack = student
          ? `${student.first_names} ${student.last_names} ${student.document_number}`.toLowerCase()
          : "";
        if (!haystack.includes(q)) return false;
      }
      if (d && !row.derivador_nombre.toLowerCase().includes(d)) return false;
      if (desde && row.derivation_date < desde) return false;
      if (hasta && row.derivation_date > hasta) return false;
      return true;
    });
  }, [rows, tab, search, derivador, desde, hasta]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );
  const sinCasoCount = rows.filter((r) => !r.caso_id).length;

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "derivaciones.consultar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para ver las derivaciones." />
      </div>
    );
  }

  if (loading) return <LoadingScreen label="Cargando derivaciones..." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Derivaciones"
        subtitle="Registro de derivaciones; el badge del menú cuenta las que no tienen Caso."
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Derivaciones" },
        ]}
        actions={
          can(role, "derivaciones.crear") ? (
            <Link href="/derivaciones/nueva" className={buttonClass("primary", "md")}>
              Nueva derivación
            </Link>
          ) : undefined
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Tabs
        tabs={[
          { id: "todas", label: "Todas", count: rows.length },
          { id: "sin_caso", label: "Sin Caso", count: sinCasoCount },
          { id: "con_caso", label: "Con Caso" },
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
          <Field label="Derivador">
            <input
              type="text"
              value={derivador}
              onChange={(e) => setDerivador(e.target.value)}
              placeholder="Nombre del derivador..."
              className={inputClasses}
            />
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
              title="Sin derivaciones"
              description="No hay derivaciones que coincidan con los filtros."
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((row) => {
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
                      {fmtDate(row.derivation_date)} · Derivador: {row.derivador_nombre}
                      {row.derivador_cargo ? ` (${row.derivador_cargo})` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={row.caso_id ? "indigo" : "amber"}>
                      {row.caso_id ? "Con Caso" : "Sin Caso"}
                    </Badge>
                    <Link
                      href={`/derivaciones/${row.id}`}
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
            {filtered.length} derivaciones · Página {currentPage + 1} de {totalPages}
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
    </div>
  );
}
