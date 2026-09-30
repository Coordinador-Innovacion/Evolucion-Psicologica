"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  ClipboardList,
  FolderKanban,
  GraduationCap,
  HeartHandshake,
  Inbox,
  LibraryBig,
  UserRound,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { KpiCard } from "@/components/ui/kpi-card";
import { Skeleton, SkeletonList } from "@/components/ui/skeleton";
import { StatusPill, CASO_TONES } from "@/components/ui/status-pill";
import { Tabs } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { ExpiringLicensesPanel } from "@/components/licencias/ExpiringLicensesPanel";
import { ROLE_LABELS } from "@/components/layout/nav";

type AtencionRow = {
  id: string;
  fecha: string | null;
  motivo: string;
  student_name: string | null;
  estado: string | null;
};

type CasoRow = {
  id: string;
  estado: string | null;
  situation: string;
  student_name: string | null;
  atenciones: number;
};

type DerivacionRow = {
  id: string;
  motivo: string;
  derivation_date: string | null;
  student_name: string | null;
};

type OrientacionRow = {
  id: string;
  student_id: string;
  student_name: string | null;
  teacher_orientation: string;
};

type DashboardData = {
  atenciones: AtencionRow[];
  casos: CasoRow[];
  derivaciones: DerivacionRow[];
  kpis: Record<string, number>;
  misEstudiantes: number | null;
  orientaciones: OrientacionRow[];
  recentLotes: { id: string; status: string; started_at: string | null }[];
  recentUsers: { id: string; full_name: string; role: string }[];
};

const EMPTY: DashboardData = {
  atenciones: [],
  casos: [],
  derivaciones: [],
  kpis: {},
  misEstudiantes: null,
  orientaciones: [],
  recentLotes: [],
  recentUsers: [],
};

