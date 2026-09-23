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
  });

  const autosaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
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

      setState((s) => ({
        ...s,
        applicationId,
        sections,
        answers,
        loading: false,
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
        const { error } = await supabase.rpc("submit_survey_response", {
          p_token: token,
          p_application_id: state.applicationId,
          p_question_id: questionId,
          p_answer: answer === null || answer === undefined ? null : answer,
        });

        if (error) throw error;

        setState((s) => ({
          ...s,
          answers: { ...s.answers, [questionId]: answer },
          saving: false,
        }));
      } catch {
        setState((s) => ({ ...s, saving: false }));
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
      }));

      const timer = setTimeout(() => {
        saveAnswer(questionId, answer);
        autosaveTimers.current.delete(questionId);
      }, 800);

      autosaveTimers.current.set(questionId, timer);
    },
    [saveAnswer]
  );

  const completeSurvey = useCallback(async () => {
    if (!state.applicationId || !token) return;
    setState((s) => ({ ...s, saving: true }));

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("complete_survey_application", {
        p_token: token,
        p_application_id: state.applicationId,
      });

      if (error) throw error;

      setState((s) => ({ ...s, saving: false, completed: true }));
    } catch {
      setState((s) => ({ ...s, saving: false }));
    }
  }, [state.applicationId, token]);

  const goToSection = useCallback((index: number) => {
    setState((s) => ({
      ...s,
      currentSectionIndex: Math.max(
        0,
        Math.min(index, s.sections.length - 1)
      ),
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
      return val !== null && val !== undefined && val !== "";
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
    completeSurvey,
    goToSection,
    getProgress,
    hasRequiredQuestions,
    areRequiredAnswered,
  };
}
