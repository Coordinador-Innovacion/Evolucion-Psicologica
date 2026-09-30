"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { SurveySectionData } from "@/types/encuestas";

interface SurveyResponseState {
  applicationId: string | null;
  sections: SurveySectionData[];
  answers: Record<string, unknown>;
  currentSectionIndex: number;
  loading: boolean;
  saving: boolean;
  completed: boolean;
  error: string | null;
  savedAt: number | null;
  saveError: string | null;
  pending: number;
  windowClosed: boolean;
  institutionName: string | null;
}

export function useSurveyResponse(token: string | null) {
  const [state, setState] = useState<SurveyResponseState>({
    applicationId: null,
    sections: [],
    answers: {},
    currentSectionIndex: 0,
    loading: true,
    saving: false,
    completed: false,
    error: null,
    savedAt: null,
    saveError: null,
    pending: 0,
    windowClosed: false,
    institutionName: null,
  });

  const autosaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const pendingRef = useRef<Map<string, unknown>>(new Map());
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    cancelledRef.current = false;

    async function load() {
      const supabase = createClient();

      const { data: structure, error: rpcError } = await supabase.rpc(
        "get_survey_structure",
        { p_token: token }
      );

      if (cancelledRef.current) return;

      if (rpcError) {
        logClientError("useSurveyResponse.load", rpcError);
        setState((s) => ({
          ...s,
          loading: false,
          error: toUserMessage(rpcError, "No se pudo cargar la encuesta"),
        }));
        return;
      }

      if (!structure?.success) {
        setState((s) => ({
          ...s,
          loading: false,
          error: structure?.error || "No se pudo cargar la encuesta",
        }));
        return;
      }

      const applicationId: string = structure.application_id;

      const rawSections = structure.sections || [];
      const sections: SurveySectionData[] = rawSections.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          sort_order: s.sort_order,
          questions: (s.questions || [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((q: any) => ({
              id: q.id,
              section_id: s.id,
              question_type: q.question_type,
              label: q.label,
              description: q.description,
              is_required: q.is_required,
              sort_order: q.sort_order,
              config: q.config || {},
              presentation: q.presentation || {},
              options: (q.options || [])
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((o: any) => ({
                  id: o.id,
                  label: o.label,
                  sort_order: o.sort_order,
                })),
            })),
        })
      );

      const { data: existingAnswers } = await supabase.rpc(
        "get_application_responses",
        { p_token: token, p_application_id: applicationId }
      );

      if (cancelledRef.current) return;

      const answers: Record<string, unknown> = {};
      const responseData = existingAnswers?.success
        ? existingAnswers.data
        : existingAnswers;
      if (Array.isArray(responseData)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseData.forEach((r: any) => {
          if (r.question_id) {
            answers[r.question_id] = r.answer;
          }
        });
      }

      // RESP-06: reanudar donde quedó — primera sección con obligatorias
      // pendientes; si todas están respondidas, la última sección con
      // respuestas; si no hay ninguna, la primera.
      let resumeIndex = 0;
      const hasAnyAnswer = Object.keys(answers).length > 0;
      let target: number | null = null;
      for (let i = 0; i < sections.length; i += 1) {
        const missingRequired = sections[i].questions.some((q) => {
          if (!q.is_required) return false;
          const val = answers[q.id];
          if (val === null || val === undefined) return true;
          if (typeof val === "string") return val.trim() === "";
          if (Array.isArray(val)) return val.length === 0;
          return false;
        });
        if (missingRequired) {
          target = i;
          break;
        }
      }
      if (target === null && hasAnyAnswer) {
        for (let i = sections.length - 1; i >= 0; i -= 1) {
          const answeredInSection = sections[i].questions.some((q) => {
            const val = answers[q.id];
            if (val === null || val === undefined || val === "") return false;
            if (Array.isArray(val)) return val.length > 0;
            return true;
          });
          if (answeredInSection) {
            target = i;
            break;
          }
        }
      }

      if (target !== null) resumeIndex = target;

      setState((s) => ({
        ...s,
        applicationId,
        sections,
        answers,
        loading: false,
        completed: structure.completed === true,
        institutionName: structure.institution_name ?? null,
        currentSectionIndex: resumeIndex,
      }));
    }

    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [token]);

  const saveAnswer = useCallback(
    async (questionId: string, answer: unknown) => {
      if (!state.applicationId || !token) return;
      setState((s) => ({ ...s, saving: true }));

      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("submit_survey_response", {
          p_token: token,
          p_application_id: state.applicationId,
          p_question_id: questionId,
          p_answer: answer === null || answer === undefined ? null : answer,
        });

        if (error) throw error;
        if (!data?.success) {
          const err = new Error(
            data?.error || "No se pudo guardar la respuesta"
          );
          (err as Error & { code?: string }).code = data?.code;
          throw err;
        }

        pendingRef.current.delete(questionId);
        setState((s) => ({
          ...s,
          answers: { ...s.answers, [questionId]: answer },
          saving: false,
          savedAt: Date.now(),
          saveError: null,
          pending: pendingRef.current.size,
        }));
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        pendingRef.current.set(questionId, answer);
        setState((s) => ({
          ...s,
          saving: false,
          pending: pendingRef.current.size,
          saveError:
            code === "window_closed"
              ? "El plazo terminó; tu avance quedó guardado."
              : typeof navigator !== "undefined" && !navigator.onLine
                ? "Sin conexión. Tus respuestas se guardarán al reconectar."
                : "No pudimos guardar la última respuesta. Reintentando...",
          windowClosed: code === "window_closed" ? true : s.windowClosed,
        }));
      }
    },
    [state.applicationId, token]
  );

  const autosave = useCallback(
    (questionId: string, answer: unknown) => {
      const existing = autosaveTimers.current.get(questionId);
      if (existing) clearTimeout(existing);

      setState((s) => ({
        ...s,
        answers: { ...s.answers, [questionId]: answer },
        saveError: null,
      }));

      const timer = setTimeout(() => {
        saveAnswer(questionId, answer);
        autosaveTimers.current.delete(questionId);
      }, 800);

      autosaveTimers.current.set(questionId, timer);
    },
    [saveAnswer]
  );

  // RESP-04: vaciar temporizadores y pendientes antes de cambiar de sección
  const flushPending = useCallback(async () => {
    const timers = [...autosaveTimers.current.entries()];
    autosaveTimers.current.clear();
    for (const [questionId, timer] of timers) {
      clearTimeout(timer);
      const answer = state.answers[questionId];
      if (answer !== undefined) {
        await saveAnswer(questionId, answer);
      }
    }
    const pending = [...pendingRef.current.entries()];
    for (const [questionId, answer] of pending) {
      await saveAnswer(questionId, answer);
    }
  }, [saveAnswer, state.answers]);

  const retryPending = useCallback(async () => {
    const pending = [...pendingRef.current.entries()];
    if (pending.length === 0) return;
    setState((s) => ({ ...s, saveError: null }));
    for (const [questionId, answer] of pending) {
      await saveAnswer(questionId, answer);
    }
  }, [saveAnswer]);

  useEffect(() => {
    function handleOnline() {
      void retryPending();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [retryPending]);

  // D1: avisar si hay respuestas sin guardar al cerrar la pestaña
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingRef.current.size > 0 || autosaveTimers.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const completeSurvey = useCallback(async (): Promise<string | null> => {
    if (!state.applicationId || !token) return "No se pudo finalizar la encuesta";
    setState((s) => ({ ...s, saving: true }));

    try {
      await flushPending();
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "complete_survey_application",
        {
          p_token: token,
          p_application_id: state.applicationId,
        }
      );

      if (error) throw error;
      if (!data?.success) {
        const err = new Error(data?.error || "No se pudo finalizar");
        (err as Error & { code?: string }).code = data?.code;
        throw err;
      }

      setState((s) => ({ ...s, saving: false, completed: true }));
      return null;
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      const message =
        code === "window_closed"
          ? "El plazo terminó; tu avance quedó guardado."
          : (err as Error).message || "No se pudo finalizar la encuesta";
      setState((s) => ({
        ...s,
        saving: false,
        saveError: message,
        windowClosed: code === "window_closed" ? true : s.windowClosed,
      }));
      return message;
    }
  }, [state.applicationId, token, flushPending]);

  const goToSection = useCallback((index: number) => {
    setState((s) => ({
      ...s,
      currentSectionIndex: Math.max(
        0,
        Math.min(index, s.sections.length - 1)
      ),
      saveError: null,
    }));
  }, []);

  const getProgress = useCallback(() => {
    const total = state.sections.reduce(
      (acc, s) => acc + s.questions.length,
      0
    );
    if (total === 0) return 0;
    const answered = Object.keys(state.answers).filter((qId) => {
      const val = state.answers[qId];
      if (val === null || val === undefined || val === "") return false;
      if (Array.isArray(val)) return val.length > 0;
      return true;
    }).length;
    return Math.round((answered * 100) / total);
  }, [state.sections, state.answers]);

  const hasRequiredQuestions = useCallback(() => {
    return state.sections.some((s) => s.questions.some((q) => q.is_required));
  }, [state.sections]);

  const areRequiredAnswered = useCallback(() => {
    return state.sections.every((s) =>
      s.questions
        .filter((q) => q.is_required)
        .every((q) => {
          const val = state.answers[q.id];
          if (val === null || val === undefined) return false;
          if (typeof val === "string") return val.trim() !== "";
          if (Array.isArray(val)) return val.length > 0;
          return true;
        })
    );
  }, [state.sections, state.answers]);

  return {
    ...state,
    saveAnswer,
    autosave,
    flushPending,
    retryPending,
    completeSurvey,
    goToSection,
    getProgress,
    hasRequiredQuestions,
    areRequiredAnswered,
  };
}
