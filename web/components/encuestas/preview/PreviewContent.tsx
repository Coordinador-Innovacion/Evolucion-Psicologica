"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QuestionRenderer } from "@/components/encuesta/QuestionRenderer";
import type {
  SurveySectionData,
  SurveyQuestionType,
} from "@/types/encuestas";
import type { Tables } from "@/types/supabase";

type Question = Tables<"encuesta_preguntas">;
type Option = Tables<"encuesta_opciones">;

interface Props {
  surveyId: string;
  versionId?: string;
}

type Viewport = "mobile" | "tablet" | "desktop";

const VIEWPORTS: { id: Viewport; label: string; width: string }[] = [
  { id: "mobile", label: "Móvil", width: "390px" },
  { id: "tablet", label: "Tablet", width: "768px" },
  { id: "desktop", label: "Escritorio", width: "100%" },
];

export function PreviewContent({ surveyId, versionId }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [sections, setSections] = useState<SurveySectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!surveyId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();

      const { data: surveyRow } = await supabase
        .from("encuestas")
        .select("title, description")
        .eq("id", surveyId)
        .single();
      if (cancelled || !surveyRow) return;

      let targetVersionId = versionId;
      if (!targetVersionId) {
        const { data: draft } = await supabase
          .from("encuesta_versiones")
          .select("id")
          .eq("survey_id", surveyId)
          .eq("status", "draft")
          .limit(1);
        if (draft && draft.length > 0) {
          targetVersionId = draft[0].id;
        } else {
          const { data: versions } = await supabase
            .from("encuesta_versiones")
            .select("id")
            .eq("survey_id", surveyId)
            .order("version_number", { ascending: false })
            .limit(1);
          targetVersionId = versions?.[0]?.id;
        }
      }

      if (!targetVersionId) {
        setTitle(surveyRow.title);
        setDescription(surveyRow.description);
        setSections([]);
        setLoading(false);
        return;
      }

      const { data: sectionsRows } = await supabase
        .from("encuesta_secciones")
        .select("*")
        .eq("version_id", targetVersionId)
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

      if (!cancelled) {
        setTitle(surveyRow.title);
        setDescription(surveyRow.description);
        setSections(builtSections);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [surveyId, versionId]);

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-500">
        Cargando vista previa...
      </div>
    );
  }

  const totalQuestions = sections.reduce(
    (acc, s) => acc + s.questions.length,
    0
  );
  const currentViewport = VIEWPORTS.find((v) => v.id === viewport)!;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-medium text-amber-800">
          Vista previa — no se guardan respuestas
        </p>
        <div
          role="group"
          aria-label="Selector de dispositivo"
          className="flex gap-1 rounded-lg border border-amber-200 bg-white p-1"
        >
          {VIEWPORTS.map((vp) => (
            <button
              key={vp.id}
              type="button"
              aria-pressed={viewport === vp.id}
              onClick={() => setViewport(vp.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewport === vp.id
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {vp.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mx-auto transition-all duration-300"
        style={{ maxWidth: currentViewport.width }}
      >
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {description && (
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Vista previa — {sections.length}{" "}
            {sections.length === 1 ? "sección" : "secciones"},{" "}
            {totalQuestions}{" "}
            {totalQuestions === 1 ? "pregunta" : "preguntas"}
          </p>
        </div>

        {sections.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            Esta encuesta no tiene secciones ni preguntas aún.
          </div>
        ) : (
          <>
            <div className="flex space-x-1 mb-6 overflow-x-auto pb-2">
              {sections.map((sec, idx) => (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(idx)}
                  className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                    activeSection === idx
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {sec.title}
                </button>
              ))}
            </div>

            {sections[activeSection] && (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  {sections[activeSection].title}
                </h3>
                {sections[activeSection].description && (
                  <p className="text-sm text-slate-500 mb-6">
                    {sections[activeSection].description}
                  </p>
                )}

                <div className="space-y-6">
                  {sections[activeSection].questions.map((question) => (
                    <QuestionRenderer
                      key={question.id}
                      question={question}
                      value={answers[question.id] ?? null}
                      onChange={(val) =>
                        setAnswers((prev) => ({ ...prev, [question.id]: val }))
                      }
                    />
                  ))}
                </div>

                <div className="mt-8 flex justify-between">
                  <button
                    type="button"
                    disabled={activeSection === 0}
                    onClick={() => setActiveSection((prev) => prev - 1)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-slate-400 self-center">
                    {activeSection + 1} / {sections.length}
                  </span>
                  <button
                    type="button"
                    disabled={activeSection === sections.length - 1}
                    onClick={() => setActiveSection((prev) => prev + 1)}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
