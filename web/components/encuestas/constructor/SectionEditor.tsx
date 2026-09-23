"use client";

import { useState } from "react";
import type {
  SurveySectionData,
  SurveyQuestionType,
} from "@/types/encuestas";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionTypeSelector } from "./QuestionTypeSelector";

interface Props {
  section: SurveySectionData;
  onUpdate: (
    sectionId: string,
    updates: Partial<Pick<SurveySectionData, "title" | "description">>
  ) => void;
  onDelete: (sectionId: string) => void;
  onAddQuestion: (sectionId: string, type: SurveyQuestionType) => void;
  onUpdateQuestion: (
    questionId: string,
    updates: Record<string, unknown>
  ) => void;
  onDeleteQuestion: (questionId: string) => void;
  onReorderQuestions: (sectionId: string, orderedIds: string[]) => void;
  onAddOption: (questionId: string) => void;
  onUpdateOption: (optionId: string, label: string) => void;
  onDeleteOption: (optionId: string) => void;
  onReorderOptions: (questionId: string, orderedIds: string[]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function SectionEditor({
  section,
  onUpdate,
  onDelete,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onReorderQuestions,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
  onReorderOptions,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  const handleMoveQuestionUp = (index: number) => {
    if (index === 0) return;
    const ids = section.questions.map((q) => q.id);
    const newIds = [...ids];
    [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
    onReorderQuestions(section.id, newIds);
  };

  const handleMoveQuestionDown = (index: number) => {
    if (index === section.questions.length - 1) return;
    const ids = section.questions.map((q) => q.id);
    const newIds = [...ids];
    [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
    onReorderQuestions(section.id, newIds);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50/50">
      {showTypeSelector && (
        <QuestionTypeSelector
          onSelect={(type) => onAddQuestion(section.id, type)}
          onClose={() => setShowTypeSelector(false)}
        />
      )}

      <div className="px-4 py-3 flex items-center space-x-3 bg-gray-100 rounded-t-lg">
        <div className="flex flex-col space-y-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
          >
            ▼
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={section.title}
            onChange={(e) =>
              onUpdate(section.id, { title: e.target.value })
            }
            className="block w-full text-sm font-semibold text-gray-900 border-0 border-b border-transparent focus:border-blue-500 focus:ring-0 p-0 bg-transparent"
            placeholder="Título de la sección"
          />
          <input
            type="text"
            value={section.description || ""}
            onChange={(e) =>
              onUpdate(section.id, {
                description: e.target.value || null,
              })
            }
            className="block w-full text-xs text-gray-500 border-0 border-b border-transparent focus:border-blue-500 focus:ring-0 p-0 bg-transparent mt-1"
            placeholder="Descripción (opcional)"
          />
        </div>

        <span className="text-xs text-gray-400 whitespace-nowrap">
          {section.questions.length}{" "}
          {section.questions.length === 1 ? "pregunta" : "preguntas"}
        </span>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          {expanded ? "▾" : "▸"}
        </button>

        <button
          onClick={() => onDelete(section.id)}
          className="text-red-400 hover:text-red-600 text-sm"
          title="Eliminar sección"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="px-4 py-4 space-y-3">
          {section.questions.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400">
              No hay preguntas.{" "}
              <button
                onClick={() => setShowTypeSelector(true)}
                className="text-blue-600 hover:text-blue-500"
              >
                Agregar primera pregunta
              </button>
            </div>
          ) : (
            section.questions.map((question, qIdx) => (
              <QuestionEditor
                key={question.id}
                question={question}
                onUpdate={onUpdateQuestion}
                onDelete={onDeleteQuestion}
                onAddOption={onAddOption}
                onUpdateOption={onUpdateOption}
                onDeleteOption={onDeleteOption}
                onReorderOptions={onReorderOptions}
                onMoveUp={() => handleMoveQuestionUp(qIdx)}
                onMoveDown={() => handleMoveQuestionDown(qIdx)}
                isFirst={qIdx === 0}
                isLast={qIdx === section.questions.length - 1}
              />
            ))
          )}

          <button
            onClick={() => setShowTypeSelector(true)}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + Agregar pregunta
          </button>
        </div>
      )}
    </div>
  );
}
