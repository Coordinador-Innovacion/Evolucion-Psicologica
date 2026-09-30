"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSurveyResponse } from "@/hooks/useSurveyResponse";
import { QuestionRenderer } from "@/components/encuesta/QuestionRenderer";
import { Icon } from "@/components/ui/icons";
import { LoadingScreen } from "@/components/ui/feedback";

interface Props {
  token: string;
  respondentName: string;
  basePath?: string;
}

export function ResponseForm({
  token,
  respondentName,
  basePath = "/encuesta",
}: Props) {
  const {
    sections,
    answers,
    currentSectionIndex,
    loading,
    saving,
    completed,
    error,
    savedAt,
    saveError,
    pending,
    windowClosed,
    institutionName,
    autosave,
    flushPending,
    retryPending,
    completeSurvey,
    goToSection,
    getProgress,
    areRequiredAnswered,
  } = useSurveyResponse(token);

  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!savedAt) return;
    const raf = requestAnimationFrame(() => setJustSaved(true));
    const timer = setTimeout(() => setJustSaved(false), 2500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [savedAt]);

  if (loading) {
    return <LoadingScreen label="Cargando encuesta..." />;
  }

  if (completed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-card">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <Icon name="check" className="h-8 w-8" />
          </span>
          <h2 className="text-xl font-semibold text-slate-900">
            ¡Gracias por participar!
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Tu encuesta fue completada correctamente. Tus respuestas quedaron
            registradas{institutionName ? ` en ${institutionName}` : ""}.
          </p>
          <Link
            href={`${basePath}/${token}`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (error || windowClosed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">
            {windowClosed ? "El plazo terminó" : "No se pudo continuar"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {windowClosed
              ? "El plazo terminó; tu avance quedó guardado."
              : error}
          </p>
          <Link
            href={`${basePath}/${token}`}
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

  const missingInSection = currentSection.questions.filter((q) => {
    if (!q.is_required) return false;
    const val = answers[q.id];
    if (val === null || val === undefined) return true;
    if (typeof val === "string") return val.trim() === "";
    if (Array.isArray(val)) return val.length === 0;
    return false;
  }).length;

  const goToSectionSafe = async (index: number) => {
    setSectionError(null);
    await flushPending();
    goToSection(index);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const handleContinue = async () => {
    if (missingInSection > 0) {
      setSectionError(
        `Responde ${missingInSection} ${
          missingInSection === 1
            ? "pregunta obligatoria"
            : "preguntas obligatorias"
        } de esta sección para continuar.`
      );
      return;
    }
    await goToSectionSafe(currentSectionIndex + 1);
  };

  const handleComplete = async () => {
    setCompleting(true);
    setCompleteError(null);
    const errMsg = await completeSurvey();
    setCompleting(false);
    if (errMsg) {
      setCompleteError(errMsg);
      return;
    }
    setShowConfirmComplete(false);
  };

  return (
    <div className="min-h-screen bg-canvas pb-28">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`${basePath}/${token}`}
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
            {saving ? (
              <span className="hidden animate-pulse text-xs font-medium text-amber-600 sm:inline">
                Guardando...
              </span>
            ) : pending > 0 ? (
              <span className="hidden text-xs font-medium text-rose-600 sm:inline">
                {pending} sin guardar
              </span>
            ) : justSaved ? (
              <span className="hidden text-xs font-medium text-emerald-600 sm:inline">
                Guardado ✓
              </span>
            ) : null}
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
        {(saveError || windowClosed) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>
              {windowClosed
                ? "El plazo terminó; tu avance quedó guardado."
                : saveError}
            </span>
            {!windowClosed && pending > 0 && (
              <button
                type="button"
                onClick={() => void retryPending()}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                Reintentar
              </button>
            )}
          </div>
        )}

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
                onChange={(val) => {
                  setSectionError(null);
                  autosave(question.id, val);
                }}
              />
            </div>
          ))}
        </div>

        {sectionError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {sectionError}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => void goToSectionSafe(currentSectionIndex - 1)}
            disabled={isFirstSection}
            className="rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            {sections.map((_, idx) => (
              <span
                key={idx}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  idx === currentSectionIndex
                    ? "bg-indigo-600"
                    : idx < currentSectionIndex
                      ? "bg-emerald-400"
                      : "bg-slate-300"
                }`}
              />
            ))}
          </div>

          {isLastSection ? (
            <button
              type="button"
              onClick={() => {
                setCompleteError(null);
                setShowConfirmComplete(true);
              }}
              disabled={windowClosed}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Finalizar encuesta
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={windowClosed}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              Continuar →
            </button>
          )}
        </div>
      </div>

      {showConfirmComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-pop">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">
              ¿Finalizar encuesta?
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              {areRequiredAnswered()
                ? "Todas las preguntas obligatorias están respondidas. Una vez finalizada, no podrá modificar sus respuestas."
                : "Hay preguntas obligatorias sin responder. Debe completarlas antes de finalizar."}
            </p>
            {completeError && (
              <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {completeError}
              </p>
            )}
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
