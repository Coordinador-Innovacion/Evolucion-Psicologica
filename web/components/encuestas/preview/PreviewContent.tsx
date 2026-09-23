"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  SurveySectionData,
  SurveyQuestionData,
  SurveyQuestionType,
} from "@/types/encuestas";
import { QUESTION_TYPE_LABELS } from "@/types/encuestas";
import type { Tables } from "@/types/supabase";

type Question = Tables<"encuesta_preguntas">;
type Option = Tables<"encuesta_opciones">;

interface Props {
  surveyId: string;
  versionId?: string;
}

export function PreviewContent({ surveyId, versionId }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [sections, setSections] = useState<SurveySectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);

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
        const { data: versions } = await supabase
          .from("encuesta_versiones")
          .select("id")
          .eq("survey_id", surveyId)
          .order("version_number", { ascending: false })
          .limit(1);
        targetVersionId = versions?.[0]?.id;
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
    return () => { cancelled = true; };
  }, [surveyId, versionId]);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Cargando vista previa...
      </div>
    );
  }

  const renderQuestionPreview = (question: SurveyQuestionData) => {
    switch (question.question_type) {
      case "texto_corto":
        return (
          <input
            type="text"
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
            placeholder="Respuesta de texto corto"
          />
        );
      case "texto_largo":
        return (
          <textarea
            disabled
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
            placeholder="Respuesta de texto largo"
          />
        );
      case "opcion_unica":
        return (
          <div className="space-y-2">
            {question.options.map((opt) => (
              <label key={opt.id} className="flex items-center space-x-2 text-sm">
                <input type="radio" disabled className="text-blue-600" />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        );
      case "seleccion_multiple":
        return (
          <div className="space-y-2">
            {question.options.map((opt) => (
              <label key={opt.id} className="flex items-center space-x-2 text-sm">
                <input type="checkbox" disabled className="text-blue-600 rounded" />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        );
      case "si_no":
        return (
          <div className="flex space-x-4 text-sm">
            <label className="flex items-center space-x-2">
              <input type="radio" disabled className="text-blue-600" />
              <span>Sí</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="radio" disabled className="text-blue-600" />
              <span>No</span>
            </label>
          </div>
        );
      case "numero":
        return (
          <input
            type="number"
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
            placeholder="0"
          />
        );
      case "fecha":
        return (
          <input
            type="date"
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
          />
        );
      case "escala": {
        const min = (question.config.min as number) ?? 1;
        const max = (question.config.max as number) ?? 5;
        const minLabel = (question.config.min_label as string) || "";
        const maxLabel = (question.config.max_label as string) || "";
        const values = [];
        for (let i = min; i <= max; i++) values.push(i);
        return (
          <div>
            <div className="flex space-x-2">
              {values.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled
                  className="w-10 h-10 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-500"
                >
                  {v}
                </button>
              ))}
            </div>
            {(minLabel || maxLabel) && (
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{minLabel}</span>
                <span>{maxLabel}</span>
              </div>
            )}
          </div>
        );
      }
      case "seleccion_opciones":
        return (
          <select
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
          >
            <option>Seleccionar...</option>
            {question.options.map((opt) => (
              <option key={opt.id}>{opt.label}</option>
            ))}
          </select>
        );
      default:
        return (
          <div className="text-sm text-gray-400 italic">
            Tipo no disponible para vista previa
          </div>
        );
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {description && (
          <p className="mt-2 text-sm text-gray-500">{description}</p>
        )}
        <p className="mt-3 text-xs text-gray-400">
          Vista previa — {sections.length}{" "}
          {sections.length === 1 ? "sección" : "secciones"},{" "}
          {sections.reduce((acc, s) => acc + s.questions.length, 0)}{" "}
          {sections.reduce((acc, s) => acc + s.questions.length, 0) === 1
            ? "pregunta"
            : "preguntas"}
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
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
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {sec.title}
              </button>
            ))}
          </div>

          {sections[activeSection] && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {sections[activeSection].title}
              </h3>
              {sections[activeSection].description && (
                <p className="text-sm text-gray-500 mb-6">
                  {sections[activeSection].description}
                </p>
              )}

              <div className="space-y-6">
                {sections[activeSection].questions.map((question) => (
                  <div key={question.id}>
                    <div className="flex items-start space-x-2 mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {question.label}
                      </span>
                      {question.is_required && (
                        <span className="text-red-500 text-xs">*</span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">
                        {QUESTION_TYPE_LABELS[question.question_type]}
                      </span>
                    </div>
                    {question.description && (
                      <p className="text-xs text-gray-500 mb-2">
                        {question.description}
                      </p>
                    )}
                    {renderQuestionPreview(question)}
                  </div>
                ))}
              </div>

              <div className="mt-8 flex justify-between">
                <button
                  type="button"
                  disabled={activeSection === 0}
                  onClick={() => setActiveSection((prev) => prev - 1)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-400 self-center">
                  {activeSection + 1} / {sections.length}
                </span>
                <button
                  type="button"
                  disabled={activeSection === sections.length - 1}
                  onClick={() => setActiveSection((prev) => prev + 1)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
