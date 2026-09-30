"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { Field, inputClasses } from "@/components/ui/field";
import { ErrorBanner, LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";
import type { TransferenciaStatus } from "@/types/supabase";

type TransferRow = {
  id: string;
  caso_id: string;
  origin_institution_id: string;
  destination_institution_id: string;
  destination_nivel_id: string | null;
  destination_grado_id: string | null;
  section: string | null;
  school_year: number | null;
  status: TransferenciaStatus;
  authorized_by: string | null;
  authorized_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  transferred_at: string | null;
  created_at: string;
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

type TimelineEvent = {
  key: string;
  label: string;
  hint: string;
  at: string;
};

/**
 * TRF-03 — Detalle y línea de tiempo de una transferencia.
 * Para A (origen): Autorizar (con explicación de efectos) y Rechazar.
 * Registra eventos transfer_requested / transfer_authorized / transfer_rejected.
 */
export default function TransferenciaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const myInst = profile?.institution_id ?? null;

  const [transfer, setTransfer] = useState<TransferRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [caso, setCaso] = useState<{
    id: string;
    student_id: string;
    situation: string;
    estado: string;
  } | null>(null);
  const [estudiante, setEstudiante] = useState<{
    first_names: string;
    last_names: string;
    document_number: string;
  } | null>(null);
  const [instNames, setInstNames] = useState<Map<string, string>>(new Map());
  const [nivelName, setNivelName] = useState<string | null>(null);
  const [gradoName, setGradoName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [authOpen, setAuthOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!can(role, "transferencias.consultar")) return;

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setNotFound(false);
    });

    (async () => {
      try {
        const supabase = createClient();
        const { data: tRow, error: tError } = await supabase
          .from("transferencias")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (cancelled) return;
        if (tError) throw tError;
        const row = tRow as unknown as TransferRow | null;
        if (!row) {
          setNotFound(true);
          setTransfer(null);
          return;
        }
        setTransfer(row);

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
        setInstNames(instMap);

        const { data: casoRow, error: casoError } = await supabase
          .from("casos")
          .select("id, student_id, situation, estado")
          .eq("id", row.caso_id)
          .maybeSingle();
        if (cancelled) return;
        if (casoError) throw casoError;
        setCaso(
          (casoRow as unknown as {
            id: string;
            student_id: string;
            situation: string;
            estado: string;
          } | null) ?? null
        );

        if (casoRow) {
          const { data: estRow, error: estError } = await supabase
            .from("estudiantes")
            .select("first_names, last_names, document_number")
            .eq("id", (casoRow as { student_id: string }).student_id)
            .maybeSingle();
          if (cancelled) return;
          if (estError) throw estError;
          setEstudiante(
            (estRow as unknown as {
              first_names: string;
              last_names: string;
              document_number: string;
            } | null) ?? null
          );
        } else {
          setEstudiante(null);
        }

        if (row.destination_nivel_id) {
          const { data: nivelRow } = await supabase
            .from("niveles_educativos")
            .select("id, name")
            .eq("id", row.destination_nivel_id)
            .maybeSingle();
          if (cancelled) return;
          setNivelName((nivelRow as { name: string } | null)?.name ?? null);
        } else {
          setNivelName(null);
        }

        if (row.destination_grado_id) {
          const { data: gradoRow } = await supabase
            .from("grados")
            .select("id, name")
            .eq("id", row.destination_grado_id)
            .maybeSingle();
          if (cancelled) return;
          setGradoName((gradoRow as { name: string } | null)?.name ?? null);
        } else {
          setGradoName(null);
        }

        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("transferencia.detalle.load", err);
        setError(toUserMessage(err, "Error al cargar la transferencia"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [reloadVersion, profileLoading, role, isGlobal, myInst, id]);

  const authorize = async () => {
    if (!transfer) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("authorize_transfer", {
        p_transfer_id: transfer.id,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        setActionError(String(data?.error ?? "Error al autorizar la transferencia"));
        return;
      }
      toast.success("Transferencia autorizada");
      setAuthOpen(false);
      setReloadVersion((n) => n + 1);
    } catch (err) {
      logClientError("transferencia.detalle.authorize", err);
      setActionError(toUserMessage(err, "Error al autorizar la transferencia"));
    } finally {
      setActionBusy(false);
    }
  };

  const reject = async () => {
    if (!transfer) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("reject_transfer", {
        p_transfer_id: transfer.id,
        p_reason: rejectReason.trim() || null,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        setActionError(String(data?.error ?? "Error al rechazar la transferencia"));
        return;
      }
      toast.success("Solicitud rechazada");
      setRejectOpen(false);
      setRejectReason("");
      setReloadVersion((n) => n + 1);
    } catch (err) {
      logClientError("transferencia.detalle.reject", err);
      setActionError(toUserMessage(err, "Error al rechazar la transferencia"));
    } finally {
      setActionBusy(false);
    }
  };

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "transferencias.consultar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para ver las transferencias." />
      </div>
    );
  }

  if (loading) return <LoadingScreen label="Cargando transferencia..." />;

  if (notFound || !transfer) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tienes permiso para ver esto." />
      </div>
    );
  }

  const soyOrigen =
    isGlobal || (myInst !== null && transfer.origin_institution_id === myInst);
  const canActuar =
    transfer.status === "pending" && soyOrigen && can(role, "transferencias.autorizar");

  const origenName =
    instNames.get(transfer.origin_institution_id) ?? OTRA_IE;
  const destinoName =
    instNames.get(transfer.destination_institution_id) ?? OTRA_IE;

  const eventos: TimelineEvent[] = [
    {
      key: "transfer_requested",
      label: "Solicitud enviada (transfer_requested)",
      hint: "B (institución destino) solicita — sin efecto en A",
      at: transfer.created_at,
    },
    ...(transfer.authorized_at
      ? [
          {
            key: "transfer_authorized",
            label: "Transferencia autorizada (transfer_authorized)",
            hint: "A (institución origen) autoriza — cierra período en A y crea período en B",
            at: transfer.authorized_at,
          },
        ]
      : []),
    ...(transfer.rejected_at
      ? [
          {
            key: "transfer_rejected",
            label: "Solicitud rechazada (transfer_rejected)",
            hint: transfer.reject_reason
              ? `A (institución origen) rechaza — Motivo: ${transfer.reject_reason}`
              : "A (institución origen) rechaza — sin motivo indicado",
            at: transfer.rejected_at,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Transferencia"
        subtitle={`${origenName} → ${destinoName}`}
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Transferencias", href: "/transferencias" },
          { label: transfer.id.slice(0, 8) },
        ]}
        actions={
          <StatusPill tone={TRANSFER_TONES[transfer.status] ?? "slate"}>
            {TRANSFER_LABELS[transfer.status] ?? transfer.status}
          </StatusPill>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {actionError && <ErrorBanner>{actionError}</ErrorBanner>}

      {/* Resumen */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Resumen</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Caso
            </dt>
            <dd className="font-medium text-ink">
              {caso ? caso.situation : `Caso ${transfer.caso_id.slice(0, 8)}`}
            </dd>
            {caso && (
              <Link
                href={`/casos/${caso.id}`}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                Ver caso
              </Link>
            )}
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Estudiante
            </dt>
            <dd className="font-medium text-ink">
              {estudiante
                ? `${estudiante.last_names}, ${estudiante.first_names} · DNI ${estudiante.document_number}`
                : "Sin acceso a los datos del estudiante"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              I.E. origen (A)
            </dt>
            <dd className="font-medium text-ink">{origenName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              I.E. destino (B)
            </dt>
            <dd className="font-medium text-ink">{destinoName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Nivel / grado / sección destino
            </dt>
            <dd className="font-medium text-ink">
              {nivelName ?? "—"} · {gradoName ?? "—"} ·{" "}
              {transfer.section ? `Sección ${transfer.section}` : "—"}
              {transfer.school_year ? ` · ${transfer.school_year}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Transfiere responsabilidad
            </dt>
            <dd className="font-medium text-ink">
              {transfer.transferred_at
                ? fmtDateTime(transfer.transferred_at)
                : "Aún no transferida (pendiente de autorización)"}
            </dd>
          </div>
        </dl>
        {transfer.reject_reason && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
            Motivo del rechazo: {transfer.reject_reason}
          </p>
        )}
        {canActuar && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setAuthOpen(true);
              }}
              className={buttonClass("primary", "md")}
            >
              Autorizar
            </button>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setRejectOpen(true);
              }}
              className={buttonClass("danger", "md")}
            >
              Rechazar
            </button>
          </div>
        )}
      </section>

      {/* Línea de tiempo */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Línea de tiempo</h2>
        <ol className="mt-4 space-y-5 border-l-2 border-line pl-5">
          {eventos.map((ev) => (
            <li key={ev.key} className="relative">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-indigo-500" />
              <p className="text-sm font-semibold text-ink">{ev.label}</p>
              <p className="text-xs text-ink-muted">{ev.hint}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{fmtDateTime(ev.at)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Diálogo Autorizar */}
      <Modal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Autorizar transferencia"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAuthOpen(false)}
              disabled={actionBusy}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void authorize()}
              disabled={actionBusy}
              className={buttonClass("primary", "md")}
            >
              {actionBusy ? "Autorizando..." : "Confirmar autorización"}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>Al autorizar, el servidor ejecutará estas acciones:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Cierra el período escolar en A (institución origen).</li>
            <li>Crea el período escolar en B (institución destino).</li>
            <li>Transfiere la responsabilidad del caso al equipo de B.</li>
            <li>A conserva acceso de consulta al historial.</li>
          </ul>
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            Esta acción no se puede deshacer desde la interfaz.
          </p>
          {actionError && <ErrorBanner>{actionError}</ErrorBanner>}
        </div>
      </Modal>

      {/* Diálogo Rechazar */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Rechazar solicitud"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              disabled={actionBusy}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void reject()}
              disabled={actionBusy}
              className={buttonClass("danger", "md")}
            >
              {actionBusy ? "Rechazando..." : "Confirmar rechazo"}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            El rechazo no produce efectos: el caso y el período en A permanecen
            intactos. La solicitud quedará marcada como <strong>rechazada</strong>.
          </p>
          <Field label="Motivo (opcional)">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Indica el motivo del rechazo..."
              className={inputClasses}
            />
          </Field>
          {actionError && <ErrorBanner>{actionError}</ErrorBanner>}
        </div>
      </Modal>
    </div>
  );
}
