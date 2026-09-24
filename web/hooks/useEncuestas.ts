"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json, Tables, TablesUpdate } from "@/types/supabase";
import type {
  SurveyDetail,
  SurveyListItem,
  SurveySectionData,
  SurveyQuestionData,
  SurveyOptionData,
  SurveyQuestionType,
  SurveyVersionItem,
  SurveyApplicationItem,
} from "@/types/encuestas";
import { createDefaultConfig, createDefaultPresentation } from "@/types/encuestas";

type Question = Tables<"encuesta_preguntas">;
type Option = Tables<"encuesta_opciones">;

interface GlobalSurveyRow {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  institutions: { name: string } | null;
  encuesta_versiones: { status: string }[];
}

const tempId = () => `temp_${crypto.randomUUID()}`;

export function useEncuestas() {
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setSurveys([]); setLoading(false); }
        return;
      }
      const { data: profile } = await supabase
        .from("perfiles")
        .select("institution_id, role")
        .eq("user_id", user.id)
        .single();
      if (profile?.institution_id) {
        const { data, error } = await supabase.rpc("get_institution_surveys", {
          p_institution_id: profile.institution_id,
        });
        if (!cancelled) {
          if (error || !data?.success) {
            setSurveys([]);
          } else {
            setSurveys(data.data || []);
          }
          setLoading(false);
        }
        return;
      }
      if (profile?.role === "global") {
        const { data, error } = await supabase
          .from("encuestas")
          .select(
            "id, title, description, created_at, institutions(name), encuesta_versiones(status)"
          )
          .order("created_at", { ascending: false });
        if (!cancelled) {
          if (error) {
            setSurveys([]);
          } else {
            setSurveys(
              ((data ?? []) as unknown as GlobalSurveyRow[]).map((s) => ({
                id: s.id,
                title: s.title,
                description: s.description,
                created_at: s.created_at,
                version_count: s.encuesta_versiones?.length ?? 0,
                published_versions: (s.encuesta_versiones ?? []).filter(
                  (v) => v.status === "published"
                ).length,
                institution_name: s.institutions?.name ?? null,
              }))
            );
          }
          setLoading(false);
        }
        return;
      }
      if (!cancelled) { setSurveys([]); setLoading(false); }
      return;
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const createSurvey = useCallback(
    async (
      title: string,
      description: string | null,
      institutionId?: string
    ) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      const { data: profile } = await supabase
        .from("perfiles")
        .select("institution_id, role")
        .eq("user_id", user.id)
        .single();
      const targetInstitution = institutionId ?? profile?.institution_id ?? undefined;
      if (!targetInstitution) {
        throw new Error(
          profile?.role === "global"
            ? "Seleccione una institución"
            : "Sin institución"
        );
      }
      const { data, error } = await supabase.rpc("create_survey", {
        p_institution_id: targetInstitution,
        p_title: title,
        p_description: description || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Error al crear encuesta");
      return data.id as string;
    },
    []
  );

  const copySurvey = useCallback(
    async (sourceId: string, newTitle: string) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("copy_survey", {
        p_source_survey_id: sourceId,
        p_new_title: newTitle,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Error al copiar encuesta");
      return data.id as string;
    },
    []
  );

  const getSurveyVersions = useCallback(
    async (surveyId: string): Promise<SurveyVersionItem[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_survey_versions", {
        p_survey_id: surveyId,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Error al obtener versiones");
      return data.data || [];
    },
    []
  );

  const publishVersion = useCallback(
    async (versionId: string) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("publish_survey_version", {
        p_version_id: versionId,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Error al publicar versión");
      return data;
    },
    []
  );

  const createNewVersion = useCallback(
    async (surveyId: string) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_survey_version", {
        p_survey_id: surveyId,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Error al crear nueva versión");
      return data as { success: boolean; id: string; version_number: number };
    },
    []
  );

  const getApplicationsByVersion = useCallback(
    async (versionId: string): Promise<SurveyApplicationItem[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("encuesta_aplicaciones")
        .select("*")
        .eq("version_id", versionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    []
  );

  const getApplicationsBySurvey = useCallback(
    async (surveyId: string): Promise<SurveyApplicationItem[]> => {
      const supabase = createClient();
      const { data: versions } = await supabase
        .from("encuesta_versiones")
        .select("id")
        .eq("survey_id", surveyId);
      if (!versions || versions.length === 0) return [];
      const versionIds = versions.map((v) => v.id);
      const { data, error } = await supabase
        .from("encuesta_aplicaciones")
        .select("*")
        .in("version_id", versionIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    []
  );

  const createApplication = useCallback(
    async (params: {
      version_id: string;
      respondent_student_id?: string | null;
      respondent_user_id?: string | null;
      year: number;
      section_name?: string | null;
      grade_id?: string | null;
      started_at: string;
      ends_at: string;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_survey_application", {
        p_version_id: params.version_id,
        p_respondent_student_id: params.respondent_student_id || null,
        p_respondent_user_id: params.respondent_user_id || null,
        p_year: params.year,
        p_section_name: params.section_name || null,
        p_grade_id: params.grade_id || null,
        p_started_at: params.started_at,
        p_ends_at: params.ends_at,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Error al crear aplicación");
      return data as { success: boolean; id: string; token: string };
    },
    []
  );

  const extendApplication = useCallback(
    async (applicationId: string, newEndsAt: string) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("extend_survey_application", {
        p_application_id: applicationId,
        p_new_ends_at: newEndsAt,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Error al ampliar plazo");
      return data;
    },
    []
  );

  return {
    surveys,
    loading,
    createSurvey,
    copySurvey,
    getSurveyVersions,
    publishVersion,
    createNewVersion,
    getApplicationsByVersion,
    getApplicationsBySurvey,
    createApplication,
    extendApplication,
  };
}

export function useSurveyBuilder(surveyId: string) {
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [sections, setSections] = useState<SurveySectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!surveyId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const { data: surveyRow, error: surveyErr } = await supabase
        .from("encuestas")
        .select("*")
        .eq("id", surveyId)
        .single();
      if (cancelled) return;
      if (surveyErr || !surveyRow) {
        setError("Encuesta no encontrada");
        setLoading(false);
        return;
      }

      const { data: versions } = await supabase
        .from("encuesta_versiones")
        .select("*")
        .eq("survey_id", surveyId)
        .order("version_number", { ascending: false });

      let draftVersion = versions?.find((v) => v.status === "draft");
      if (!draftVersion && versions && versions.length > 0) {
        const latest = versions[0];
        const { data: newVersion, error: versionErr } = await supabase
          .from("encuesta_versiones")
          .insert({
            survey_id: surveyId,
            version_number: (latest?.version_number ?? 0) + 1,
            status: "draft",
          })
          .select()
          .single();
        if (cancelled) return;
        if (versionErr || !newVersion) {
          setError("Error al crear versión borrador");
          setLoading(false);
          return;
        }
        draftVersion = newVersion;
      }

      if (!draftVersion) {
        setSurvey({
          ...surveyRow,
          version_id: "",
          version_number: 1,
          status: "draft",
        });
        setSections([]);
        setLoading(false);
        return;
      }

      const { data: sectionsRows } = await supabase
        .from("encuesta_secciones")
        .select("*")
        .eq("version_id", draftVersion.id)
        .order("sort_order", { ascending: true });

      const sectionIds = (sectionsRows || []).map((s) => s.id);

      let questionsRows: Question[] = [];
      if (sectionIds.length > 0) {
        const { data: q } = await supabase
          .from("encuesta_preguntas")
          .select("*")
          .in("section_id", sectionIds)
          .order("sort_order", { ascending: true });
        questionsRows = q || [];
      }

      const questionIds = questionsRows.map((q) => q.id);
      let optionsRows: Option[] = [];
      if (questionIds.length > 0) {
        const { data: o } = await supabase
          .from("encuesta_opciones")
          .select("*")
          .in("question_id", questionIds)
          .order("sort_order", { ascending: true });
        optionsRows = o || [];
      }

      const optionsByQuestion = new Map<string, Option[]>();
      for (const opt of optionsRows) {
        const list = optionsByQuestion.get(opt.question_id) || [];
        list.push(opt);
        optionsByQuestion.set(opt.question_id, list);
      }

      const questionsBySection = new Map<string, Question[]>();
      for (const q of questionsRows) {
        const list = questionsBySection.get(q.section_id) || [];
        list.push(q);
        questionsBySection.set(q.section_id, list);
      }

      const builtSections: SurveySectionData[] = (sectionsRows || []).map(
        (sec) => ({
          id: sec.id,
          title: sec.title,
          description: sec.description,
          sort_order: sec.sort_order,
          questions: (questionsBySection.get(sec.id) || []).map((q) => ({
            id: q.id,
            section_id: q.section_id,
            question_type: q.question_type as SurveyQuestionType,
            label: q.label,
            description: q.description,
            is_required: q.is_required,
            sort_order: q.sort_order,
            config: (q.config as Record<string, unknown>) || {},
            presentation: (q.presentation as Record<string, unknown>) || {},
            options: (optionsByQuestion.get(q.id) || []).map((o) => ({
              id: o.id,
              question_id: o.question_id,
              label: o.label,
              sort_order: o.sort_order,
            })),
          })),
        })
      );

      if (cancelled) return;
      setSurvey({
        id: surveyRow.id,
        title: surveyRow.title,
        description: surveyRow.description,
        institution_id: surveyRow.institution_id,
        created_at: surveyRow.created_at,
        version_id: draftVersion.id,
        version_number: draftVersion.version_number,
        status: draftVersion.status,
      });
      setSections(builtSections);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [surveyId]);

  const addSection = useCallback(async () => {
    if (!survey?.version_id) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const maxOrder = sections.reduce(
      (max, s) => Math.max(max, s.sort_order),
      -1
    );
    const newSection: SurveySectionData = {
      id: tempId(),
      title: `Sección ${sections.length + 1}`,
      description: null,
      sort_order: maxOrder + 1,
      questions: [],
    };
    setSections((prev) => [...prev, newSection]);

    const { data, error: insertErr } = await supabase
      .from("encuesta_secciones")
      .insert({
        version_id: survey.version_id,
        title: newSection.title,
        description: null,
        sort_order: newSection.sort_order,
      })
      .select()
      .single();
    if (insertErr || !data) {
      setError("Error al crear sección");
      setSections((prev) => prev.filter((s) => s.id !== newSection.id));
      setSaving(false);
      return;
    }
    setSections((prev) =>
      prev.map((s) => (s.id === newSection.id ? { ...s, id: data.id } : s))
    );
    setSaving(false);
  }, [survey, sections]);

  const updateSection = useCallback(
    async (sectionId: string, updates: Partial<Pick<SurveySectionData, "title" | "description">>) => {
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
      );
      if (sectionId.startsWith("temp_")) return;
      const supabase = createClient();
      const dbUpdates: TablesUpdate<"encuesta_secciones"> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      await supabase
        .from("encuesta_secciones")
        .update(dbUpdates)
        .eq("id", sectionId);
    },
    []
  );

  const deleteSection = useCallback(
    async (sectionId: string) => {
      const prev = sections;
      setSections((prev) => prev.filter((s) => s.id !== sectionId));
      if (sectionId.startsWith("temp_")) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("encuesta_secciones")
        .delete()
        .eq("id", sectionId);
      if (error) {
        setError("Error al eliminar sección");
        setSections(prev);
      }
    },
    [sections]
  );

  const reorderSections = useCallback(
    async (orderedIds: string[]) => {
      const prev = sections;
      const reordered = orderedIds
        .map((id, idx) => {
          const sec = sections.find((s) => s.id === id);
          return sec ? { ...sec, sort_order: idx } : null;
        })
        .filter(Boolean) as SurveySectionData[];
      setSections(reordered);
      const supabase = createClient();
      const updates = orderedIds.map((id, idx) =>
        supabase
          .from("encuesta_secciones")
          .update({ sort_order: idx } as TablesUpdate<"encuesta_secciones">)
          .eq("id", id)
      );
      const results = await Promise.all(updates);
      const hasError = results.some((r) => r.error);
      if (hasError) {
        setError("Error al reordenar secciones");
        setSections(prev);
      }
    },
    [sections]
  );

  const addQuestion = useCallback(
    async (sectionId: string, type: SurveyQuestionType) => {
      setSaving(true);
      setError(null);
      const section = sections.find((s) => s.id === sectionId);
      if (!section) {
        setSaving(false);
        return;
      }
      const maxOrder = section.questions.reduce(
        (max, q) => Math.max(max, q.sort_order),
        -1
      );
      const newQuestion: SurveyQuestionData = {
        id: tempId(),
        section_id: sectionId,
        question_type: type,
        label: "Nueva pregunta",
        description: null,
        is_required: false,
        sort_order: maxOrder + 1,
        config: createDefaultConfig(type),
        presentation: createDefaultPresentation(),
        options: [],
      };
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, questions: [...s.questions, newQuestion] }
            : s
        )
      );

      const supabase = createClient();
      const { data, error: insertErr } = await supabase
        .from("encuesta_preguntas")
        .insert({
          section_id: sectionId,
          question_type: type,
          label: newQuestion.label,
          description: null,
          is_required: false,
          sort_order: newQuestion.sort_order,
          config: newQuestion.config as Json,
          presentation: newQuestion.presentation as Json,
        })
        .select()
        .single();
      if (insertErr || !data) {
        setError("Error al crear pregunta");
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  questions: s.questions.filter(
                    (q) => q.id !== newQuestion.id
                  ),
                }
              : s
          )
        );
        setSaving(false);
        return;
      }
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                questions: s.questions.map((q) =>
                  q.id === newQuestion.id
                    ? { ...q, id: data.id }
                    : q
                ),
              }
            : s
        )
      );
      setSaving(false);
    },
    [sections]
  );

  const updateQuestion = useCallback(
    async (
      questionId: string,
      updates: Partial<
        Pick<
          SurveyQuestionData,
          "label" | "description" | "is_required" | "config" | "presentation" | "question_type"
        >
      >
    ) => {
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          questions: s.questions.map((q) =>
            q.id === questionId ? { ...q, ...updates } : q
          ),
        }))
      );
      if (questionId.startsWith("temp_")) return;
      const supabase = createClient();
      const dbUpdates: TablesUpdate<"encuesta_preguntas"> = {};
      if (updates.label !== undefined) dbUpdates.label = updates.label;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.is_required !== undefined) dbUpdates.is_required = updates.is_required;
      if (updates.config !== undefined) dbUpdates.config = updates.config as Json;
      if (updates.presentation !== undefined) dbUpdates.presentation = updates.presentation as Json;
      if (updates.question_type !== undefined) dbUpdates.question_type = updates.question_type;
      await supabase
        .from("encuesta_preguntas")
        .update(dbUpdates)
        .eq("id", questionId);
    },
    []
  );

  const deleteQuestion = useCallback(
    async (questionId: string) => {
      const prev = sections;
      setSections((s) =>
        s.map((sec) => ({
          ...sec,
          questions: sec.questions.filter((q) => q.id !== questionId),
        }))
      );
      if (questionId.startsWith("temp_")) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("encuesta_preguntas")
        .delete()
        .eq("id", questionId);
      if (error) {
        setError("Error al eliminar pregunta");
        setSections(prev);
      }
    },
    [sections]
  );

  const reorderQuestions = useCallback(
    async (sectionId: string, orderedIds: string[]) => {
      const prev = sections;
      setSections((s) =>
        s.map((sec) => {
          if (sec.id !== sectionId) return sec;
          const reordered = orderedIds
            .map((id, idx) => {
              const q = sec.questions.find((q) => q.id === id);
              return q ? { ...q, sort_order: idx } : null;
            })
            .filter(Boolean) as SurveyQuestionData[];
          return { ...sec, questions: reordered };
        })
      );
      const supabase = createClient();
      const updates = orderedIds.map((id, idx) =>
        supabase
          .from("encuesta_preguntas")
          .update({ sort_order: idx } as TablesUpdate<"encuesta_preguntas">)
          .eq("id", id)
      );
      const results = await Promise.all(updates);
      const hasError = results.some((r) => r.error);
      if (hasError) {
        setError("Error al reordenar preguntas");
        setSections(prev);
      }
    },
    [sections]
  );

  const addOption = useCallback(
    async (questionId: string) => {
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          questions: s.questions.map((q) => {
            if (q.id !== questionId) return q;
            const maxOrder = q.options.reduce(
              (max, o) => Math.max(max, o.sort_order),
              -1
            );
            return {
              ...q,
              options: [
                ...q.options,
                {
                  id: tempId(),
                  question_id: questionId,
                  label: `Opción ${q.options.length + 1}`,
                  sort_order: maxOrder + 1,
                },
              ],
            };
          }),
        }))
      );
      const supabase = createClient();
      const section = sections.find((s) =>
        s.questions.some((q) => q.id === questionId)
      );
      const question = section?.questions.find((q) => q.id === questionId);
      if (!question) return;
      const maxOrder = question.options.reduce(
        (max, o) => Math.max(max, o.sort_order),
        -1
      );
      const tempOptId = question.options.length > 0
        ? question.options[question.options.length - 1].id
        : null;
      const { data, error: insertErr } = await supabase
        .from("encuesta_opciones")
        .insert({
          question_id: questionId,
          label: `Opción ${question.options.length + 1}`,
          sort_order: maxOrder + 1,
        })
        .select()
        .single();
      if (insertErr || !data) {
        setError("Error al crear opción");
        return;
      }
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          questions: s.questions.map((q) => {
            if (q.id !== questionId) return q;
            return {
              ...q,
              options: q.options.map((o) =>
                o.id === tempOptId ? { ...o, id: data.id } : o
              ),
            };
          }),
        }))
      );
    },
    [sections]
  );

  const updateOption = useCallback(
    async (optionId: string, label: string) => {
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          questions: s.questions.map((q) => ({
            ...q,
            options: q.options.map((o) =>
              o.id === optionId ? { ...o, label } : o
            ),
          })),
        }))
      );
      if (optionId.startsWith("temp_")) return;
      const supabase = createClient();
      await supabase
        .from("encuesta_opciones")
        .update({ label } as TablesUpdate<"encuesta_opciones">)
        .eq("id", optionId);
    },
    []
  );

  const deleteOption = useCallback(
    async (optionId: string) => {
      const prev = sections;
      setSections((s) =>
        s.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => ({
            ...q,
            options: q.options.filter((o) => o.id !== optionId),
          })),
        }))
      );
      if (optionId.startsWith("temp_")) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("encuesta_opciones")
        .delete()
        .eq("id", optionId);
      if (error) {
        setError("Error al eliminar opción");
        setSections(prev);
      }
    },
    [sections]
  );

  const reorderOptions = useCallback(
    async (questionId: string, orderedIds: string[]) => {
      const prev = sections;
      setSections((s) =>
        s.map((sec) => ({
          ...sec,
          questions: sec.questions.map((q) => {
            if (q.id !== questionId) return q;
            const reordered = orderedIds
              .map((id, idx) => {
                const o = q.options.find((o) => o.id === id);
                return o ? { ...o, sort_order: idx } : null;
              })
              .filter(Boolean) as SurveyOptionData[];
            return { ...q, options: reordered };
          }),
        }))
      );
      const supabase = createClient();
      const updates = orderedIds.map((id, idx) =>
        supabase
          .from("encuesta_opciones")
          .update({ sort_order: idx } as TablesUpdate<"encuesta_opciones">)
          .eq("id", id)
      );
      const results = await Promise.all(updates);
      const hasError = results.some((r) => r.error);
      if (hasError) {
        setError("Error al reordenar opciones");
        setSections(prev);
      }
    },
    [sections]
  );

  return {
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
  };
}
