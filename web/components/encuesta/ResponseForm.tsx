"use client";

import { useState } from "react";
import Link from "next/link";
import { useSurveyResponse } from "@/hooks/useSurveyResponse";
import { QuestionRenderer } from "@/components/encuesta/QuestionRenderer";

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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Cargando encuesta...</p>
      </div>
    );
  }

  if (error || completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {completed ? "Encuesta completada" : "Error"}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {error || "Ya completaste esta encuesta."}
            </p>
            <Link
              href={`/encuesta/${token}`}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Sin secciones
            </h2>
            <p className="text-sm text-gray-500">
              Esta encuesta no tiene secciones configuradas.
            </p>
          </div>
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center space-x-4">
              <Link
                href={`/encuesta/${token}`}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Encuesta
              </Link>
              <span className="text-sm text-gray-300">|</span>
              <span className="text-sm font-medium text-gray-900 truncate max-w-xs">
                Sección {currentSectionIndex + 1}/{sections.length}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-xs text-gray-400 hidden sm:inline">
                {respondentName}
              </span>
              <div className="w-16 bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{progress}%</span>
              {saving && (
                <span className="text-xs text-amber-500 animate-pulse">
                  Guardando...
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {currentSection.title}
          </h2>
          {currentSection.description && (
            <p className="mt-1 text-sm text-gray-500">
              {currentSection.description}
            </p>
          )}
        </div>

        <div className="space-y-6">
          {currentSection.questions.map((question) => (
            <div
              key={question.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <QuestionRenderer
                question={question}
                value={answers[question.id] ?? null}
                onChange={(val) => autosave(question.id, val)}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mt-8 mb-12">
          <button
            type="button"
            onClick={() => goToSection(currentSectionIndex - 1)}
            disabled={isFirstSection}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>

          <div className="flex space-x-3">
            {sections.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSection(idx)}
                className={`w-3 h-3 rounded-full transition-colors ${
                  idx === currentSectionIndex
                    ? "bg-blue-600"
                    : idx < currentSectionIndex
                    ? "bg-green-400"
                    : "bg-gray-300"
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
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Finalizar encuesta
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToSection(currentSectionIndex + 1)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            >
              Continuar →
            </button>
          )}
        </div>
      </main>

      {showConfirmComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ¿Finalizar encuesta?
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {areRequiredAnswered()
                ? "Todas las preguntas obligatorias están respondidas. Una vez finalizada, no podrá modificar sus respuestas."
                : "Hay preguntas obligatorias sin responder. Debe completarlas antes de finalizar."}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowConfirmComplete(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={!areRequiredAnswered() || completing}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
