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
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icons";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/ui/feedback";

interface CaseListItem {
  id: string;
  situation: string;
  estado: CasoEstado;
  opened_at: string;
  updated_at: string;
  derivation_id: string | null;
  current_responsible_id: string | null;
  student_id: string;
  estudiantes: {
    first_names: string;
    last_names: string;
    document_number: string;
  } | null;
}

const ESTADO_FILTERS: { value: CasoEstado | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "inicio", label: "Inicio" },
  { value: "en_proceso", label: "En proceso" },
  { value: "cerrado", label: "Cerrado" },
];

const CASE_SELECT = `
  id,
  situation,
  estado,
  opened_at,
  updated_at,
  derivation_id,
  current_responsible_id,
  student_id,
  estudiantes(first_names, last_names, document_number)
`;

function localDate(value: string): string {
  return value.slice(0, 10);
}

export default function CasesListPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const userId = profile?.user_id ?? null;

  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [tab, setTab] = useState<"mis" | "todos" | "sin">("todos");
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<CasoEstado | "todos">("todos");
  const [responsableFilter, setResponsableFilter] = useState("todos");
  const [ieFilter, setIeFilter] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [psychologists, setPsychologists] = useState<
    { user_id: string; full_name: string }[]
  >([]);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>(
    []
  );
  const [ieStudentIds, setIeStudentIds] = useState<string[] | null>(null);

  const isGlobal = role === "global";
  const canCreate = can(role, "casos.gestionar");

  // Carga de casos (RLS por institución)
  useEffect(() => {
    if (!role) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("casos")
          .select(CASE_SELECT)
          .order("opened_at", { ascending: false })
          .limit(300);

        if (fetchError) throw fetchError;
        if (!cancelled) setCases((data as unknown as CaseListItem[]) ?? []);
      } catch (err) {
        if (!cancelled) {
          logClientError("casos.load", err);
          setError(toUserMessage(err, "Error al cargar casos"));
        }
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [role, reloadVersion]);

  // Filtros auxiliares: I.E. (Global), Psicólogos y estudiantes por I.E.
  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const instId = isGlobal ? ieFilter : (profile?.institution_id ?? null);

      try {
        if (isGlobal) {
          const { data } = await supabase
            .from("institutions")
            .select("id, name")
            .order("name");
          if (!cancelled) setInstitutions((data as { id: string; name: string }[]) ?? []);
        }

        if (canCreate && instId) {
          const { data } = await supabase.rpc("list_institution_psychologists", {
            p_institution_id: instId,
          });
          if (!cancelled)
            setPsychologists(
              (data as { user_id: string; full_name: string }[]) ?? []
            );
        } else if (!cancelled) {
          setPsychologists([]);
        }

        if (isGlobal && ieFilter) {
          const { data } = await supabase
            .from("periodos_escolares")
            .select("student_id")
            .eq("institution_id", ieFilter)
            .is("end_date", null)
            .limit(2000);
          if (!cancelled)
            setIeStudentIds((data as { student_id: string }[]).map((r) => r.student_id));
        } else if (!cancelled) {
          setIeStudentIds(null);
        }
      } catch {
        if (!cancelled) {
          setPsychologists([]);
          setIeStudentIds(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role, isGlobal, canCreate, ieFilter, profile?.institution_id]);

  const counts = useMemo(() => {
    const mis = userId
      ? cases.filter((c) => c.current_responsible_id === userId).length
      : 0;
    const sin = cases.filter((c) => !c.derivation_id).length;
    return { mis, sin, todos: cases.length };
  }, [cases, userId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (tab === "mis" && (!userId || c.current_responsible_id !== userId))
        return false;
      if (tab === "sin" && c.derivation_id) return false;
      if (estadoFilter !== "todos" && c.estado !== estadoFilter) return false;
      if (responsableFilter === "yo" && c.current_responsible_id !== userId)
        return false;
      if (responsableFilter === "sin" && c.current_responsible_id) return false;
      if (
        responsableFilter !== "todos" &&
        responsableFilter !== "yo" &&
        responsableFilter !== "sin" &&
        c.current_responsible_id !== responsableFilter
      )
        return false;
      if (ieStudentIds && !ieStudentIds.includes(c.student_id)) return false;
      if (desde && localDate(c.opened_at) < desde) return false;
      if (hasta && localDate(c.opened_at) > hasta) return false;
      if (!term) return true;
      const name = `${c.estudiantes?.first_names ?? ""} ${
        c.estudiantes?.last_names ?? ""
      }`.toLowerCase();
      const dni = c.estudiantes?.document_number ?? "";
      return name.includes(term) || dni.includes(term);
    });
  }, [
    cases,
    tab,
    userId,
    estadoFilter,
    responsableFilter,
    ieStudentIds,
    desde,
    hasta,
    search,
  ]);

  if (profileLoading) {
    return <LoadingScreen label="Cargando casos..." />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Casos"
        subtitle="Seguimiento de casos y atenciones"
        actions={
          canCreate ? (
            <Link href="/casos/nuevo" className={buttonClass("primary", "md")}>
              Nuevo caso
            </Link>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { id: "mis", label: "Mis casos", count: counts.mis },
          { id: "todos", label: "Todos", count: counts.todos },
          { id: "sin", label: "Sin derivación", count: counts.sin },
        ]}
        active={tab}
        onChange={(id) => setTab(id as "mis" | "todos" | "sin")}
      />

      <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Buscar por nombre o DNI">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                id="case-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o DNI del estudiante..."
                className={`${inputClasses} pl-9`}
              />
            </div>
          </Field>
          <Field label="Estado">
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value as CasoEstado | "todos")}
              className={selectClasses}
            >
              {ESTADO_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsable">
            <select
              value={responsableFilter}
              onChange={(e) => setResponsableFilter(e.target.value)}
              className={selectClasses}
            >
              <option value="todos">Todos</option>
              <option value="yo">Mis casos (yo)</option>
              <option value="sin">Sin responsable</option>
              {psychologists.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </Field>
          {isGlobal && (
            <Field label="Institución">
              <select
                value={ieFilter}
                onChange={(e) => setIeFilter(e.target.value)}
                className={selectClasses}
              >
                <option value="">Todas las I.E.</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Apertura desde">
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Apertura hasta">
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className={inputClasses}
            />
          </Field>
        </div>
      </div>

      {loading && <LoadingScreen label="Cargando casos..." />}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={
            search || estadoFilter !== "todos"
              ? "No se encontraron casos con esos filtros."
              : "No se encontraron casos."
          }
          description={
            canCreate
              ? "Crea un nuevo caso desde el botón «Nuevo caso»."
              : "Prueba con otro término o cambia los filtros."
          }
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="space-y-3">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/casos/${c.id}`}
                className="group flex items-start gap-4 rounded-xl border border-line bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-pop"
              >
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon name="folder" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {c.estudiantes
                      ? `${c.estudiantes.first_names} ${c.estudiantes.last_names}`
                      : "Estudiante"}
                    {c.estudiantes?.document_number && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        DNI: {c.estudiantes.document_number}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {c.situation}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Abierto: {new Date(c.opened_at).toLocaleDateString("es-PE")} ·
                    Actualizado:{" "}
                    {new Date(c.updated_at).toLocaleString("es-PE")}
                    {!c.derivation_id && " · sin derivación"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CaseStatusBadge estado={c.estado} />
                  <Icon
                    name="chevronRight"
                    className="hidden h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500 sm:block"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
