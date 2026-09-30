"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CaseStatusBadge } from "@/components/casos/CaseStatusBadge";
import { CaseActions } from "@/components/casos/CaseActions";
import { NewAttentionForm } from "@/components/casos/NewAttentionForm";
import { ResponsibleHistory } from "@/components/casos/ResponsibleHistory";
import { ReassignCaseModal } from "@/components/casos/ReassignCaseModal";
import {
  StudentDocumentsPanel,
  canAccessDocuments,
} from "@/components/documentos/StudentDocumentsPanel";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { LoadingScreen, ErrorBanner, EmptyState } from "@/components/ui/feedback";
import { Tabs } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Field, inputClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { Caso, Atencion, Derivacion } from "@/types/database";
import type { CasoEstado } from "@/types/supabase";
import type { PeriodItem } from "@/components/estudiantes/StudentTabs";

interface CaseWithDetails extends Caso {
  estudiantes?: {
    id: string;
    first_names: string;
    last_names: string;
    document_number: string;
    birth_date: string | null;
  };
  atenciones?: Atencion[];
}

type TransferRow = {
  id: string;
  status: string;
  origin_institution_id: string;
  destination_institution_id: string;
  transferred_at: string | null;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  created_at: string;
  user_id: string;
};

const TRANSFER_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Autorizada",
  accepted: "Aceptada",
  rejected: "Rechazada",
  completed: "Completada",
};

const AUDIT_LABELS: Record<string, string> = {
  case_created: "Caso creado",
  case_closed: "Cierre de caso",
  case_reopened: "Reapertura de caso",
  case_reassigned: "Reasignación de responsable",
  derivation_created: "Derivación registrada",
};

const CLOSED_STATUSES = new Set(["approved", "accepted", "completed"]);

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function edadDe(birthDate: string | null): string {
  if (!birthDate) return "—";
  const years = Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  );
  return `${years} años`;
}

function estadoTexto(estado: CasoEstado, closeReason: string | null): string {
  if (estado === "inicio") {
    return "Caso recién abierto. Al registrar la primera atención pasa a En proceso.";
  }
  if (estado === "en_proceso") {
    return "Caso en seguimiento: tiene al menos una atención registrada.";
  }
  return closeReason
    ? `Caso finalizado. Motivo: ${closeReason}`
    : "Caso finalizado. No admite nuevas atenciones salvo reapertura.";
}

