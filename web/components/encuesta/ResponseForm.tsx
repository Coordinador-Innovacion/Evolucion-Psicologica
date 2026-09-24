"use client";

import { useState } from "react";
import Link from "next/link";
import { useSurveyResponse } from "@/hooks/useSurveyResponse";
import { QuestionRenderer } from "@/components/encuesta/QuestionRenderer";
import { Icon } from "@/components/ui/icons";
import { LoadingScreen } from "@/components/ui/feedback";

interface Props {
  token: string;
  respondentName: string;
}

export function ResponseForm({
  token,
  respondentName,
}: Props) {
  const {
    sections,
    answers,
    currentSectionIndex,
    loading,
    saving,
    completed,
    error,
    autosave,
    completeSurvey,
    goToSection,
    getProgress,
    areRequiredAnswered,
  } = useSurveyResponse(token);

  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const [completing, setCompleting] = useState(false);

  if (loading) {
    return <LoadingScreen label="Cargando encuesta..." />;
  }

  if (error || completed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">
            {completed ? "Encuesta completada" : "Error"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {error || "Ya completaste esta encuesta."}
          </p>
          <Link
            href={`/encuesta/${token}`}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">
            Sin secciones
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Esta encuesta no tiene secciones configuradas.
          </p>
        </div>
      </div>
    );
  }

  const currentSection = sections[currentSectionIndex];
  const progress = getProgress();
  const isLastSection = currentSectionIndex === sections.length - 1;
  const isFirstSection = currentSectionIndex === 0;

  const handleComplete = async () => {
    setCompleting(true);
    await completeSurvey();
    setCompleting(false);
    setShowConfirmComplete(false);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/encuesta/${token}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-950/20"
              title="Volver al inicio de la encuesta"
            >
              <Icon name="pulse" className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                Sección {currentSectionIndex + 1}/{sections.length}
              </p>
              <p className="truncate text-xs text-slate-500">
                {respondentName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {saving && (
              <span className="hidden animate-pulse text-xs font-medium text-amber-600 sm:inline">
                Guardando...
              </span>
            )}
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 sm:w-32">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-600">
              {progress}%
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">
            {currentSection.title}
          </h2>
          {currentSection.description && (
            <p className="mt-1 text-sm text-slate-500">
              {currentSection.description}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {currentSection.questions.map((question) => (
            <div
              key={question.id}
              className="rounded-2xl border border-line bg-white p-6 shadow-card"
            >
              <QuestionRenderer
                question={question}
                value={answers[question.id] ?? null}
                onChange={(val) => autosave(question.id, val)}
              />
            </div>
          ))}
        </div>

        <div className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => goToSection(currentSectionIndex - 1)}
            disabled={isFirstSection}
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>

          <div className="flex space-x-3">
            {sections.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSection(idx)}
                className={`h-3 w-3 rounded-full transition-colors ${
                  idx === currentSectionIndex
                    ? "bg-indigo-600"
                    : idx < currentSectionIndex
                    ? "bg-emerald-400"
                    : "bg-slate-300"
                }`}
                title={`Sección ${idx + 1}`}
              />
            ))}
          </div>

          {isLastSection ? (
            <button
              type="button"
              onClick={() => setShowConfirmComplete(true)}
              disabled={!areRequiredAnswered()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Finalizar encuesta
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToSection(currentSectionIndex + 1)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Continuar →
            </button>
          )}
        </div>
      </main>

      {showConfirmComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-pop">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">
              ¿Finalizar encuesta?
            </h3>
            <p className="mb-6 text-sm text-slate-500">
              {areRequiredAnswered()
                ? "Todas las preguntas obligatorias están respondidas. Una vez finalizada, no podrá modificar sus respuestas."
                : "Hay preguntas obligatorias sin responder. Debe completarlas antes de finalizar."}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowConfirmComplete(false)}
                className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={!areRequiredAnswered() || completing}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {completing ? "Finalizando..." : "Sí, finalizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
