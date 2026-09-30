"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEncuestas } from "@/hooks/useEncuestas";
import { logClientError, toUserMessage } from "@/lib/errors";
import type {
  SurveyOptionData,
  SurveyQuestionData,
  SurveyQuestionType,
  SurveySectionData,
  SurveyVersionItem,
} from "@/types/encuestas";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { PublishVersionDialog } from "./PublishVersionDialog";
import type { Tables } from "@/types/supabase";

interface Props {
  surveyId: string;
  surveyTitle: string;
}

async function loadVersionSections(
  surveyId: string,
  versionId: string
): Promise<SurveySectionData[]> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const { data: sectionsRows } = await supabase
    .from("encuesta_secciones")
    .select("*")
    .eq("version_id", versionId)
    .order("sort_order", { ascending: true });

  const sectionIds = (sectionsRows || []).map((s) => s.id);
  let questionsRows: Tables<"encuesta_preguntas">[] = [];
  if (sectionIds.length > 0) {
    const { data: q } = await supabase
      .from("encuesta_preguntas")
      .select("*")
      .in("section_id", sectionIds)
      .order("sort_order", { ascending: true });
    questionsRows = q || [];
  }
  const questionIds = questionsRows.map((q) => q.id);
  let optionsRows: Tables<"encuesta_opciones">[] = [];
  if (questionIds.length > 0) {
    const { data: o } = await supabase
      .from("encuesta_opciones")
      .select("*")
      .in("question_id", questionIds)
      .order("sort_order", { ascending: true });
    optionsRows = o || [];
  }

  const optionsByQuestion = new Map<string, Tables<"encuesta_opciones">[]>();
  for (const opt of optionsRows) {
    const list = optionsByQuestion.get(opt.question_id) || [];
    list.push(opt);
    optionsByQuestion.set(opt.question_id, list);
  }
  const questionsBySection = new Map<string, Tables<"encuesta_preguntas">[]>();
  for (const q of questionsRows) {
    const list = questionsBySection.get(q.section_id) || [];
    list.push(q);
    questionsBySection.set(q.section_id, list);
  }

  return (sectionsRows || []).map((sec) => ({
    id: sec.id,
    title: sec.title,
    description: sec.description,
    sort_order: sec.sort_order,
    questions: (questionsBySection.get(sec.id) || []).map(
      (q): SurveyQuestionData => ({
        id: q.id,
        section_id: q.section_id,
        question_type: q.question_type as SurveyQuestionType,
        label: q.label,
        description: q.description,
        is_required: q.is_required,
        sort_order: q.sort_order,
        config: (q.config as Record<string, unknown>) || {},
        presentation: (q.presentation as Record<string, unknown>) || {},
        options: (optionsByQuestion.get(q.id) || []).map(
          (o): SurveyOptionData => ({
            id: o.id,
            question_id: o.question_id,
            label: o.label,
            sort_order: o.sort_order,
          })
        ),
      })
    ),
  }));
}