export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [caso, setCaso] = useState<CaseWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [derivaciones, setDerivaciones] = useState<Derivacion[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [institutionNames, setInstitutionNames] = useState<Record<string, string>>({});
  const [psychologists, setPsychologists] = useState<
    { user_id: string; full_name: string }[]
  >([]);

  const [tab, setTab] = useState("resumen");
  const [showCta, setShowCta] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [sitText, setSitText] = useState("");
  const [savingSit, setSavingSit] = useState(false);
  const [sitError, setSitError] = useState<string | null>(null);

  // canManage: creación/edición de atenciones y cierre/reapertura (server: G,P)
  const canManage = profile?.role === "global" || profile?.role === "psicologo";

  const reload = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setLinkError(null);
    });

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("casos")
          .select(
            `
            *,
            estudiantes(id, first_names, last_names, document_number, birth_date),
            atenciones(*)
          `
          )
          .eq("id", id)
          .maybeSingle();
        if (cancelled) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setError("Caso no encontrado");
          return;
        }
        const casoData = data as CaseWithDetails;
        setCaso(casoData);

        const [periodsRes, derivRes, transferRes, auditRes] = await Promise.all([
          supabase.rpc("get_student_periods", { p_student_id: casoData.student_id }),
          supabase
            .from("derivaciones")
            .select("*")
            .eq("student_id", casoData.student_id)
            .order("derivation_date", { ascending: false }),
          supabase
            .from("transferencias")
            .select("*")
            .eq("caso_id", id)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("auditoria")
            .select("id, action, created_at, user_id")
            .eq("table_name", "casos")
            .eq("record_id", id)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;

        const periodList = (periodsRes.data ?? []) as PeriodItem[];
        const activePeriod =
          periodList.find((p) => p.is_active) ?? null;
        const transferList = (transferRes.data ?? []) as TransferRow[];
        const auditList = (auditRes.data ?? []) as AuditRow[];

        const instIds = new Set<string>();
        if (activePeriod?.institution_id) instIds.add(activePeriod.institution_id);
        for (const t of transferList) {
          if (t.origin_institution_id) instIds.add(t.origin_institution_id);
          if (t.destination_institution_id) instIds.add(t.destination_institution_id);
        }

        const [instRes, psychRes, auditUsersRes] = await Promise.all([
          instIds.size > 0
            ? supabase.from("institutions").select("id, name").in("id", [...instIds])
            : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
          supabase.rpc("list_institution_psychologists", {
            p_institution_id: activePeriod?.institution_id ?? null,
          }),
          auditList.length > 0
            ? supabase
                .from("perfiles")
                .select("user_id, full_name")
                .in(
                  "user_id",
                  [...new Set(auditList.map((a) => a.user_id))].slice(0, 20)
                )
            : Promise.resolve({ data: [] as { user_id: string; full_name: string }[], error: null }),
        ]);
        if (cancelled) return;

        const instMap: Record<string, string> = {};
        for (const row of (instRes.data ?? []) as { id: string; name: string }[]) {
          instMap[row.id] = row.name;
        }
        const nameMap: Record<string, string> = {};
        for (const row of (auditUsersRes.data ?? []) as {
          user_id: string;
          full_name: string;
        }[]) {
          nameMap[row.user_id] = row.full_name;
        }

        setPeriods(periodList);
        setDerivaciones((derivRes.data ?? []) as Derivacion[]);
        setTransfers(transferList);
        setAuditRows(auditList);
        setUserNames(nameMap);
        setInstitutionNames(instMap);
        setPsychologists(
          (psychRes.data ?? []) as { user_id: string; full_name: string }[]
        );
        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("caso.load", err);
        setError(toUserMessage(err, "Error al cargar el caso"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [id, reloadVersion]);

  // CAS-02: CTA "Registrar primera atención" cuando llegamos con ?nueva=1
  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      const query = new URLSearchParams(window.location.search);
      if (query.get("nueva") === "1") setShowCta(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activePeriod = useMemo(
    () => periods.find((p) => p.is_active) ?? null,
    [periods]
  );

  const institutionName = useMemo(() => {
    if (activePeriod?.institution_name) return activePeriod.institution_name;
    if (activePeriod?.institution_id) {
      return institutionNames[activePeriod.institution_id] ?? "—";
    }
    return "—";
  }, [activePeriod, institutionNames]);

  const pendingTransfer = useMemo(
    () => transfers.find((t) => t.status === "pending") ?? null,
    [transfers]
  );
  const approvedTransfer = useMemo(
    () => transfers.find((t) => CLOSED_STATUSES.has(t.status)) ?? null,
    [transfers]
  );

  const isOriginMember = useMemo(() => {
    if (!approvedTransfer || !profile?.institution_id) return false;
    return approvedTransfer.origin_institution_id === profile.institution_id;
  }, [approvedTransfer, profile]);

  const isGlobal = profile?.role === "global";
  // CAS-07: origin + transferencia autorizada ⇒ modo solo consulta (global conserva acciones)
  const transferredOut = isOriginMember && !isGlobal;

  const canGestionarCasos = can(role, "casos.gestionar") && !transferredOut;
  const canCreateDer = can(role, "derivaciones.crear") && !transferredOut;

  const fullName = caso?.estudiantes
    ? `${caso.estudiantes.first_names} ${caso.estudiantes.last_names}`
    : "Estudiante";

  const grado =
    activePeriod
      ? `${activePeriod.grado_name} ${activePeriod.section} · ${activePeriod.nivel_name}`
      : "—";

  const estado = caso?.estado as CasoEstado | undefined;
  const atenciones = useMemo(() => caso?.atenciones ?? [], [caso]);
  const sortedAtenciones = useMemo(
    () =>
      [...atenciones].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      ),
    [atenciones]
  );

  const responsibleName = useMemo(() => {
    if (!caso?.current_responsible_id) return "—";
    const fromList = psychologists.find(
      (p) => p.user_id === caso.current_responsible_id
    );
    if (fromList) return fromList.full_name;
    if (profile?.user_id === caso.current_responsible_id) return profile.full_name;
    return userNames[caso.current_responsible_id] ?? "—";
  }, [caso, psychologists, profile, userNames]);

  const evolucionSteps = useMemo(() => {
    const steps: { label: string; date: string }[] = [];
    if (caso) {
      steps.push({ label: "Inicio", date: caso.opened_at });
      const asc = [...atenciones].sort(
        (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
      );
      asc.forEach((a, i) => steps.push({ label: `At.#${i + 1}`, date: a.fecha }));
      if (caso.closed_at) steps.push({ label: "Cierre", date: caso.closed_at });
    }
    return steps;
  }, [caso, atenciones]);

  const timeline = useMemo(() => {
    type Ev = { date: string; label: string; detail?: string };
    const events: Ev[] = [];
    const derivation =
      caso?.derivation_id != null
        ? derivaciones.find((d) => d.id === caso.derivation_id)
        : undefined;
    if (derivation) {
      events.push({
        date: derivation.derivation_date,
        label: "Derivación recibida",
        detail: derivation.motivo,
      });
    }
    for (const a of atenciones) {
      events.push({ date: a.fecha, label: "Atención", detail: a.motivo });
    }
    if (caso?.closed_at) {
      events.push({
        date: caso.closed_at,
        label: "Cierre",
        detail: caso.close_reason ?? undefined,
      });
    }
    for (const row of auditRows) {
      if (row.action === "case_reopened") {
        events.push({
          date: row.created_at,
          label: "Reapertura",
          detail: userNames[row.user_id],
        });
      }
    }
    for (const t of transfers) {
      if (CLOSED_STATUSES.has(t.status)) {
        events.push({
          date: t.transferred_at ?? t.updated_at,
          label: "Transferencia autorizada",
          detail:
            institutionNames[t.destination_institution_id] ??
            "otra institución educativa",
        });
      }
    }
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [caso, atenciones, derivaciones, auditRows, transfers, userNames, institutionNames]);

  const openEdit = () => {
    if (!caso) return;
    setSitText(caso.situation);
    setSitError(null);
    setEditOpen(true);
  };

  const saveSituacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caso || savingSit) return;
    const value = sitText.trim();
    if (!value) {
      setSitError("La situación es obligatoria");
      return;
    }
    setSavingSit(true);
    setSitError(null);
    try {
      const supabase = createClient();
      const { error: upError } = await supabase
        .from("casos")
        .update({ situation: value })
        .eq("id", caso.id);
      if (upError) throw upError;
      setEditOpen(false);
      reload();
    } catch (err) {
      logClientError("caso.editar", err);
      setSitError(toUserMessage(err, "No se pudo guardar la situación"));
    } finally {
      setSavingSit(false);
    }
  };

  const linkDerivation = async (derivationId: string) => {
    if (linkingId) return;
    setLinkingId(derivationId);
    setLinkError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("link_case_derivation", {
        p_case_id: id,
        p_derivation_id: derivationId,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        setLinkError(data?.error ?? "No se pudo vincular la derivación");
        return;
      }
      reload();
    } catch (err) {
      logClientError("caso.vincular", err);
      setLinkError(toUserMessage(err, "No se pudo vincular la derivación"));
    } finally {
      setLinkingId(null);
    }
  };

  if (loading || profileLoading) {
    return <LoadingScreen label="Cargando caso..." />;
  }

  if (error || !caso || !estado) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-ink">Error</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {error || "Caso no encontrado"}
          </p>
          <Link
            href="/casos"
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:bg-surface"
          >
            Volver a casos
          </Link>
        </div>
      </div>
    );
  }

  const showDocsTab = canAccessDocuments(role);

  const tabs = [
    { id: "resumen", label: "Resumen" },
    { id: "atenciones", label: "Atenciones", count: atenciones.length },
    { id: "derivaciones", label: "Derivaciones", count: derivaciones.length },
    { id: "historial", label: "Historial" },
    ...(showDocsTab ? [{ id: "documentos", label: "Documentos" }] : []),
  ];

  const destName = approvedTransfer
    ? institutionNames[approvedTransfer.destination_institution_id] ??
      "otra institución educativa"
    : "";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Cabecera */}
      <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
        <Link
          href="/casos"
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          &larr; Volver a casos
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={fullName} size="lg" />
            <div>
              <h1 className="text-xl font-bold text-ink">{fullName}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                DNI {caso.estudiantes?.document_number ?? "—"} ·{" "}
                {edadDe(caso.estudiantes?.birth_date ?? null)} · {grado} ·{" "}
                {institutionName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CaseStatusBadge estado={estado} />
            {canGestionarCasos && (
              <button type="button" onClick={openEdit} className={buttonClass("secondary", "sm")}>
                Editar caso
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CAS-07: transferencia autorizada — origen en solo consulta */}
      {approvedTransfer && isOriginMember && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">
            Transferido a {destName} el{" "}
            {fmtDate(approvedTransfer.transferred_at ?? approvedTransfer.updated_at)}.
            Solo consulta.
          </p>
          {!isGlobal && (
            <p className="mt-1 text-xs text-emerald-800">
              Histórico inmutable: las acciones de gestión están ocultas.
            </p>
          )}
        </div>
      )}

      {/* Solicitud de transferencia pendiente */}
      {pendingTransfer && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Hay una solicitud de transferencia pendiente de autorización para este caso.
          El caso no cambia de institución hasta que el Director de origen la autorice.
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ---------------- Resumen ---------------- */}
      {tab === "resumen" && (
        <div className="space-y-6">
          {showCta && estado !== "cerrado" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-medium text-emerald-900">
                Caso creado. Registra la primera atención para pasar a En proceso.
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowCta(false);
                  setTab("atenciones");
                }}
                className={buttonClass("primary", "sm")}
              >
                Registrar primera atención
              </button>
            </div>
          )}

          {/* Información del caso */}
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink">
              Información del caso
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="font-medium text-ink-soft">Situación</dt>
                <dd className="mt-1 text-ink-muted">{caso.situation}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink-soft">Derivación de origen</dt>
                <dd className="mt-1 text-ink-muted">
                  {caso.derivation_id ? (
                    (() => {
                      const der = derivaciones.find((d) => d.id === caso.derivation_id);
                      return der ? (
                        <span>
                          {der.motivo} · {fmtDate(der.derivation_date)}{" "}
                          <Link
                            href={`/derivaciones/${der.id}`}
                            className="font-medium text-brand-600 hover:underline"
                          >
                            Ver
                          </Link>
                        </span>
                      ) : (
                        "Vinculada"
                      );
                    })()
                  ) : (
                    "Sin derivación de origen"
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink-soft">Responsable actual</dt>
                <dd className="mt-1 text-ink-muted">{responsibleName}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink-soft">Apertura</dt>
                <dd className="mt-1 text-ink-muted">{fmtDateTime(caso.opened_at)}</dd>
              </div>
              <div>
                <dt className="font-medium text-ink-soft">Última atención</dt>
                <dd className="mt-1 text-ink-muted">
                  {sortedAtenciones[0] ? fmtDateTime(sortedAtenciones[0].fecha) : "—"}
                </dd>
              </div>
              {caso.closed_at && (
                <div className="sm:col-span-2">
                  <dt className="font-medium text-ink-soft">Cierre</dt>
                  <dd className="mt-1 text-ink-muted">
                    {fmtDateTime(caso.closed_at)}
                    {caso.close_reason ? ` · ${caso.close_reason}` : ""}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Estado del caso + evolución */}
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-ink">
                Estado del caso
              </h2>
              <CaseStatusBadge estado={estado} />
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              {estadoTexto(estado, caso.close_reason)}
            </p>

            <h3 className="mt-6 text-sm font-semibold text-ink-soft">
              Evolución del caso
            </h3>
            <ol className="mt-3 flex flex-wrap items-center gap-2">
              {evolucionSteps.map((step, index) => {
                const isLast = index === evolucionSteps.length - 1;
                return (
                  <li key={`${step.label}-${index}`} className="flex items-center gap-2">
                    <span
                      className={`inline-flex flex-col rounded-full px-3 py-1 text-xs font-semibold ${
                        isLast
                          ? "bg-indigo-600 text-white"
                          : "bg-indigo-100 text-indigo-800"
                      }`}
                    >
                      {step.label}
                      <span
                        className={`text-[10px] font-normal ${
                          isLast ? "text-indigo-100" : "text-indigo-500"
                        }`}
                      >
                        {fmtDate(step.date)}
                      </span>
                    </span>
                    {!isLast && (
                      <span aria-hidden="true" className="text-slate-300">
                        &rarr;
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Línea de tiempo */}
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink">
              Línea de tiempo
            </h2>
            {timeline.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Sin eventos registrados.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {timeline.map((ev, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-xs font-medium text-ink-muted">
                      {fmtDateTime(ev.date)}
                    </span>
                    <span className="font-medium text-ink">{ev.label}</span>
                    {ev.detail && <span className="text-ink-muted">{ev.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Acciones rápidas */}
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink">
              Acciones rápidas
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canManage && estado !== "cerrado" && (
                <Link
                  href={`/casos/${id}/atenciones/nueva`}
                  className={buttonClass("primary", "sm")}
                >
                  Registrar atención
                </Link>
              )}
              {canCreateDer && (
                <Link
                  href={`/derivaciones/nueva?student=${caso.student_id}`}
                  className={buttonClass("secondary", "sm")}
                >
                  Nueva derivación
                </Link>
              )}
              {canGestionarCasos && (
                <button
                  type="button"
                  onClick={() => setTab("derivaciones")}
                  className={buttonClass("secondary", "sm")}
                >
                  Vincular derivación
                </button>
              )}
              {canGestionarCasos && estado !== "cerrado" && (
                <button
                  type="button"
                  onClick={() => setReassignOpen(true)}
                  className={buttonClass("secondary", "sm")}
                >
                  Reasignar responsable
                </button>
              )}
              <CaseActions
                caseId={caso.id}
                estado={estado}
                canManage={canManage && !transferredOut}
                onStateChanged={reload}
              />
              <button
                type="button"
                onClick={() => setTab("historial")}
                className={buttonClass("secondary", "sm")}
              >
                Ver historial completo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Atenciones ---------------- */}
      {tab === "atenciones" && (
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">
            Atenciones ({atenciones.length})
          </h2>

          {canManage && !transferredOut && estado !== "cerrado" && (
            <div className="mt-4">
              <NewAttentionForm caseId={caso.id} onCreated={reload} />
            </div>
          )}

          {canManage && !transferredOut && estado === "cerrado" && (
            <p className="mt-4 text-sm text-ink-muted">
              El caso está cerrado: no se pueden registrar nuevas atenciones. Reabre
              el caso para continuar.
            </p>
          )}

          {sortedAtenciones.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Sin atenciones"
                description="Registra la primera atención para que el caso pase a En proceso."
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {sortedAtenciones.map((atencion) => (
                <li key={atencion.id}>
                  <Link
                    href={`/casos/${id}/atenciones/${atencion.id}`}
                    className="block rounded-xl border border-line bg-white p-4 transition hover:border-primary/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {atencion.motivo}
                      </p>
                      <span className="text-xs font-medium text-ink-muted">
                        {fmtDateTime(atencion.fecha)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                      {atencion.que_se_hizo}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {atencion.edited_at && (
                        <span className="font-medium text-amber-600">(editada)</span>
                      )}
                      <span className="font-medium text-brand-600">Ver detalle</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------------- Derivaciones ---------------- */}
      {tab === "derivaciones" && (
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">
              Derivaciones ({derivaciones.length})
            </h2>
            {canCreateDer && (
              <Link
                href={`/derivaciones/nueva?student=${caso.student_id}`}
                className={buttonClass("secondary", "sm")}
              >
                Nueva derivación
              </Link>
            )}
          </div>

          {linkError && (
            <div className="mt-4">
              <ErrorBanner>{linkError}</ErrorBanner>
            </div>
          )}

          {derivaciones.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Sin derivaciones"
                description="Registra una derivación o vincula una existente a este caso."
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {derivaciones.map((der) => {
                const isOrigin = der.id === caso.derivation_id;
                const canLink =
                  canGestionarCasos && !caso.derivation_id && !der.caso_id;
                return (
                  <li
                    key={der.id}
                    className="rounded-xl border border-line bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{der.motivo}</p>
                      <span className="text-xs font-medium text-ink-muted">
                        {fmtDate(der.derivation_date)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      Derivado por: {der.derivador_nombre}
                      {der.derivador_cargo ? ` · ${der.derivador_cargo}` : ""}
                    </p>
                    {der.resumen && (
                      <p className="mt-2 text-sm text-ink-muted">{der.resumen}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                      {isOrigin ? (
                        <span className="font-semibold text-emerald-700">
                          Derivación de origen de este caso
                        </span>
                      ) : der.caso_id ? (
                        <Link
                          href={`/casos/${der.caso_id}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          Ver caso vinculado
                        </Link>
                      ) : (
                        <span className="text-ink-muted">Sin caso</span>
                      )}
                      <Link
                        href={`/derivaciones/${der.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        Ver detalle
                      </Link>
                      {canLink && (
                        <button
                          type="button"
                          disabled={linkingId === der.id}
                          onClick={() => linkDerivation(der.id)}
                          className={buttonClass("secondary", "sm")}
                        >
                          {linkingId === der.id
                            ? "Vinculando..."
                            : "Vincular a este caso"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!caso.derivation_id && derivaciones.length > 0 && (
            <p className="mt-4 text-xs text-ink-muted">
              Vincular una derivación como antecedente no crea un segundo caso.
            </p>
          )}
        </div>
      )}

      {/* ---------------- Historial ---------------- */}
      {tab === "historial" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink">
              Responsables
            </h2>
            <div className="mt-4">
              <ResponsibleHistory
                caseId={caso.id}
                currentResponsibleId={caso.current_responsible_id}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink">
              Auditoría del caso
            </h2>
            {auditRows.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                Sin eventos de auditoría visibles para su rol.
                {caso.closed_at && (
                  <>
                    {" "}
                    Último cierre: {fmtDateTime(caso.closed_at)}
                    {caso.close_reason ? ` · ${caso.close_reason}` : ""}.
                  </>
                )}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {auditRows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-xs font-medium text-ink-muted">
                      {fmtDateTime(row.created_at)}
                    </span>
                    <span className="font-medium text-ink">
                      {AUDIT_LABELS[row.action] ?? row.action}
                    </span>
                    {userNames[row.user_id] && (
                      <span className="text-ink-muted">{userNames[row.user_id]}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-bold text-ink">Transferencias</h2>
            {transfers.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                Sin transferencias registradas.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {transfers.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-xs font-medium text-ink-muted">
                      {fmtDateTime(t.created_at)}
                    </span>
                    <span className="font-medium text-ink">
                      {TRANSFER_LABELS[t.status] ?? t.status}
                    </span>
                    <span className="text-ink-muted">
                      Origen:{" "}
                      {institutionNames[t.origin_institution_id] ??
                        "su institución"}{" "}
                      → Destino:{" "}
                      {institutionNames[t.destination_institution_id] ??
                        "otra institución"}
                    </span>
                    {t.transferred_at && (
                      <span className="text-ink-muted">
                        Efectivizada: {fmtDate(t.transferred_at)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Documentos ---------------- */}
      {tab === "documentos" && showDocsTab && (
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">
            Documentos del estudiante
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Los documentos pertenecen al estudiante. La descarga genera un enlace
            temporal; no se almacena ninguna referencia permanente.
          </p>
          <div className="mt-4">
            <StudentDocumentsPanel studentId={caso.student_id} />
          </div>
        </div>
      )}

      {/* CAS-06: reasignar responsable */}
      <ReassignCaseModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        casoId={caso.id}
        institutionId={activePeriod?.institution_id ?? null}
        currentResponsibleId={caso.current_responsible_id}
        onChanged={reload}
      />

      {/* Editar situación */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar caso"
      >
        <form onSubmit={saveSituacion} className="space-y-4">
          {sitError && <ErrorBanner>{sitError}</ErrorBanner>}
          <Field label="Situación *">
            <textarea
              value={sitText}
              onChange={(e) => setSitText(e.target.value)}
              rows={4}
              className={inputClasses}
              placeholder="Describe la situación que motivó el caso..."
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingSit}
              className={buttonClass("primary", "md")}
            >
              {savingSit ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