async function loadDashboard(
  role: string,
  institutionId: string | null
): Promise<DashboardData> {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const data: DashboardData = { ...EMPTY, kpis: {} };

  const wantsPsicologo =
    role === "psicologo" || role === "director" || role === "global";
  const wantsCounts = [
    "psicologo",
    "director",
    "admin_ie",
    "coordinador",
  ].includes(role);

  if (wantsPsicologo) {
    const [{ data: atenciones }, { data: casos }, { data: derivaciones }] =
      await Promise.all([
        supabase
          .from("atenciones")
          .select(
            "id, fecha, motivo, casos(estado, estudiantes(first_names, last_names))"
          )
          .order("fecha", { ascending: false })
          .limit(10),
        supabase
          .from("casos")
          .select(
            "id, estado, situation, estudiantes(first_names, last_names), atenciones(id)"
          )
          .order("updated_at", { ascending: false })
          .limit(12),
        supabase
          .from("derivaciones")
          .select(
            "id, motivo, derivation_date, estudiantes(first_names, last_names)"
          )
          .is("caso_id", null)
          .order("derivation_date", { ascending: false })
          .limit(8),
      ]);

    data.atenciones = (atenciones ?? []).map((row) => {
      const caso = Array.isArray(row.casos) ? row.casos[0] : row.casos;
      const estudiante = caso
        ? Array.isArray(caso.estudiantes)
          ? caso.estudiantes[0]
          : caso.estudiantes
        : null;
      return {
        id: row.id,
        fecha: row.fecha,
        motivo: row.motivo,
        estado: caso?.estado ?? null,
        student_name: estudiante
          ? `${estudiante.first_names} ${estudiante.last_names}`.trim()
          : null,
      };
    });

    data.casos = (casos ?? []).map((row) => {
      const estudiante = Array.isArray(row.estudiantes)
        ? row.estudiantes[0]
        : row.estudiantes;
      return {
        id: row.id,
        estado: row.estado,
        situation: row.situation,
        student_name: estudiante
          ? `${estudiante.first_names} ${estudiante.last_names}`.trim()
          : null,
        atenciones: Array.isArray(row.atenciones) ? row.atenciones.length : 0,
      };
    });

    data.derivaciones = (derivaciones ?? []).map((row) => {
      const estudiante = Array.isArray(row.estudiantes)
        ? row.estudiantes[0]
        : row.estudiantes;
      return {
        id: row.id,
        motivo: row.motivo,
        derivation_date: row.derivation_date,
        student_name: estudiante
          ? `${estudiante.first_names} ${estudiante.last_names}`.trim()
          : null,
      };
    });
  }

  if (wantsCounts) {
    const [enProceso, inicio, cerrado, atencionesMes, abiertas, estudiantes] =
      await Promise.all([
        countCasos("en_proceso"),
        countCasos("inicio"),
        countCasos("cerrado"),
        supabase
          .from("atenciones")
          .select("id", { count: "exact", head: true })
          .gte("fecha", monthAgo),
        supabase
          .from("encuesta_aplicaciones")
          .select("id", { count: "exact", head: true })
          .in("status", ["active", "extended"]),
        supabase
          .from("periodos_escolares")
          .select("id", { count: "exact", head: true })
          .lte("start_date", today)
          .or(`end_date.gte.${today},end_date.is.null`),
      ]);

    data.kpis.casosEnProceso = enProceso;
    data.kpis.casosInicio = inicio;
    data.kpis.casosCerrado = cerrado;
    data.kpis.atencionesMes = atencionesMes.count ?? 0;
    data.kpis.aplicacionesAbiertas = abiertas.count ?? 0;
    data.kpis.estudiantesActivos = estudiantes.count ?? 0;

    function countCasos(estado: string) {
      return supabase
        .from("casos")
        .select("id", { count: "exact", head: true })
        .eq("estado", estado)
        .then(({ count }) => count ?? 0);
    }
  }

  if (role === "psicologo") {
    const { count } = await supabase
      .from("derivaciones")
      .select("id", { count: "exact", head: true })
      .is("caso_id", null);
    data.kpis.derivacionesSinCaso = count ?? 0;
  }

  if (role === "docente") {
    try {
      const { count, error } = await supabase
        .from("asignaciones_docentes")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      data.misEstudiantes = count ?? 0;
    } catch {
      data.misEstudiantes = null;
    }

    // NEC-02: orientación informativa vía vista segura (nunca la tabla clínica)
    try {
      const { data: needs, error: needError } = await supabase
        .from("v_necesidades_docente")
        .select("id, student_id, teacher_orientation")
        .not("teacher_orientation", "is", null)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (needError) throw needError;
      const rows = (needs ?? []) as {
        id: string;
        student_id: string;
        teacher_orientation: string | null;
      }[];
      const studentIds = [...new Set(rows.map((r) => r.student_id))];
      const names = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from("estudiantes")
          .select("id, first_names, last_names")
          .in("id", studentIds);
        for (const s of (students ?? []) as {
          id: string;
          first_names: string;
          last_names: string;
        }[]) {
          names.set(s.id, `${s.first_names} ${s.last_names}`.trim());
        }
      }
      data.orientaciones = rows
        .filter((r) => !!r.teacher_orientation)
        .map((r) => ({
          id: r.id,
          student_id: r.student_id,
          student_name: names.get(r.student_id) ?? null,
          teacher_orientation: r.teacher_orientation as string,
        }));
    } catch {
      data.orientaciones = [];
    }
  }

  if (role === "global") {
    const [instituciones, licencias, pendientes, lotes, usuarios] =
      await Promise.all([
        supabase
          .from("institutions")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("licencias")
          .select("id", { count: "exact", head: true })
          .lte("end_date", new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)),
        supabase
          .from("transferencias")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("lotes_promocion")
          .select("id, status, started_at")
          .order("started_at", { ascending: false })
          .limit(5),
        supabase
          .from("perfiles")
          .select("id, full_name, role")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    data.kpis.instituciones = instituciones.count ?? 0;
    data.kpis.licenciasPorVencer = licencias.count ?? 0;
    data.kpis.transferenciasPendientes = pendientes.count ?? 0;
    data.recentLotes = (lotes.data ?? []) as DashboardData["recentLotes"];
    data.recentUsers = (usuarios.data ?? []) as DashboardData["recentUsers"];
  }

  if (institutionId === null && role !== "global") {
    return EMPTY;
  }

  return data;
}

function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}

function QuickLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-500/40"
    >
      <span className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
          {icon}
        </span>
        <span className="text-sm font-semibold text-ink">{label}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 text-ink-muted transition group-hover:text-brand-600" />
    </Link>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-4 py-8 text-center">
      <Inbox className="mx-auto h-6 w-6 text-ink-muted" />
      <p className="mt-2 text-sm text-ink-muted">{text}</p>
    </div>
  );
}

