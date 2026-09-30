"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSurveyBuilder, useEncuestas } from "@/hooks/useEncuestas";
import { logClientError, toUserMessage } from "@/lib/errors";
import { SectionEditor } from "./SectionEditor";
import { PublishVersionDialog } from "@/components/encuestas/versiones/PublishVersionDialog";

interface Props {
  surveyId: string;
  versionId?: string;
}

export function ConstructorContent({ surveyId, versionId }: Props) {
  const router = useRouter();
  const {
    survey,
    sections,
    loading,
    saving,
    saveStatus,
    error,
    addSection,
    updateSection,
    deleteSection,
    duplicateSection,
    reorderSections,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    duplicateQuestion,
    reorderQuestions,
    addOption,
    updateOption,
    deleteOption,
    reorderOptions,
    flushWrites,
    setError,
  } = useSurveyBuilder(surveyId, versionId);

  const { publishVersion, createNewVersion, getSurveyVersions } =
    useEncuestas();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [localTitle, setLocalTitle] = useState<string | null>(null);
  const [localDesc, setLocalDesc] = useState<string | null>(null);
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [inUse, setInUse] = useState(false);
  const [hasPublished, setHasPublished] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);

  useEffect(() => {
    if (!survey) return;
    const currentVersionId = survey.version_id;
    let cancelled = false;
    async function load() {
      try {
        const versions = await getSurveyVersions(surveyId);
        const current = versions.find((v) => v.id === currentVersionId);
        if (!cancelled) {
          setInUse(current?.in_use === true);
          setHasPublished(versions.some((v) => v.status === "published"));
        }
      } catch {
        if (!cancelled) setInUse(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [survey, surveyId, getSurveyVersions]);

  const handleStartEditTitle = () => {
    setTitleValue(survey?.title || "");
    setEditingTitle(true);
  };

  const handleStartEditDesc = () => {
    setDescValue(survey?.description || "");
    setEditingDesc(true);
  };

  const handleSaveTitle = async () => {
    if (!titleValue.trim() || !survey) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error: updErr } = await supabase
      .from("encuestas")
      .update({ title: titleValue.trim() })
      .eq("id", survey.id);
    if (updErr) {
      logClientError("ConstructorContent.saveTitle", updErr);
      setError("No se pudo guardar el título. Revisa tu conexión e intenta de nuevo.");
      return;
    }
    setLocalTitle(titleValue.trim());
    setEditingTitle(false);
  };

  const handleSaveDesc = async () => {
    if (!survey) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error: updErr } = await supabase
      .from("encuestas")
      .update({ description: descValue.trim() || null })
      .eq("id", survey.id);
    if (updErr) {
      logClientError("ConstructorContent.saveDesc", updErr);
      setError("No se pudo guardar la descripción. Revisa tu conexión e intenta de nuevo.");
      return;
    }
    setLocalDesc(descValue.trim() || null);
    setEditingDesc(false);
  };

  const handlePublish = async () => {
    if (!survey?.version_id) return;
    setPublishing(true);
    setError(null);
    try {
      const flushed = await flushWrites();
      if (!flushed) {
        setPublishing(false);
        return;
      }
      await publishVersion(survey.version_id);
      router.push(`/encuestas/${surveyId}/versiones`);
    } catch (err) {
      logClientError("ConstructorContent.publish", err);
      setError(toUserMessage(err, "Error al publicar versión"));
      setPublishing(false);
      setShowPublishDialog(false);
    }
  };

  const handleCreateNewVersion = async () => {
    setCreatingVersion(true);
    setError(null);
    try {
      await createNewVersion(surveyId);
      router.push(`/encuestas/${surveyId}/constructor`);
    } catch (err) {
      logClientError("ConstructorContent.newVersion", err);
      setError(toUserMessage(err, "Error al crear nueva versión"));
    }
    setCreatingVersion(false);
  };

  const handleSectionDragStart = (sectionId: string) => {
    setDraggedSection(sectionId);
  };

  const handleSectionDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSectionDrop = (targetId: string) => {
    if (!draggedSection || draggedSection === targetId) return;
    const ids = sections.map((s) => s.id);
    const fromIdx = ids.indexOf(draggedSection);
    const toIdx = ids.indexOf(targetId);
    const newIds = [...ids];
    newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, draggedSection);
    reorderSections(newIds);
    setDraggedSection(null);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Cargando encuesta...</p>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="text-center py-12">
        <p className="text-rose-600 mb-4">{error}</p>
        <Link
          href="/encuestas"
          className="text-indigo-600 hover:text-indigo-500 text-sm"
        >
          Volver a encuestas
        </Link>
      </div>
    );
  }

  if (!survey) return null;

  const isDraft = survey.status === "draft";
  const readOnly = !isDraft;
  const canEditMeta = isDraft && !hasPublished;
  const totalQuestions = sections.reduce(
    (acc, s) => acc + s.questions.length,
    0
  );

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/encuestas"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Volver a encuestas
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          {editingTitle && canEditMeta ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="text-2xl font-bold text-slate-900 border-0 border-b-2 border-indigo-500 focus:ring-0 focus:outline-none bg-transparent p-0"
                autoFocus
              />
              <button
                onClick={handleSaveTitle}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Guardar
              </button>
              <button
                onClick={() => setEditingTitle(false)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <h1
              onClick={() => canEditMeta && handleStartEditTitle()}
              className={`text-2xl font-bold text-slate-900 ${
                canEditMeta
                  ? "cursor-pointer hover:text-indigo-600"
                  : "cursor-default"
              }`}
              title={canEditMeta ? "Clic para editar título" : undefined}
            >
              {localTitle ?? survey.title}
            </h1>
          )}
          {editingDesc && canEditMeta ? (
            <div className="mt-1 flex items-center space-x-2">
              <input
                type="text"
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveDesc();
                  if (e.key === "Escape") setEditingDesc(false);
                }}
                placeholder="Descripción de la encuesta"
                className="flex-1 text-sm border-0 border-b-2 border-indigo-500 focus:ring-0 focus:outline-none bg-transparent p-0"
                autoFocus
              />
              <button
                onClick={handleSaveDesc}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Guardar
              </button>
              <button
                onClick={() => setEditingDesc(false)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
            </div>
          ) : (localDesc ?? survey.description) ? (
            <p
              onClick={() => canEditMeta && handleStartEditDesc()}
              className={`mt-1 text-sm text-slate-500 ${
                canEditMeta ? "cursor-pointer hover:text-indigo-600" : ""
              }`}
              title={
                canEditMeta ? "Clic para editar descripción" : undefined
              }
            >
              {localDesc ?? survey.description}
            </p>
          ) : canEditMeta ? (
            <p
              onClick={handleStartEditDesc}
              className="mt-1 text-sm text-slate-400 cursor-pointer hover:text-indigo-600"
            >
              + Agregar descripción
            </p>
          ) : null}
          <div className="mt-2 flex items-center space-x-4 text-xs text-slate-400">
            <span>
              Versión {survey.version_number} (
              {survey.status === "draft" ? "Borrador" : "Publicada"})
            </span>
            {isDraft && hasPublished && (
              <span className="text-slate-400">
                Título y descripción congelados por la versión publicada
              </span>
            )}
            <span>
              {sections.length}{" "}
              {sections.length === 1 ? "sección" : "secciones"}
            </span>
            <span>
              {totalQuestions}{" "}
              {totalQuestions === 1 ? "pregunta" : "preguntas"}
            </span>
            {isDraft && (
              <span>
                {saving || saveStatus === "saving" ? (
                  <span className="text-indigo-500 animate-pulse">
                    Guardando...
                  </span>
                ) : saveStatus === "error" ? (
                  <span className="text-rose-600 font-medium">
                    Error al guardar
                  </span>
                ) : saveStatus === "saved" ? (
                  <span className="text-emerald-600">Autoguardado ✓</span>
                ) : null}
              </span>
            )}
          </div>
        </div>

        <div className="ml-4 flex items-center space-x-2">
          <Link
            href={`/encuestas/${surveyId}/preview?version=${survey.version_id}`}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Vista previa
          </Link>
          <Link
            href={`/encuestas/${surveyId}/versiones`}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Versiones
          </Link>
          <Link
            href={`/encuestas/${surveyId}/aplicaciones`}
            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Aplicaciones
          </Link>
          {isDraft && (
            <button
              onClick={() => setShowPublishDialog(true)}
              disabled={publishing || totalQuestions === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 border border-transparent rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                totalQuestions === 0
                  ? "Debe tener al menos una pregunta para publicar"
                  : ""
              }
            >
              Publicar
            </button>
          )}
        </div>
      </div>

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

      {readOnly && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span>
            {inUse
              ? "Esta versión ya fue utilizada y es inmutable."
              : "Esta versión está publicada y es inmutable. Para cambiar algo, crea una nueva versión: copia el contenido y trabaja sobre ella."}
          </span>
          <button
            onClick={handleCreateNewVersion}
            disabled={creatingVersion}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {creatingVersion ? "Creando..." : "Crear nueva versión"}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {sections.map((section, idx) => (
          <div
            key={section.id}
            draggable={isDraft}
            onDragStart={() => handleSectionDragStart(section.id)}
            onDragOver={handleSectionDragOver}
            onDrop={() => handleSectionDrop(section.id)}
            className={draggedSection === section.id ? "opacity-50" : ""}
          >
            <SectionEditor
              section={section}
              readOnly={readOnly}
              onUpdate={updateSection}
              onDelete={deleteSection}
              onDuplicate={duplicateSection}
              onAddQuestion={addQuestion}
              onUpdateQuestion={updateQuestion}
              onDeleteQuestion={deleteQuestion}
              onDuplicateQuestion={duplicateQuestion}
              onReorderQuestions={reorderQuestions}
              onAddOption={addOption}
              onUpdateOption={updateOption}
              onDeleteOption={deleteOption}
              onReorderOptions={reorderOptions}
              onMoveUp={() => {
                if (idx === 0) return;
                const ids = sections.map((s) => s.id);
                const newIds = [...ids];
                [newIds[idx - 1], newIds[idx]] = [
                  newIds[idx],
                  newIds[idx - 1],
                ];
                reorderSections(newIds);
              }}
              onMoveDown={() => {
                if (idx === sections.length - 1) return;
                const ids = sections.map((s) => s.id);
                const newIds = [...ids];
                [newIds[idx], newIds[idx + 1]] = [
                  newIds[idx + 1],
                  newIds[idx],
                ];
                reorderSections(newIds);
              }}
              isFirst={idx === 0}
              isLast={idx === sections.length - 1}
            />
          </div>
        ))}
      </div>

      {isDraft && (
        <div className="mt-6">
          <button
            onClick={addSection}
            disabled={saving}
            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
          >
            + Agregar sección
          </button>
        </div>
      )}

      <PublishVersionDialog
        open={showPublishDialog}
        sections={sections}
        publishing={publishing}
        onClose={() => setShowPublishDialog(false)}
        onConfirm={handlePublish}
      />
    </div>
  );
}
