"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEncuestas } from "@/hooks/useEncuestas";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
} from "@/components/ui/feedback";
import { CopySurveyDialog } from "@/components/encuestas/CopySurveyDialog";
import type {
  SurveyApplicationItem,
  SurveyVersionItem,
} from "@/types/encuestas";

interface SurveySummary {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  institution_name: string | null;
}

const VERSION_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  in_review: "bg-sky-100 text-sky-800",
  published: "bg-emerald-100 text-emerald-800",
  archived: "bg-slate-100 text-slate-700",
};

const VERSION_LABELS: Record<string, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  published: "Publicada",
  archived: "Archivada",
};

function applicationState(
  app: Pick<SurveyApplicationItem, "status" | "ends_at">,
  now: Date
): string {
  if (app.status === "scheduled") return "Programada";
  if (app.status === "completed" || app.status === "closed") return "Cerrada";
  return new Date(app.ends_at).getTime() <= now.getTime()
    ? "Vencida"
    : "Abierta";
}

export default function SurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { getSurveyVersions, createNewVersion, copySurvey } = useEncuestas();

  const [summary, setSummary] = useState<SurveySummary | null>(null);
  const [versions, setVersions] = useState<SurveyVersionItem[]>([]);
  const [applications, setApplications] = useState<SurveyApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [gateModal, setGateModal] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data: survey, error: surveyErr } = await supabase
          .from("encuestas")
          .select("id, title, description, created_at, institutions(name)")
          .eq("id", id)
          .single();
        if (surveyErr) throw surveyErr;
        const vers = await getSurveyVersions(id);
        const apps: SurveyApplicationItem[] = [];
        if (vers.length > 0) {
          const { data: rows, error: appsErr } = await supabase
            .from("encuesta_aplicaciones")
            .select("*")
            .in(
              "version_id",
              vers.map((v) => v.id)
            )
            .order("created_at", { ascending: false });
          if (appsErr) throw appsErr;
          apps.push(...((rows ?? []) as SurveyApplicationItem[]));
        }
        if (cancelled) return;
        setSummary({
          id: survey.id,
          title: survey.title,
          description: survey.description,
          created_at: survey.created_at,
          institution_name:
            (survey.institutions as unknown as { name: string } | null)
              ?.name ?? null,
        });
        setVersions(vers);
        setApplications(apps);
        setNow(new Date());
      } catch (err) {
        if (cancelled) return;
        logClientError("encuestas.detail.load", err);
        setError(toUserMessage(err, "Error al cargar la encuesta"));
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, getSurveyVersions]);

  const hasDraft = versions.some((v) => v.status === "draft");
  const latest = versions[0] ?? null;
  const canCreateVersion =
    !hasDraft && latest !== null && latest.status === "published";

  const handleNewVersion = async () => {
    if (hasDraft) {
      setGateModal(
        "Ya existe un borrador de esta encuesta. Edítalo antes de crear otra versión."
      );
      return;
    }
    if (!canCreateVersion) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createNewVersion(id);
      router.push(`/encuestas/${id}/versiones/${created.id}/editar`);
      return;
    } catch (err) {
      logClientError("encuestas.detail.newVersion", err);
      setError(toUserMessage(err, "Error al crear nueva versión"));
    }
    setBusy(false);
  };

  const handleCopy = async (newTitle: string) => {
    setBusy(true);
    setCopyError(null);
    try {
      const newId = await copySurvey(id, newTitle);
      setShowCopy(false);
      router.push(`/encuestas/${newId}/constructor`);
      return;
    } catch (err) {
      logClientError("encuestas.detail.copy", err);
      setCopyError(toUserMessage(err, "Error al copiar"));
    }
    setBusy(false);
  };

  if (loading) {
    return <LoadingScreen label="Cargando encuesta..." />;
  }

  if (error && !summary) {
    return <ErrorBanner>{error}</ErrorBanner>;
  }

  if (!summary) {
    return (
      <EmptyState
        title="Encuesta no encontrada."
        description="Puede que haya sido eliminada."
        action={
          <Link href="/encuestas" className={buttonClass("secondary", "md")}>
            Volver a encuestas
          </Link>
        }
      />
    );
  }

  const avgProgress =
    applications.length === 0
      ? null
      : Math.round(
          applications.reduce((acc, a) => acc + (a.progress ?? 0), 0) /
            applications.length
        );
  const recentApps = applications.slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            <Link href="/encuestas" className="hover:text-slate-600">
              Encuestas
            </Link>{" "}
            / {summary.title}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {summary.title}
          </h1>
          {summary.description && (
            <p className="mt-1 text-sm text-slate-500">
              {summary.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {summary.institution_name && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 font-medium text-indigo-700">
                {summary.institution_name}
              </span>
            )}
            <span>
              Creada:{" "}
              {new Date(summary.created_at).toLocaleDateString("es-PE")}
            </span>
            <span>
              {versions.length}{" "}
              {versions.length === 1 ? "versión" : "versiones"}
            </span>
            <span>
              {applications.length}{" "}
              {applications.length === 1 ? "aplicación" : "aplicaciones"}
            </span>
            {avgProgress !== null && <span>Avance promedio: {avgProgress}%</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/encuestas/${id}/constructor`}
            className={buttonClass("secondary", "md")}
          >
            Editar
          </Link>
          <Button onClick={handleNewVersion} disabled={busy}>
            {busy ? "Procesando..." : "Nueva versión"}
          </Button>
          <Button variant="secondary" onClick={() => setShowCopy(true)}>
            Copiar encuesta
          </Button>
          <Link
            href={`/encuestas/aplicaciones/nueva?survey=${id}`}
            className={buttonClass("primary", "md")}
          >
            Nueva aplicación
          </Link>
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {copyError && <ErrorBanner>{copyError}</ErrorBanner>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Versión vigente
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {versions.find((v) => v.status === "published")?.version_number ??
              "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {hasDraft ? "Borrador en curso" : "Sin borrador"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Aplicaciones
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {applications.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {avgProgress !== null
              ? `Avance promedio ${avgProgress}%`
              : "Sin respuestas aún"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Respuestas
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {versions.reduce((acc, v) => acc + (v.response_count ?? 0), 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Total en todas las versiones
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Versiones
          </h2>
          <Link
            href={`/encuestas/${id}/versiones`}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Ver todas
          </Link>
        </div>
        {versions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Esta encuesta aún no tiene versiones.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {versions.slice(0, 5).map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    V{v.version_number}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      VERSION_STYLES[v.status] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {VERSION_LABELS[v.status] ?? v.status}
                    {v.status === "published" && v.in_use && " 🔒 en uso"}
                  </span>
                  {v.application_count != null && (
                    <span className="text-xs text-slate-500">
                      {v.application_count}{" "}
                      {v.application_count === 1
                        ? "aplicación"
                        : "aplicaciones"}{" "}
                      · {v.response_count ?? 0} respuestas
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Link
                    href={`/encuestas/${id}/preview?version=${v.id}`}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    Vista previa
                  </Link>
                  {v.status === "draft" ? (
                    <Link
                      href={`/encuestas/${id}/versiones/${v.id}/editar`}
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      Editar
                    </Link>
                  ) : (
                    <span className="text-slate-400">Solo lectura</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Aplicaciones recientes
          </h2>
          <Link
            href={`/encuestas/${id}/aplicaciones`}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Ver todas
          </Link>
        </div>
        {recentApps.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Aún no hay aplicaciones. Publica una versión y crea una aplicación
            para comenzar.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {recentApps.map((app) => (
              <li
                key={app.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-900">
                    {applicationState(app, now)}
                  </span>
                  <span className="text-slate-500">
                    Año {app.year} · {app.progress ?? 0}% avance
                  </span>
                </div>
                <Link
                  href={`/encuestas/aplicaciones/${app.id}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CopySurveyDialog
        open={showCopy}
        sourceTitle={summary.title}
        copying={busy}
        onClose={() => {
          setShowCopy(false);
          setCopyError(null);
        }}
        onCopy={handleCopy}
      />

      <Modal
        open={gateModal !== null}
        title="Nueva versión"
        onClose={() => setGateModal(null)}
      >
        <p className="pb-4 text-sm text-slate-600">{gateModal}</p>
      </Modal>
    </div>
  );
}
