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
import { Tabs } from "@/components/ui/tabs";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { EmptyState, ErrorBanner, LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";
import type { TransferenciaStatus } from "@/types/supabase";

const PAGE_SIZE = 20;

type TransferRow = {
  id: string;
  caso_id: string;
  origin_institution_id: string;
  destination_institution_id: string;
  destination_nivel_id: string | null;
  destination_grado_id: string | null;
  section: string | null;
  status: TransferenciaStatus;
  created_at: string;
};

type CasoInfo = {
  id: string;
  student_id: string;
  situation: string;
};

type StudentInfo = {
  id: string;
  first_names: string;
  last_names: string;
  document_number: string;
};

const TRANSFER_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Autorizada",
  accepted: "Aceptada",
  rejected: "Rechazada",
  completed: "Completada",
};

const TRANSFER_TONES: Record<string, StatusTone> = {
  pending: "amber",
  approved: "green",
  accepted: "green",
  rejected: "rose",
  completed: "blue",
};

const OTRA_IE = "Otra institución educativa";

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * TRF-01 — Lista de transferencias con tabs:
 * Por autorizar (soy A/origen) · Solicitadas por mí (soy B/destino) · Historial.
 */
export default function TransferenciasPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const myInst = profile?.institution_id ?? null;
  const instKey = myInst ?? "";

  const [rows, setRows] = useState<TransferRow[]>([]);
  const [casos, setCasos] = useState<Map<string, CasoInfo>>(new Map());
  const [estudiantes, setEstudiantes] = useState<Map<string, StudentInfo>>(new Map());
  const [instituciones, setInstituciones] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [tab, setTab] = useState("por_autorizar");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (profileLoading) return;
    if (!can(role, "transferencias.consultar")) return;

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
          .from("transferencias")
          .select(
            "id, caso_id, origin_institution_id, destination_institution_id, destination_nivel_id, destination_grado_id, section, status, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(300);
        if (cancelled) return;
        if (fetchError) throw fetchError;
        const transfers = (data ?? []) as unknown as TransferRow[];
        setRows(transfers);

        const caseIds = [...new Set(transfers.map((t) => t.caso_id))];
        const casoMap = new Map<string, CasoInfo>();
        if (caseIds.length > 0) {
          const { data: casosData, error: casosError } = await supabase
            .from("casos")
            .select("id, student_id, situation")
            .in("id", caseIds);
          if (cancelled) return;
          if (casosError) throw casosError;
          for (const c of (casosData ?? []) as unknown as CasoInfo[]) {
            casoMap.set(c.id, c);
          }
        }
        setCasos(casoMap);

        const studentIds = [...new Set([...casoMap.values()].map((c) => c.student_id))];
        const estMap = new Map<string, StudentInfo>();
        if (studentIds.length > 0) {
          const { data: estData, error: estError } = await supabase
            .from("estudiantes")
            .select("id, first_names, last_names, document_number")
            .in("id", studentIds);
          if (cancelled) return;
          if (estError) throw estError;
          for (const e of (estData ?? []) as unknown as StudentInfo[]) {
            estMap.set(e.id, e);
          }
        }
        setEstudiantes(estMap);

        const instMap = new Map<string, string>();
        if (isGlobal) {
          const { data: instData, error: instError } = await supabase
            .from("institutions")
            .select("id, name");
          if (cancelled) return;
          if (instError) throw instError;
          for (const i of (instData ?? []) as { id: string; name: string }[]) {
            instMap.set(i.id, i.name);
          }
        } else if (myInst) {
          const { data: instData, error: instError } = await supabase
            .from("institutions")
            .select("id, name")
            .eq("id", myInst)
            .maybeSingle();
          if (cancelled) return;
          if (instError) throw instError;
          if (instData) instMap.set(instData.id, instData.name);
        }
        setInstituciones(instMap);

        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("transferencias.load", err);
        setError(toUserMessage(err, "Error al cargar las transferencias"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [reloadVersion, profileLoading, role, isGlobal, instKey]);

  const { porAutorizar, mias, historial } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (row: TransferRow): boolean => {
      if (!q) return true;
      const caso = casos.get(row.caso_id);
      const est = caso ? estudiantes.get(caso.student_id) : null;
      const haystack = [
        row.caso_id,
        caso?.situation ?? "",
        est ? `${est.first_names} ${est.last_names} ${est.document_number}` : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    };

    const porAutorizar: TransferRow[] = [];
    const mias: TransferRow[] = [];
    const historial: TransferRow[] = [];

    for (const row of rows) {
      if (!matches(row)) continue;
      const soyOrigen = isGlobal || (myInst !== null && row.origin_institution_id === myInst);
      const soyDestino =
        isGlobal || (myInst !== null && row.destination_institution_id === myInst);
      if (row.status === "pending") {
        if (soyOrigen) porAutorizar.push(row);
        if (soyDestino) mias.push(row);
      } else {
        historial.push(row);
      }
    }
    return { porAutorizar, mias, historial };
  }, [rows, casos, estudiantes, search, isGlobal, myInst]);

  const tabRows =
    tab === "por_autorizar" ? porAutorizar : tab === "mias" ? mias : historial;

  const totalPages = Math.max(1, Math.ceil(tabRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = tabRows.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "transferencias.consultar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para ver las transferencias." />
      </div>
    );
  }

  if (loading) return <LoadingScreen label="Cargando transferencias..." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Transferencias"
        subtitle="Flujo B (destino) solicita → A (origen) autoriza. Una solicitud pendiente no tiene efecto en A."
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Transferencias" },
        ]}
        actions={
          can(role, "transferencias.solicitar") ? (
            <Link href="/transferencias/nueva" className={buttonClass("primary", "md")}>
              Nueva transferencia
            </Link>
          ) : undefined
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Tabs
        tabs={[
          { id: "por_autorizar", label: "Por autorizar", count: porAutorizar.length },
          { id: "mias", label: "Solicitadas por mí", count: mias.length },
          { id: "historial", label: "Historial", count: historial.length },
        ]}
        active={tab}
        onChange={(id) => {
          setTab(id);
          setPage(0);
        }}
      />

      <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Buscar">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caso, estudiante o DNI..."
              className={inputClasses}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white shadow-card">
        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin transferencias"
              description="No hay transferencias que coincidan con el filtro."
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((row) => {
              const caso = casos.get(row.caso_id);
              const est = caso ? estudiantes.get(caso.student_id) : null;
              const origenName = instituciones.get(row.origin_institution_id) ?? OTRA_IE;
              const destinoName =
                instituciones.get(row.destination_institution_id) ?? OTRA_IE;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {caso?.situation ?? `Caso ${row.caso_id.slice(0, 8)}`}
                      {est && (
                        <span className="ml-2 font-normal text-ink-muted">
                          {est.last_names}, {est.first_names} · DNI {est.document_number}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {origenName} → {destinoName}
                      {row.section ? ` · Sección ${row.section}` : ""} ·{" "}
                      {fmtDate(row.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill tone={TRANSFER_TONES[row.status] ?? "slate"}>
                      {TRANSFER_LABELS[row.status] ?? row.status}
                    </StatusPill>
                    <Link
                      href={`/transferencias/${row.id}`}
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

      {tabRows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <span>
            {tabRows.length} transferencias · Página {currentPage + 1} de {totalPages}
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
