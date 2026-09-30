"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError } from "@/lib/errors";
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

type AppStatRow = {
  created_at: string;
  version_id: { survey_id: string } | null;
};

type VersionStatRow = {
  survey_id: string;
  version_number: number;
};

async function loadApplicationStats(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, { count: number; last: string | null }>> {
  const stats = new Map<string, { count: number; last: string | null }>();
  const { data } = await supabase
    .from("encuesta_aplicaciones")
    .select("created_at, version_id(survey_id)")
    .order("created_at", { ascending: false });
  for (const row of ((data ?? []) as unknown as AppStatRow[])) {
    const surveyId = row.version_id?.survey_id;
    if (!surveyId) continue;
    const current = stats.get(surveyId);
    if (current) {
      current.count += 1;
      if (!current.last) current.last = row.created_at;
    } else {
      stats.set(surveyId, { count: 1, last: row.created_at });
    }
  }
  return stats;
}

async function loadPublishedVersionStats(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, number>> {
  const stats = new Map<string, number>();
  const { data } = await supabase
    .from("encuesta_versiones")
    .select("survey_id, version_number")
    .eq("status", "published");
  for (const row of ((data ?? []) as unknown as VersionStatRow[])) {
    const current = stats.get(row.survey_id);
    if (current === undefined || row.version_number > current) {
      stats.set(row.survey_id, row.version_number);
    }
  }
  return stats;
}

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
      if (profile?.role === "global") {
        const { data, error } = await supabase
          .from("encuestas")
          .select(
            "id, title, description, created_at, institutions(name), encuesta_versiones(status)"
          )
          .order("created_at", { ascending: false });
        const stats = await loadApplicationStats(supabase);
        const versionStats = await loadPublishedVersionStats(supabase);
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
                application_count: stats.get(s.id)?.count ?? 0,
                last_application_at: stats.get(s.id)?.last ?? null,
                current_version_number: versionStats.get(s.id) ?? null,
              }))
            );
          }
          setLoading(false);
        }
        return;
      }
      if (profile?.institution_id) {
        const { data, error } = await supabase.rpc("get_institution_surveys", {
          p_institution_id: profile.institution_id,
        });
        const stats = await loadApplicationStats(supabase);
        const versionStats = await loadPublishedVersionStats(supabase);
        if (!cancelled) {
          if (error || !data?.success) {
            setSurveys([]);
          } else {
            setSurveys(
              (data.data || []).map(
                (item: SurveyListItem) => ({
                  ...item,
                  application_count: stats.get(item.id)?.count ?? 0,
                  last_application_at: stats.get(item.id)?.last ?? null,
                  current_version_number: versionStats.get(item.id) ?? null,
                })
              )
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
      const rows = (data.versions ?? data.data ?? []) as unknown as SurveyVersionItem[];
      return rows;
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

  const bulkCreateApplications = useCallback(
    async (params: {
      version_id: string;
      year: number;
      started_at: string;
      ends_at: string;
      section_name?: string | null;
      grade_id?: string | null;
      student_ids: string[];
      user_ids: string[];
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "bulk_create_survey_applications",
        {
          p_version_id: params.version_id,
          p_year: params.year,
          p_started_at: params.started_at,
          p_ends_at: params.ends_at,
          p_section_name: params.section_name || null,
          p_grade_id: params.grade_id || null,
          p_student_ids: params.student_ids,
          p_user_ids: params.user_ids,
        }
      );
      if (error) throw error;
      if (!data?.success)
        throw new Error(data?.error || "Error al crear aplicaciones");
      return data as {
        success: boolean;
        created: number;
        application_ids: string[];
      };
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
    bulkCreateApplications,
  };
}

export type BuilderSaveStatus = "idle" | "saving" | "saved" | "error";

export function useSurveyBuilder(surveyId: string, versionId?: string) {
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [sections, setSections] = useState<SurveySectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<BuilderSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const sectionsRef = useRef<SurveySectionData[]>([]);
  const pendingWritesRef = useRef(new Map<string, () => Promise<boolean>>());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const flushWrites = useCallback(async (): Promise<boolean> => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const writes = Array.from(pendingWritesRef.current.values());
    pendingWritesRef.current.clear();
    if (writes.length === 0) return true;
    setSaveStatus("saving");
    let allOk = true;
    for (const write of writes) {
      const ok = await write();
      if (!ok) allOk = false;
    }
    setSaveStatus(allOk ? "saved" : "error");
    if (!allOk) {
      setError("No se pudieron guardar algunos cambios. Vuelve a intentarlo editando de nuevo.");
    }
    return allOk;
  }, []);

  const scheduleWrite = useCallback(
    (key: string, run: () => Promise<boolean>) => {
      pendingWritesRef.current.set(key, run);
      setSaveStatus("saving");
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        void flushWrites();
      }, 600);
    },
    [flushWrites]
  );

  useEffect(() => {
    const pending = pendingWritesRef.current;
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      const writes = Array.from(pending.values());
      pending.clear();
      void Promise.all(writes.map((w) => w()));
    };
  }, []);


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

      let targetVersion =
        versions?.find((v) => v.status === "draft") ?? versions?.[0] ?? null;
      if (versionId) {
        targetVersion = versions?.find((v) => v.id === versionId) ?? null;
        if (!targetVersion) {
          setError("Versión no encontrada");
          setLoading(false);
          return;
        }
      }

      if (!targetVersion) {
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
        .eq("version_id", targetVersion.id)
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
        version_id: targetVersion.id,
        version_number: targetVersion.version_number,
        status: targetVersion.status,
      });
      setSections(builtSections);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [surveyId, versionId]);

  const addSection = useCallback(async () => {
    if (!survey?.version_id) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const current = sectionsRef.current;
    const maxOrder = current.reduce(
      (max, s) => Math.max(max, s.sort_order),
      -1
    );
    const newSection: SurveySectionData = {
      id: tempId(),
      title: `Sección ${current.length + 1}`,
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
      logClientError("useSurveyBuilder.addSection", insertErr);
      setError("No se pudo crear la sección. Revisa tu conexión e intenta de nuevo.");
      setSections((prev) => prev.filter((s) => s.id !== newSection.id));
      setSaving(false);
      return;
    }
    setSections((prev) =>
      prev.map((s) => (s.id === newSection.id ? { ...s, id: data.id } : s))
    );
    setSaving(false);
  }, [survey]);

  const updateSection = useCallback(
    (
      sectionId: string,
      updates: Partial<Pick<SurveySectionData, "title" | "description">>
    ) => {
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
      );
      if (sectionId.startsWith("temp_")) return;
      const supabase = createClient();
      const dbUpdates: TablesUpdate<"encuesta_secciones"> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      scheduleWrite(`secciones:${sectionId}:${Object.keys(updates).join(",")}`, async () => {
        const { error: updErr } = await supabase
          .from("encuesta_secciones")
          .update(dbUpdates)
          .eq("id", sectionId);
        if (updErr) {
          logClientError("useSurveyBuilder.updateSection", updErr);
          return false;
        }
        return true;
      });
    },
    [scheduleWrite]
  );

  const deleteSection = useCallback(
    async (sectionId: string) => {
      const prev = sectionsRef.current;
      setSections((prev) => prev.filter((s) => s.id !== sectionId));
      if (sectionId.startsWith("temp_")) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("encuesta_secciones")
        .delete()
        .eq("id", sectionId);
      if (error) {
        logClientError("useSurveyBuilder.deleteSection", error);
        setError("No se pudo eliminar la sección. Revisa tu conexión e intenta de nuevo.");
        setSections(prev);
      }
    },
    []
  );

  const duplicateSection = useCallback(
    async (sectionId: string) => {
      if (!survey?.version_id) return;
      setSaving(true);
      setError(null);
      const source = sectionsRef.current.find((s) => s.id === sectionId);
      if (!source) {
        setSaving(false);
        return;
      }
      const maxOrder = sectionsRef.current.reduce(
        (max, s) => Math.max(max, s.sort_order),
        -1
      );
      const tempSectionId = tempId();
      const copiedQuestions: SurveyQuestionData[] = source.questions.map((q) => {
        const qId = tempId();
        return {
          ...q,
          id: qId,
          section_id: tempSectionId,
          options: q.options.map((o) => ({ ...o, question_id: qId, id: tempId() })),
        };
      });
      const copy: SurveySectionData = {
        id: tempSectionId,
        title: `${source.title} (copia)`,
        description: source.description,
        sort_order: maxOrder + 1,
        questions: copiedQuestions,
      };
      setSections((prev) => [...prev, copy]);

      const removeCopy = () =>
        setSections((prev) => prev.filter((s) => s.id !== tempSectionId));
      const supabase = createClient();
      const fail = async (
        message: string,
        sectionRowId: string,
        err: unknown
      ) => {
        logClientError("useSurveyBuilder.duplicateSection", err);
        setError(message);
        await supabase
          .from("encuesta_secciones")
          .delete()
          .eq("id", sectionRowId);
        removeCopy();
        setSaving(false);
      };

      const { data: secRow, error: secErr } = await supabase
        .from("encuesta_secciones")
        .insert({
          version_id: survey.version_id,
          title: copy.title,
          description: copy.description,
          sort_order: copy.sort_order,
        })
        .select()
        .single();
      if (secErr || !secRow) {
        logClientError("useSurveyBuilder.duplicateSection", secErr);
        setError("No se pudo duplicar la sección. Revisa tu conexión e intenta de nuevo.");
        removeCopy();
        setSaving(false);
        return;
      }

      const created: SurveyQuestionData[] = [];
      for (const q of copiedQuestions) {
        const { data: qRow, error: qErr } = await supabase
          .from("encuesta_preguntas")
          .insert({
            section_id: secRow.id,
            question_type: q.question_type,
            label: q.label,
            description: q.description,
            is_required: q.is_required,
            sort_order: q.sort_order,
            config: q.config as Json,
            presentation: q.presentation as Json,
          })
          .select()
          .single();
        if (qErr || !qRow) {
          await fail(
            "No se pudieron copiar las preguntas. Revisa tu conexión e intenta de nuevo.",
            secRow.id,
            qErr
          );
          return;
        }
        let opts: SurveyOptionData[] = [];
        if (q.options.length > 0) {
          const { data: oRows, error: oErr } = await supabase
            .from("encuesta_opciones")
            .insert(
              q.options.map((o) => ({
                question_id: qRow.id,
                label: o.label,
                sort_order: o.sort_order,
              }))
            )
            .select();
          if (oErr || !oRows) {
            await fail(
              "No se pudieron copiar las opciones. Revisa tu conexión e intenta de nuevo.",
              secRow.id,
              oErr
            );
            return;
          }
          opts = (oRows as SurveyOptionData[]).map((o) => ({
            ...o,
            question_id: qRow.id,
          }));
        }
        created.push({ ...q, id: qRow.id, section_id: secRow.id, options: opts });
      }

      setSections((prev) =>
        prev.map((s) =>
          s.id === tempSectionId
            ? { ...s, id: secRow.id, questions: created }
            : s
        )
      );
      setSaving(false);
    },
    [survey]
  );

  const reorderSections = useCallback(
    async (orderedIds: string[]) => {
      const prev = sectionsRef.current;
      const reordered = orderedIds
        .map((id, idx) => {
          const sec = prev.find((s) => s.id === id);
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
        logClientError("useSurveyBuilder.reorderSections", results.find((r) => r.error)?.error);
        setError("No se pudo reordenar las secciones.");
        setSections(prev);
      }
    },
    []
  );

  const addQuestion = useCallback(
    async (sectionId: string, type: SurveyQuestionType) => {
      setSaving(true);
      setError(null);
      const section = sectionsRef.current.find((s) => s.id === sectionId);
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
        logClientError("useSurveyBuilder.addQuestion", insertErr);
        setError("No se pudo crear la pregunta. Revisa tu conexión e intenta de nuevo.");
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
    []
  );

  const updateQuestion = useCallback(
    (
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
      scheduleWrite(`preguntas:${questionId}:${Object.keys(updates).join(",")}`, async () => {
        const { error: updErr } = await supabase
          .from("encuesta_preguntas")
          .update(dbUpdates)
          .eq("id", questionId);
        if (updErr) {
          logClientError("useSurveyBuilder.updateQuestion", updErr);
          return false;
        }
        return true;
      });
    },
    [scheduleWrite]
  );

  const deleteQuestion = useCallback(
    async (questionId: string) => {
      const prev = sectionsRef.current;
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
        logClientError("useSurveyBuilder.deleteQuestion", error);
        setError("No se pudo eliminar la pregunta. Revisa tu conexión e intenta de nuevo.");
        setSections(prev);
      }
    },
    []
  );

  const duplicateQuestion = useCallback(
    async (sectionId: string, questionId: string) => {
      setSaving(true);
      setError(null);
      const section = sectionsRef.current.find((s) => s.id === sectionId);
      const source = section?.questions.find((q) => q.id === questionId);
      if (!section || !source) {
        setSaving(false);
        return;
      }
      const maxOrder = section.questions.reduce(
        (max, q) => Math.max(max, q.sort_order),
        -1
      );
      const copyId = tempId();
      const copy: SurveyQuestionData = {
        ...source,
        id: copyId,
        section_id: sectionId,
        label: `${source.label} (copia)`,
        sort_order: maxOrder + 1,
        options: source.options.map((o) => ({
          ...o,
          question_id: copyId,
          id: tempId(),
        })),
      };
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId ? { ...s, questions: [...s.questions, copy] } : s
        )
      );

      const removeCopy = () =>
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? { ...s, questions: s.questions.filter((q) => q.id !== copyId) }
              : s
          )
        );

      const supabase = createClient();
      const { data, error: insertErr } = await supabase
        .from("encuesta_preguntas")
        .insert({
          section_id: sectionId,
          question_type: source.question_type,
          label: copy.label,
          description: source.description,
          is_required: source.is_required,
          sort_order: copy.sort_order,
          config: source.config as Json,
          presentation: source.presentation as Json,
        })
        .select()
        .single();
      if (insertErr || !data) {
        logClientError("useSurveyBuilder.duplicateQuestion", insertErr);
        setError("No se pudo duplicar la pregunta. Revisa tu conexión e intenta de nuevo.");
        removeCopy();
        setSaving(false);
        return;
      }

      let realOptions = copy.options;
      if (copy.options.length > 0) {
        const { data: optRows, error: optErr } = await supabase
          .from("encuesta_opciones")
          .insert(
            copy.options.map((o) => ({
              question_id: data.id,
              label: o.label,
              sort_order: o.sort_order,
            }))
          )
          .select();
        if (optErr || !optRows) {
          logClientError("useSurveyBuilder.duplicateQuestion.options", optErr);
          setError("No se pudieron copiar las opciones. Revisa tu conexión e intenta de nuevo.");
          await supabase.from("encuesta_preguntas").delete().eq("id", data.id);
          removeCopy();
          setSaving(false);
          return;
        }
        realOptions = (optRows as SurveyOptionData[]).map((o) => ({
          ...o,
          question_id: data.id,
        }));
      }

      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                questions: s.questions.map((q) =>
                  q.id === copyId
                    ? { ...q, id: data.id, options: realOptions }
                    : q
                ),
              }
            : s
        )
      );
      setSaving(false);
    },
    []
  );

  const reorderQuestions = useCallback(
    async (sectionId: string, orderedIds: string[]) => {
      const prev = sectionsRef.current;
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
        logClientError("useSurveyBuilder.reorderQuestions", results.find((r) => r.error)?.error);
        setError("No se pudieron reordenar las preguntas.");
        setSections(prev);
      }
    },
    []
  );

  const addOption = useCallback(
    async (questionId: string) => {
      setError(null);
      const section = sectionsRef.current.find((s) =>
        s.questions.some((q) => q.id === questionId)
      );
      const question = section?.questions.find((q) => q.id === questionId);
      if (!question) return;
      const maxOrder = question.options.reduce(
        (max, o) => Math.max(max, o.sort_order),
        -1
      );
      const label = `Opción ${question.options.length + 1}`;
      const optionTempId = tempId();

      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          questions: s.questions.map((q) => {
            if (q.id !== questionId) return q;
            return {
              ...q,
              options: [
                ...q.options,
                {
                  id: optionTempId,
                  question_id: questionId,
                  label,
                  sort_order: maxOrder + 1,
                },
              ],
            };
          }),
        }))
      );

      const supabase = createClient();
      const { data, error: insertErr } = await supabase
        .from("encuesta_opciones")
        .insert({
          question_id: questionId,
          label,
          sort_order: maxOrder + 1,
        })
        .select()
        .single();
      if (insertErr || !data) {
        logClientError("useSurveyBuilder.addOption", insertErr);
        setError("No se pudo crear la opción. Revisa tu conexión e intenta de nuevo.");
        setSections((prev) =>
          prev.map((s) => ({
            ...s,
            questions: s.questions.map((q) =>
              q.id !== questionId
                ? q
                : { ...q, options: q.options.filter((o) => o.id !== optionTempId) }
            ),
          }))
        );
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
                o.id === optionTempId ? { ...o, id: data.id } : o
              ),
            };
          }),
        }))
      );
    },
    []
  );

  const updateOption = useCallback(
    (optionId: string, label: string) => {
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
      scheduleWrite(`opciones:${optionId}:label`, async () => {
        const { error: updErr } = await supabase
          .from("encuesta_opciones")
          .update({ label } as TablesUpdate<"encuesta_opciones">)
          .eq("id", optionId);
        if (updErr) {
          logClientError("useSurveyBuilder.updateOption", updErr);
          return false;
        }
        return true;
      });
    },
    [scheduleWrite]
  );

  const deleteOption = useCallback(
    async (optionId: string) => {
      const prev = sectionsRef.current;
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
        logClientError("useSurveyBuilder.deleteOption", error);
        setError("No se pudo eliminar la opción. Revisa tu conexión e intenta de nuevo.");
        setSections(prev);
      }
    },
    []
  );

  const reorderOptions = useCallback(
    async (questionId: string, orderedIds: string[]) => {
      const prev = sectionsRef.current;
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
        logClientError("useSurveyBuilder.reorderOptions", results.find((r) => r.error)?.error);
        setError("No se pudieron reordenar las opciones.");
        setSections(prev);
      }
    },
    []
  );

  return {
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
  };
}
