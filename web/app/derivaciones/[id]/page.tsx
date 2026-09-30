"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useStudentDocuments } from "@/hooks/useStudentDocuments";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, selectClasses } from "@/components/ui/field";
import { ErrorBanner, LoadingScreen } from "@/components/ui/feedback";
import type { Derivacion } from "@/types/database";
import type { CasoEstado } from "@/types/supabase";

type DerivacionConEstudiante = Derivacion & {
  estudiantes: {
    id: string;
    first_names: string;
    last_names: string;
    document_number: string;
  } | null;
};

type CasoRow = {
  id: string;
  estado: CasoEstado;
  situation: string;
  opened_at: string;
  derivation_id: string | null;
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
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

export default function DerivacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [der, setDer] = useState<DerivacionConEstudiante | null>(null);
  const [casos, setCasos] = useState<CasoRow[]>([]);
  const [docFilename, setDocFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [targetCase, setTargetCase] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const studentId = der?.student_id ?? null;
  const { download, loading: docsLoading } = useStudentDocuments(
    studentId && der?.adjunto_url?.startsWith("doc:") ? studentId : null
  );

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
          .from("derivaciones")
          .select(
            `*,
             estudiantes(id, first_names, last_names, document_number)`
          )
          .eq("id", id)
          .maybeSingle();
        if (cancelled) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setError("Derivación no encontrada");
          return;
        }
        const derData = data as unknown as DerivacionConEstudiante;
        setDer(derData);

        const { data: casosData } = await supabase
          .from("casos")
          .select("id, estado, situation, opened_at, derivation_id")
          .eq("student_id", derData.student_id)
          .order("opened_at", { ascending: false })
          .limit(50);
        if (cancelled) return;
        setCasos((casosData ?? []) as unknown as CasoRow[]);

        // Nombre del adjunto (referencia doc:<id>)
        if (derData.adjunto_url?.startsWith("doc:")) {
          const docId = derData.adjunto_url.slice(4);
          const { data: doc } = await supabase
            .from("documentos")
            .select("filename")
            .eq("id", docId)
            .maybeSingle();
          if (!cancelled) {
            setDocFilename(
              (doc as { filename: string } | null)?.filename ?? "Adjunto"
            );
          }
        } else {
          setDocFilename(null);
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        logClientError("derivacion.load", err);
        setError(toUserMessage(err, "Error al cargar la derivación"));
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

  const linkCase = async () => {
    if (!targetCase || linking) return;
    setLinking(true);
    setLinkError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("link_case_derivation", {
        p_case_id: targetCase,
        p_derivation_id: id,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        setLinkError(data?.error ?? "No se pudo vincular la derivación");
        return;
      }
      reload();
    } catch (err) {
      logClientError("derivacion.link", err);
      setLinkError(toUserMessage(err, "No se pudo vincular la derivación"));
    } finally {
      setLinking(false);
    }
  };

  const downloadAdjunto = async () => {
    if (!der?.adjunto_url?.startsWith("doc:")) return;
    const docId = der.adjunto_url.slice(4);
    const url = await download(docId);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = docFilename ?? "adjunto";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  if (loading || profileLoading) {
    return <LoadingScreen label="Cargando derivación..." />;
  }

  if (error || !der) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-ink">Error</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {error || "Derivación no encontrada"}
          </p>
          <Link href="/derivaciones" className={buttonClass("secondary", "md")}>
            Volver a derivaciones
          </Link>
        </div>
      </div>
    );
  }

  const student = der.estudiantes;
  const linkedCaso = der.caso_id ? casos.find((c) => c.id === der.caso_id) : null;
  const linkableCasos = casos.filter((c) => !c.derivation_id);
  const canLink = can(role, "derivaciones.crear") && !der.caso_id;
  const hasAdjuntoRef = der.adjunto_url?.startsWith("doc:");
  const hasExternalAdjunto =
    !!der.adjunto_url && /^https?:\/\//.test(der.adjunto_url);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Derivación"
        subtitle={
          student
            ? `${student.first_names} ${student.last_names} · DNI ${student.document_number}`
            : "Estudiante"
        }
        breadcrumbs={[
          { label: "Derivaciones", href: "/derivaciones" },
          { label: "Detalle" },
        ]}
        actions={
          student ? (
            <Link
              href={`/estudiantes/${student.id}`}
              className={buttonClass("secondary", "md")}
            >
              Ver ficha
            </Link>
          ) : undefined
        }
      />

      {linkError && <ErrorBanner>{linkError}</ErrorBanner>}

      {/* Datos de la derivación */}
      <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">Derivación</h2>
          <Badge tone={der.caso_id ? "indigo" : "amber"}>
            {der.caso_id ? "Vinculada a un Caso" : "Sin Caso"}
          </Badge>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink-soft">Fecha del evento</dt>
            <dd className="mt-1 text-ink-muted">{fmtDate(der.derivation_date)}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink-soft">Registrada</dt>
            <dd className="mt-1 text-ink-muted">{fmtDateTime(der.created_at)}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink-soft">Derivado por</dt>
            <dd className="mt-1 text-ink-muted">
              {der.derivador_nombre}
              {der.derivador_cargo ? ` · ${der.derivador_cargo}` : ""}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink-soft">Período escolar</dt>
            <dd className="mt-1 text-ink-muted">Asignado por el servidor según fecha</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-ink-soft">Motivo</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink-muted">{der.motivo}</dd>
          </div>
          {der.resumen && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-ink-soft">Resumen</dt>
              <dd className="mt-1 whitespace-pre-wrap text-ink-muted">{der.resumen}</dd>
            </div>
          )}
          {der.acciones_previas && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-ink-soft">Acciones previas</dt>
              <dd className="mt-1 whitespace-pre-wrap text-ink-muted">
                {der.acciones_previas}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Vínculo con Caso */}
      <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
        <h2 className="font-display text-lg font-bold text-ink">Vínculo con Caso</h2>

        {der.caso_id ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
            <div>
              <p className="text-sm font-medium text-ink">
                {linkedCaso ? linkedCaso.situation : "Caso vinculado"}
              </p>
              <p className="text-xs text-ink-muted">
                La derivación es un registro histórico: enlazarla no crea un segundo
                Caso.
              </p>
            </div>
            <Link
              href={`/casos/${der.caso_id}`}
              className={buttonClass("secondary", "sm")}
            >
              Ver caso
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ink-muted">
              Esta derivación no tiene Caso. Puede guardarse sin Caso.
            </p>

            {canLink && (
              <>
                {linkableCasos.length === 0 ? (
                  <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
                    El estudiante no tiene casos disponibles para vincular. Cree un
                    caso desde el módulo de Casos.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Caso (antecedente)">
                      <select
                        value={targetCase}
                        onChange={(e) => setTargetCase(e.target.value)}
                        className={selectClasses}
                      >
                        <option value="">Selecciona un caso...</option>
                        {linkableCasos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {fmtDate(c.opened_at)} · {c.situation.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button
                      type="button"
                      onClick={linkCase}
                      disabled={!targetCase || linking}
                      className={buttonClass("primary", "md")}
                    >
                      {linking ? "Vinculando..." : "Vincular a un Caso como antecedente"}
                    </button>
                  </div>
                )}
              </>
            )}

            {!canLink && (
              <p className="text-xs text-ink-muted">
                La vinculación la realizan los roles con permiso de gestión de
                derivaciones.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Adjunto */}
      {(hasAdjuntoRef || hasExternalAdjunto) && (
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">Adjunto</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
            <p className="text-sm text-ink-muted">
              {docFilename ?? "Documento adjunto"}
            </p>
            {hasAdjuntoRef ? (
              <button
                type="button"
                onClick={downloadAdjunto}
                disabled={docsLoading}
                className={buttonClass("secondary", "sm")}
              >
                {docsLoading ? "Preparando..." : "Descargar adjunto"}
              </button>
            ) : (
              <a
                href={der.adjunto_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary", "sm")}
              >
                Abrir adjunto
              </a>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            La descarga genera un enlace temporal; no se almacena ninguna referencia
            permanente.
          </p>
        </div>
      )}
    </div>
  );
}