export function VersionManager({ surveyId, surveyTitle }: Props) {
  const router = useRouter();
  const { getSurveyVersions, publishVersion, createNewVersion } =
    useEncuestas();
  const [versions, setVersions] = useState<SurveyVersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [publishTarget, setPublishTarget] = useState<string | null>(null);
  const [publishSections, setPublishSections] = useState<SurveySectionData[]>(
    []
  );
  const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getSurveyVersions(surveyId);
        if (!cancelled) setVersions(data);
      } catch (err) {
        if (!cancelled) {
          logClientError("VersionManager.load", err);
          setError(toUserMessage(err, "Error al cargar versiones"));
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [surveyId, getSurveyVersions]);

  const handleOpenPublish = async (versionId: string) => {
    setError(null);
    try {
      const sections = await loadVersionSections(surveyId, versionId);
      setPublishSections(sections);
      setPublishTarget(versionId);
    } catch (err) {
      logClientError("VersionManager.publish.load", err);
      setError(toUserMessage(err, "Error al preparar la publicación"));
    }
  };

  const handlePublish = async () => {
    if (!publishTarget) return;
    setPublishing(true);
    setError(null);
    try {
      await publishVersion(publishTarget);
      const data = await getSurveyVersions(surveyId);
      setVersions(data);
      setPublishTarget(null);
    } catch (err) {
      logClientError("VersionManager.publish", err);
      setError(toUserMessage(err, "Error al publicar versión"));
    }
    setPublishing(false);
  };

  const handleCreateNewVersion = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await createNewVersion(surveyId);
      if (result.id) {
        router.push(`/encuestas/${surveyId}/versiones/${result.id}/editar`);
      }
    } catch (err) {
      logClientError("VersionManager.createNewVersion", err);
      setError(toUserMessage(err, "Error al crear nueva versión"));
    }
    setCreating(false);
    setShowNewVersionDialog(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Borrador
          </span>
        );
      case "published":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            Publicada
          </span>
        );
      case "closed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
            Cerrada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-500">
        Cargando versiones...
      </div>
    );
  }

  const hasDraft = versions.some((v) => v.status === "draft");
  const latestVersion = versions.length > 0 ? versions[0] : null;
  const canCreateVersion =
    !hasDraft && latestVersion !== null && latestVersion.status === "published";

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md text-sm text-rose-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-rose-500 hover:text-rose-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Versiones de &ldquo;{surveyTitle}&rdquo;
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {versions.length} {versions.length === 1 ? "versión" : "versiones"}{" "}
            registradas
          </p>
        </div>
        <div className="flex space-x-3">
          <Link
            href={`/encuestas/${surveyId}/aplicaciones`}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Aplicaciones
          </Link>
          {canCreateVersion && (
            <button
              onClick={() => setShowNewVersionDialog(true)}
              disabled={creating}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? "Creando..." : "Nueva versión"}
            </button>
          )}
          <Link
            href={
              latestVersion
                ? `/encuestas/${surveyId}/versiones/${latestVersion.id}/editar`
                : `/encuestas/${surveyId}/constructor`
            }
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Volver al constructor
          </Link>
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
          <p className="text-slate-500">No hay versiones registradas.</p>
          <Link
            href={`/encuestas/${surveyId}/constructor`}
            className="mt-2 text-indigo-600 hover:text-indigo-500 text-sm"
          >
            Ir al constructor para agregar contenido
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg divide-y">
          {versions.map((version) => (
            <div
              key={version.id}
              className="px-6 py-4 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-slate-900">
                    Versión {version.version_number}
                  </span>
                  {getStatusBadge(version.status)}
                  {version.in_use && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      🔒 en uso
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center space-x-4 text-xs text-slate-400">
                  <span>
                    Creada:{" "}
                    {new Date(version.created_at).toLocaleDateString("es-PE")}
                  </span>
                  {version.published_at && (
                    <span>
                      Publicada:{" "}
                      {new Date(version.published_at).toLocaleDateString(
                        "es-PE"
                      )}
                    </span>
                  )}
                  <span>
                    {version.application_count}{" "}
                    {version.application_count === 1
                      ? "aplicación"
                      : "aplicaciones"}
                  </span>
                  <span>
                    {version.response_count}{" "}
                    {version.response_count === 1 ? "respuesta" : "respuestas"}
                  </span>
                </div>
              </div>

              <div className="ml-4 flex items-center space-x-2">
                {version.status === "draft" && (
                  <>
                    <Link
                      href={`/encuestas/${surveyId}/versiones/${version.id}/editar`}
                      className="text-xs text-indigo-600 hover:text-indigo-500 px-3 py-1.5 rounded border border-indigo-200 hover:border-indigo-300"
                    >
                      Editar
                    </Link>
                    <Link
                      href={`/encuestas/${surveyId}/preview?version=${version.id}`}
                      className="text-xs text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded border border-slate-200 hover:border-slate-300"
                    >
                      Vista previa
                    </Link>
                    <button
                      onClick={() => handleOpenPublish(version.id)}
                      disabled={publishing}
                      className="text-xs text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded disabled:opacity-50"
                    >
                      Publicar
                    </button>
                  </>
                )}
                {version.status === "published" && (
                  <>
                    <Link
                      href={`/encuestas/${surveyId}/preview?version=${version.id}`}
                      className="text-xs text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded border border-slate-200 hover:border-slate-300"
                    >
                      Ver
                    </Link>
                    <Link
                      href={`/encuestas/${surveyId}/versiones/${version.id}/editar`}
                      className="text-xs text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded border border-slate-200 hover:border-slate-300"
                    >
                      Detalle
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasDraft && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            Existe una versión borrador activa. Edítela en el constructor y
            publíquela cuando esté lista.
          </p>
        </div>
      )}

      {!hasDraft &&
        latestVersion &&
        latestVersion.status === "published" && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-md">
            <p className="text-sm text-slate-600">
              La versión publicada es inmutable. Usa &ldquo;Nueva
              versión&rdquo; para crear una copia editable con el mismo
              contenido, o &ldquo;Copiar encuesta&rdquo; para una encuesta
              nueva e independiente.
            </p>
          </div>
        )}

      <PublishVersionDialog
        open={publishTarget !== null}
        sections={publishSections}
        publishing={publishing}
        onClose={() => setPublishTarget(null)}
        onConfirm={handlePublish}
      />

      <Modal
        open={showNewVersionDialog}
        onClose={() => setShowNewVersionDialog(false)}
        title="Nueva versión"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Se creará una nueva versión borrador con el mismo contenido de la
            versión vigente. Podrás editarla sin afectar las versiones
            publicadas.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowNewVersionDialog(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateNewVersion} disabled={creating}>
              {creating ? "Creando..." : "Crear nueva versión"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
