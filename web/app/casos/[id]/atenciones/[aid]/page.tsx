"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useAttentionEdit } from "@/hooks/useAttentionEdit";
import { AttentionAuditPanel } from "@/components/casos/AttentionAuditPanel";
import { CaseStatusBadge } from "@/components/casos/CaseStatusBadge";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { Atencion } from "@/types/database";
import type { CasoEstado } from "@/types/supabase";
import { PageHeader } from "@/components/ui/page-header";
import { Field, inputClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { LoadingScreen, RestrictedAccess, Spinner } from "@/components/ui/feedback";
import { can } from "@/lib/permissions";

const EDIT_WINDOW_MS = 30 * 60 * 1000;

type AttentionContext = Atencion & {
  casos: {
    id: string;
    estado: CasoEstado;
    estudiantes: {
      first_names: string;
      last_names: string;
    } | null;
  } | null;
};

type Draft = {
  motivo: string;
  que_se_hizo: string;
  observaciones: string;
  compromisos: string;
  proxima_atencion: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
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

function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${pad2(seconds)}`;
}

function draftToText(draft: Draft): string {
  return [
    `Motivo: ${draft.motivo}`,
    `Qué se hizo: ${draft.que_se_hizo}`,
    draft.observaciones ? `Observaciones: ${draft.observaciones}` : null,
    draft.compromisos ? `Compromisos: ${draft.compromisos}` : null,
    draft.proxima_atencion
      ? `Próxima atención: ${new Date(draft.proxima_atencion).toLocaleString("es-PE")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function AttentionDetailPage({
  params,
}: {
  params: Promise<{ id: string; aid: string }>;
}) {
  const { id, aid } = use(params);
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [attention, setAttention] = useState<AttentionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  // Hora del servidor (offset ms = servidor - cliente)
  const [serverOffset, setServerOffset] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { updateAttention, error: updateError } = useAttentionEdit();

  const reload = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

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
        const [{ data, error: fetchError }, { data: nowData, error: nowError }] =
          await Promise.all([
            supabase
              .from("atenciones")
              .select(
                `*,
                 casos(id, estado, estudiantes(first_names, last_names))`
              )
              .eq("id", aid)
              .maybeSingle(),
            supabase.rpc("server_now"),
          ]);
        if (cancelled) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setError("Atención no encontrada");
          return;
        }
        setAttention(data as AttentionContext);
        if (nowError) throw nowError;
        const serverTime = new Date(nowData as string).getTime();
        setServerOffset(serverTime - Date.now());
        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("atencion.load", err);
        setError(toUserMessage(err, "Error al cargar la atención"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [aid, reloadVersion]);

  // Tick cada segundo (solo cliente tras conocer el offset del servidor)
  useEffect(() => {
    if (!attention) return;
    const raf = requestAnimationFrame(() => setNowMs(Date.now()));
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
    };
  }, [attention]);

  const canEditRole = role === "global" || role === "psicologo";
  const canSeeAudit = can(role, "auditoria.consultar");

  const remainingMs = useMemo(() => {
    if (!attention || serverOffset === null || nowMs === 0) return null;
    const deadline =
      new Date(attention.created_at).getTime() + EDIT_WINDOW_MS;
    return deadline - (nowMs + serverOffset);
  }, [attention, serverOffset, nowMs]);

  const editable = canEditRole && (remainingMs === null || remainingMs > 0);
  const locked = canEditRole && remainingMs !== null && remainingMs <= 0;
  const lockedWhileEditing = locked && editMode;

  const startEdit = () => {
    if (!attention) return;
    setDraft({
      motivo: attention.motivo,
      que_se_hizo: attention.que_se_hizo,
      observaciones: attention.observaciones ?? "",
      compromisos: attention.compromisos ?? "",
      proxima_atencion: toLocalInput(attention.proxima_atencion),
    });
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attention || !draft || saving) return;
    setSaving(true);
    const ok = await updateAttention(attention.id, {
      motivo: draft.motivo,
      que_se_hizo: draft.que_se_hizo,
      observaciones: draft.observaciones || undefined,
      compromisos: draft.compromisos || undefined,
      proxima_atencion: draft.proxima_atencion || undefined,
    });
    setSaving(false);
    if (ok) {
      toast.success("Atención actualizada");
      setEditMode(false);
      setDraft(null);
      reload();
    }
    // Si falla (p. ej. ventana expirada), updateError del hook se muestra en el
    // formulario y el draft conserva el texto del usuario.
  };

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draftToText(draft));
      toast.success("Texto copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el texto");
    }
  };

  if (loading || profileLoading) {
    return <LoadingScreen label="Cargando atención..." />;
  }

  if (error || !attention) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-ink">Error</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {error || "Atención no encontrada"}
          </p>
          <Link href="/atenciones" className={buttonClass("secondary", "md")}>
            Volver a atenciones
          </Link>
        </div>
      </div>
    );
  }

  const studentName = attention.casos?.estudiantes
    ? `${attention.casos.estudiantes.first_names} ${attention.casos.estudiantes.last_names}`
    : "Estudiante";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Atención"
        subtitle={`${studentName} · ${fmtDateTime(attention.fecha)}`}
        breadcrumbs={[
          { label: "Atenciones", href: "/atenciones" },
          { label: "Detalle" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <CaseStatusBadge estado={attention.casos?.estado ?? "inicio"} />
          <Link
            href={`/casos/${attention.casos?.id ?? id}`}
            className={buttonClass("secondary", "sm")}
          >
            Ver caso
          </Link>
        </div>

        {canEditRole && (
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              locked
                ? "bg-slate-100 text-slate-600"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {locked ? (
              <>🔒 Ya no se puede editar (pasaron 30 minutos)</>
            ) : remainingMs === null ? (
              "Editable..."
            ) : (
              <>Editable {formatCountdown(remainingMs)} restantes</>
            )}
          </span>
        )}
      </div>

      {!canEditRole && (
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink-muted">
          Esta atención es de solo lectura para su rol.
        </div>
      )}

      {lockedWhileEditing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span>
            La ventana de 30 minutos expiró mientras editaba. El texto no se ha
            perdido: cópielo antes de salir.
          </span>
          <button type="button" onClick={copyDraft} className={buttonClass("secondary", "sm")}>
            Copiar texto
          </button>
        </div>
      )}

      {/* Detalle / edición */}
      <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">Detalle</h2>
          {canEditRole && !editMode && editable && (
            <button type="button" onClick={startEdit} className={buttonClass("secondary", "sm")}>
              Editar
            </button>
          )}
        </div>

        {editMode && draft ? (
          <form onSubmit={save} className="mt-4 space-y-4">
            {updateError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {updateError}
              </div>
            )}

            <Field label="Motivo *">
              <textarea
                value={draft.motivo}
                onChange={(e) => setDraft({ ...draft, motivo: e.target.value })}
                rows={2}
                disabled={locked}
                className={inputClasses}
              />
            </Field>
            <Field label="Qué se hizo *">
              <textarea
                value={draft.que_se_hizo}
                onChange={(e) => setDraft({ ...draft, que_se_hizo: e.target.value })}
                rows={3}
                disabled={locked}
                className={inputClasses}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Observaciones">
                <textarea
                  value={draft.observaciones}
                  onChange={(e) =>
                    setDraft({ ...draft, observaciones: e.target.value })
                  }
                  rows={2}
                  disabled={locked}
                  className={inputClasses}
                />
              </Field>
              <Field label="Compromisos">
                <textarea
                  value={draft.compromisos}
                  onChange={(e) =>
                    setDraft({ ...draft, compromisos: e.target.value })
                  }
                  rows={2}
                  disabled={locked}
                  className={inputClasses}
                />
              </Field>
            </div>
            <Field label="Próxima atención">
              <input
                type="datetime-local"
                value={draft.proxima_atencion}
                onChange={(e) =>
                  setDraft({ ...draft, proxima_atencion: e.target.value })
                }
                disabled={locked}
                className={inputClasses}
              />
            </Field>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={cancelEdit}
                className={buttonClass("secondary", "md")}
              >
                {locked ? "Cerrar" : "Cancelar"}
              </button>
              {!locked && (
                <button
                  type="submit"
                  disabled={saving}
                  className={buttonClass("primary", "md")}
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              )}
            </div>
          </form>
        ) : (
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-medium text-ink-soft">Motivo</dt>
              <dd className="mt-1 whitespace-pre-wrap text-ink-muted">
                {attention.motivo}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-soft">Qué se hizo</dt>
              <dd className="mt-1 whitespace-pre-wrap text-ink-muted">
                {attention.que_se_hizo}
              </dd>
            </div>
            {attention.observaciones && (
              <div>
                <dt className="font-medium text-ink-soft">Observaciones</dt>
                <dd className="mt-1 whitespace-pre-wrap text-ink-muted">
                  {attention.observaciones}
                </dd>
              </div>
            )}
            {attention.compromisos && (
              <div>
                <dt className="font-medium text-ink-soft">Compromisos</dt>
                <dd className="mt-1 whitespace-pre-wrap text-ink-muted">
                  {attention.compromisos}
                </dd>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ink-soft">Fecha (servidor)</dt>
                <dd className="mt-1 text-ink-muted">
                  {fmtDateTime(attention.fecha)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink-soft">Próxima atención</dt>
                <dd className="mt-1 text-ink-muted">
                  {fmtDateTime(attention.proxima_atencion)}
                </dd>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-ink-soft">Registrada</dt>
                <dd className="mt-1 text-ink-muted">
                  {fmtDateTime(attention.created_at)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink-soft">Última edición</dt>
                <dd className="mt-1 text-ink-muted">
                  {fmtDateTime(attention.edited_at)}
                  {saving && <Spinner className="ml-2 inline h-4 w-4" />}
                </dd>
              </div>
            </div>
          </dl>
        )}
      </div>

      {canSeeAudit && <AttentionAuditPanel attentionId={attention.id} />}
    </div>
  );
}