function ListaAtenciones({ rows }: { rows: AtencionRow[] }) {
  if (rows.length === 0) return <EmptyHint text="Sin atenciones registradas todavía." />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className={`h-9 w-1 rounded-full ${
              row.estado === "en_proceso"
                ? "bg-amber-400"
                : row.estado === "cerrado"
                  ? "bg-emerald-400"
                  : "bg-brand-500"
            }`}
          />
          <Avatar name={row.student_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {row.student_name ?? "Estudiante"}
            </p>
            <p className="truncate text-xs text-ink-muted">{row.motivo}</p>
          </div>
          {row.estado && (
            <StatusPill tone={CASO_TONES[row.estado] ?? "slate"}>
              {row.estado.replace("_", " ")}
            </StatusPill>
          )}
          <span className="hidden text-xs text-ink-muted sm:block">
            {row.fecha ? new Date(row.fecha).toLocaleDateString("es-PE") : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ListaCasos({ rows }: { rows: CasoRow[] }) {
  if (rows.length === 0) return <EmptyHint text="No hay casos para tu rol." />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className={`h-9 w-1 rounded-full ${
              row.estado === "en_proceso"
                ? "bg-amber-400"
                : row.estado === "cerrado"
                  ? "bg-emerald-400"
                  : "bg-brand-500"
            }`}
          />
          <Avatar name={row.student_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {row.student_name ?? "Estudiante"}
            </p>
            <p className="truncate text-xs text-ink-muted">{row.situation}</p>
          </div>
          <StatusPill tone={CASO_TONES[row.estado ?? ""] ?? "slate"}>
            {row.estado?.replace("_", " ") ?? "—"}
          </StatusPill>
          <span className="text-xs font-medium text-ink-muted">
            {row.atenciones} atencion{row.atenciones === 1 ? "" : "es"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ListaDerivaciones({ rows }: { rows: DerivacionRow[] }) {
  if (rows.length === 0)
    return <EmptyHint text="No hay derivaciones sin caso." />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 px-4 py-3">
          <span aria-hidden="true" className="h-9 w-1 rounded-full bg-rose-400" />
          <Avatar name={row.student_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {row.student_name ?? "Estudiante"}
            </p>
            <p className="truncate text-xs text-ink-muted">{row.motivo}</p>
          </div>
          <StatusPill tone="rose">sin caso</StatusPill>
          <span className="hidden text-xs text-ink-muted sm:block">
            {row.derivation_date
              ? new Date(row.derivation_date).toLocaleDateString("es-PE")
              : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PsicologoDashboard({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState("atenciones");
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState("todos");

  const filteredCasos = useMemo(() => {
    return data.casos.filter((row) => {
      const matchesQuery =
        !query ||
        (row.student_name ?? "").toLowerCase().includes(query.toLowerCase()) ||
        row.situation.toLowerCase().includes(query.toLowerCase());
      const matchesEstado = estado === "todos" || row.estado === estado;
      return matchesQuery && matchesEstado;
    });
  }, [data.casos, query, estado]);

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard
          label="Atenciones recientes"
          value={data.atenciones.length}
          tone="blue"
          hint="Últimas 10 registradas"
          icon={<HeartHandshake className="h-5 w-5" />}
        />
        <KpiCard
          label="Casos en proceso"
          value={data.kpis.casosEnProceso ?? data.casos.filter((c) => c.estado === "en_proceso").length}
          tone="amber"
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <KpiCard
          label="Casos en inicio"
          value={data.kpis.casosInicio ?? data.casos.filter((c) => c.estado === "inicio").length}
          tone="violet"
          hint="Sin primera atención"
          icon={<Inbox className="h-5 w-5" />}
        />
        <KpiCard
          label="Derivaciones sin caso"
          value={data.kpis.derivacionesSinCaso ?? data.derivaciones.length}
          tone="rose"
          icon={<ClipboardList className="h-5 w-5" />}
        />
      </KpiGrid>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          active={tab}
          onChange={setTab}
          className="flex-1"
          tabs={[
            { id: "atenciones", label: "Últimas atenciones", count: data.atenciones.length },
            { id: "casos", label: "Mis casos", count: data.casos.length },
            { id: "derivaciones", label: "Derivaciones", count: data.derivaciones.length },
          ]}
        />
        {tab === "casos" && (
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar casos"
              className="w-36 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none"
            />
            <select
              value={estado}
              onChange={(event) => setEstado(event.target.value)}
              aria-label="Filtrar por estado"
              className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none"
            >
              <option value="todos">Todos</option>
              <option value="inicio">Inicio</option>
              <option value="en_proceso">En proceso</option>
              <option value="cerrado">Cerrado</option>
            </select>
          </div>
        )}
      </div>

      {tab === "atenciones" && <ListaAtenciones rows={data.atenciones} />}
      {tab === "casos" && <ListaCasos rows={filteredCasos} />}
      {tab === "derivaciones" && <ListaDerivaciones rows={data.derivaciones} />}
    </div>
  );
}

function InstitucionalDashboard({
  data,
  role,
}: {
  data: DashboardData;
  role: string;
}) {
  const isDirector = role === "director" || role === "admin_ie";

  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard
          label="Estudiantes con período activo"
          value={data.kpis.estudiantesActivos ?? 0}
          tone="blue"
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <KpiCard
          label="Casos en proceso"
          value={data.kpis.casosEnProceso ?? 0}
          tone="amber"
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <KpiCard
          label="Casos en inicio"
          value={data.kpis.casosInicio ?? 0}
          tone="violet"
          icon={<Inbox className="h-5 w-5" />}
        />
        <KpiCard
          label="Aplicaciones abiertas"
          value={data.kpis.aplicacionesAbiertas ?? 0}
          tone="teal"
          icon={<ClipboardList className="h-5 w-5" />}
        />
      </KpiGrid>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Accesos rápidos
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickLink href="/coordinador" label="Promoción y licencias" icon={<BookOpenCheck className="h-5 w-5" />} />
          <QuickLink href="/encuestas" label="Encuestas" icon={<ClipboardList className="h-5 w-5" />} />
          <QuickLink href="/casos" label="Casos" icon={<FolderKanban className="h-5 w-5" />} />
          {isDirector && (
            <>
              <QuickLink href="/personal" label="Usuarios" icon={<Users className="h-5 w-5" />} />
              <QuickLink href="/analitica" label="Analítica" icon={<LibraryBig className="h-5 w-5" />} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function DocenteDashboard({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard
          label="Mis estudiantes"
          value={data.misEstudiantes ?? 0}
          tone="blue"
          hint={
            data.misEstudiantes === null
              ? "Sin asignaciones registradas"
              : undefined
          }
          icon={<GraduationCap className="h-5 w-5" />}
        />
      </KpiGrid>

      <div className="rounded-2xl border border-brand-500/30 bg-brand-100/60 p-5 dark:bg-brand-500/10">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
          <HeartHandshake className="h-4 w-4 text-brand-600" />
          Orientación informativa
        </h3>
        <p className="mt-1.5 text-sm text-ink-soft">
          Como docente puedes consultar la orientación informativa de tus
          estudiantes (solo lectura). El detalle clínico no está disponible para
          tu rol.
        </p>

        {data.orientaciones.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {data.orientaciones.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-brand-500/20 bg-white/70 p-3 dark:bg-white/5"
              >
                <p className="text-xs font-semibold text-brand-700">
                  {o.student_name ?? "Estudiante"}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">{o.teacher_orientation}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl border border-brand-500/20 bg-white/70 p-3 text-sm text-ink-muted dark:bg-white/5">
            Sin orientaciones registradas para tus estudiantes.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/encuestas"
            className="rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-primary-strong"
          >
            Ir a mis encuestas
          </Link>
          <Link
            href="/configuracion"
            className="rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink-soft transition hover:border-brand-500/40 hover:text-brand-600"
          >
            Mi perfil
          </Link>
        </div>
      </div>

      {data.misEstudiantes === null && (
        <EmptyHint text="Aún no tienes estudiantes asignados. Cuando la institución registre tus asignaciones aparecerán aquí." />
      )}
    </div>
  );
}

function GlobalDashboard({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      <KpiGrid>
        <KpiCard
          label="Instituciones"
          value={data.kpis.instituciones ?? 0}
          tone="blue"
          icon={<LibraryBig className="h-5 w-5" />}
        />
        <KpiCard
          label="Licencias por vencer (≤30 d)"
          value={data.kpis.licenciasPorVencer ?? 0}
          tone="amber"
          icon={<ClipboardList className="h-5 w-5" />}
        />
        <KpiCard
          label="Transferencias pendientes"
          value={data.kpis.transferenciasPendientes ?? 0}
          tone="rose"
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <KpiCard
          label="Atenciones (30 días)"
          value={data.kpis.atencionesMes ?? 0}
          tone="teal"
          icon={<HeartHandshake className="h-5 w-5" />}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExpiringLicensesPanel />

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Lotes de promoción recientes
          </h3>
          {data.recentLotes.length === 0 ? (
            <EmptyHint text="Sin lotes de promoción recientes." />
          ) : (
            <ul className="space-y-2">
              {data.recentLotes.map((lote) => (
                <li
                  key={lote.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-ink-soft">{lote.id.slice(0, 8)}…</span>
                  <StatusPill
                    tone={
                      lote.status === "COMPLETED"
                        ? "green"
                        : lote.status === "RUNNING"
                          ? "blue"
                          : "rose"
                    }
                  >
                    {lote.status}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Usuarios recientes
          </h3>
          {data.recentUsers.length === 0 ? (
            <EmptyHint text="Sin usuarios registrados." />
          ) : (
            <ul className="space-y-2">
              {data.recentUsers.map((user) => (
                <li key={user.id} className="flex items-center gap-3">
                  <Avatar name={user.full_name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {user.full_name}
                  </span>
                  <StatusPill tone="blue">{ROLE_LABELS[user.role] ?? user.role}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <QuickLink href="/instituciones" label="Instituciones" icon={<LibraryBig className="h-5 w-5" />} />
          <QuickLink href="/personal" label="Personal" icon={<Users className="h-5 w-5" />} />
          <QuickLink href="/coordinador" label="Coordinación" icon={<BookOpenCheck className="h-5 w-5" />} />
        </div>
      </div>
    </div>
  );
}

export function DashboardShell() {
  const { profile, loading } = useUser();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loadingData, setLoadingData] = useState(true);

  const role = profile?.role ?? null;

  useEffect(() => {
    if (!role) {
      const id = requestAnimationFrame(() => {
        setData(EMPTY);
        setLoadingData(false);
      });
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    loadDashboard(role, profile?.institution_id ?? null)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, profile?.institution_id]);

  if (loading || !profile || !role) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
        <SkeletonList rows={4} />
      </div>
    );
  }

  const parts = (profile.full_name || "").trim().split(/\s+/);
  const firstName = parts[0] || "usuario";
  const apellido = parts.length > 1 ? parts[parts.length - 1] : firstName;
  const isPsicologo = role === "psicologo";

  const summary = (() => {
    if (loadingData) return "Cargando tu resumen del día…";
    if (isPsicologo) {
      return `${data.atenciones.length} atenciones recientes · ${
        data.casos.filter((c) => c.estado === "en_proceso").length
      } casos en proceso · ${data.derivaciones.length} derivaciones sin caso.`;
    }
    if (role === "global") {
      return `${data.kpis.instituciones ?? 0} instituciones · ${
        data.kpis.transferenciasPendientes ?? 0
      } transferencias pendientes.`;
    }
    if (role === "docente") {
      return data.misEstudiantes === null
        ? "Sin asignaciones registradas por ahora."
        : `${data.misEstudiantes} estudiantes asignados a tu carga.`;
    }
    return `${data.kpis.estudiantesActivos ?? 0} estudiantes con período activo · ${
      data.kpis.aplicacionesAbiertas ?? 0
    } aplicaciones abiertas.`;
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-800 px-6 py-7 text-white shadow-card sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl"
        />
        <p className="text-sm text-white/75">{ROLE_LABELS[role] ?? role}</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
          {isPsicologo ? `Hola, Dra./Dr. ${apellido}` : `Hola, ${firstName}`}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-white/85">{summary}</p>
      </section>

      {loadingData ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <SkeletonList rows={4} />
        </div>
      ) : isPsicologo ? (
        <PsicologoDashboard data={data} />
      ) : role === "docente" ? (
        <DocenteDashboard data={data} />
      ) : role === "global" ? (
        <GlobalDashboard data={data} />
      ) : (
        <InstitucionalDashboard data={data} role={role} />
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Módulos
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickLink href="/encuestas" label="Encuestas" icon={<ClipboardList className="h-5 w-5" />} />
          <QuickLink href="/casos" label="Casos" icon={<FolderKanban className="h-5 w-5" />} />
          <QuickLink href="/analitica" label="Analítica" icon={<LibraryBig className="h-5 w-5" />} />
          <QuickLink href="/configuracion" label="Configuración" icon={<UserRound className="h-5 w-5" />} />
        </div>
      </section>
    </div>
  );
}
