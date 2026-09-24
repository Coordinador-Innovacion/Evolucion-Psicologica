"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSurveyBuilder, useEncuestas } from "@/hooks/useEncuestas";
import { logClientError, toUserMessage } from "@/lib/errors";
import { SectionEditor } from "./SectionEditor";

interface Props {
  surveyId: string;
}

export function ConstructorContent({ surveyId }: Props) {
  const router = useRouter();
  const {
    survey,
    sections,
    loading,
    saving,
    error,
    addSection,
    updateSection,
    deleteSection,
    reorderSections,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    addOption,
    updateOption,
    deleteOption,
    reorderOptions,
    setError,
  } = useSurveyBuilder(surveyId);

  const { publishVersion } = useEncuestas();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const handleStartEditTitle = () => {
    setTitleValue(survey?.title || "");
    setEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!titleValue.trim() || !survey) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase
      .from("encuestas")
      .update({ title: titleValue.trim() })
      .eq("id", survey.id);
    setEditingTitle(false);
  };

  const handlePublish = async () => {
    if (!survey?.version_id) return;
    if (
      !confirm(
        "¿Publicar esta versión? Una vez publicada, no podrá ser modificada."
      )
    ) {
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      await publishVersion(survey.version_id);
      router.push(`/encuestas/${surveyId}/versiones`);
    } catch (err) {
      logClientError("ConstructorContent.publish", err);
      setError(toUserMessage(err, "Error al publicar versión"));
    }
    setPublishing(false);
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
          {editingTitle ? (
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
              onClick={handleStartEditTitle}
              className="text-2xl font-bold text-slate-900 cursor-pointer hover:text-indigo-600"
              title="Clic para editar título"
            >
              {survey.title}
            </h1>
          )}
          {survey.description && (
            <p className="mt-1 text-sm text-slate-500">{survey.description}</p>
          )}
          <div className="mt-2 flex items-center space-x-4 text-xs text-slate-400">
            <span>
              Versión {survey.version_number} ({survey.status})
            </span>
            <span>
              {sections.length}{" "}
              {sections.length === 1 ? "sección" : "secciones"}
            </span>
            <span>
              {totalQuestions}{" "}
              {totalQuestions === 1 ? "pregunta" : "preguntas"}
            </span>
            {saving && (
              <span className="text-indigo-500 animate-pulse">
                Guardando...
              </span>
            )}
          </div>
        </div>

        <div className="ml-4 flex items-center space-x-2">
          <Link
            href={`/encuestas/${surveyId}/preview`}
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
          {survey.status === "draft" && (
            <button
              onClick={handlePublish}
              disabled={publishing || totalQuestions === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 border border-transparent rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                totalQuestions === 0
                  ? "Debe tener al menos una pregunta para publicar"
                  : ""
              }
            >
              {publishing ? "Publicando..." : "Publicar"}
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

      {survey.status === "published" && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-700">
          Esta versión está publicada y es inmutable. Para realizar cambios,
          cree una nueva versión desde la gestión de versiones.
        </div>
      )}

      <div className="space-y-4">
        {sections.map((section, idx) => (
          <div
            key={section.id}
            draggable={survey.status === "draft"}
            onDragStart={() => handleSectionDragStart(section.id)}
            onDragOver={(e) => handleSectionDragOver(e)}
            onDrop={() => handleSectionDrop(section.id)}
            className={draggedSection === section.id ? "opacity-50" : ""}
          >
            <SectionEditor
              section={section}
              onUpdate={updateSection}
              onDelete={deleteSection}
              onAddQuestion={addQuestion}
              onUpdateQuestion={updateQuestion}
              onDeleteQuestion={deleteQuestion}
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

      {survey.status === "draft" && (
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
    </div>
  );
}
