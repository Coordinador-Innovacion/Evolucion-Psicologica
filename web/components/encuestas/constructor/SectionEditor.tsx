"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Copy } from "lucide-react";
import type {
  SurveySectionData,
  SurveyQuestionType,
} from "@/types/encuestas";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionTypeSelector } from "./QuestionTypeSelector";

interface Props {
  section: SurveySectionData;
  readOnly?: boolean;
  onUpdate: (
    sectionId: string,
    updates: Partial<Pick<SurveySectionData, "title" | "description">>
  ) => void;
  onDelete: (sectionId: string) => void;
  onDuplicate: (sectionId: string) => void;
  onAddQuestion: (sectionId: string, type: SurveyQuestionType) => void;
  onUpdateQuestion: (
    questionId: string,
    updates: Record<string, unknown>
  ) => void;
  onDeleteQuestion: (questionId: string) => void;
  onDuplicateQuestion: (sectionId: string, questionId: string) => void;
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
  readOnly = false,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onDuplicateQuestion,
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    <div className="border border-slate-200 rounded-lg bg-slate-50/50">
      {showTypeSelector && (
        <QuestionTypeSelector
          onSelect={(type) => onAddQuestion(section.id, type)}
          onClose={() => setShowTypeSelector(false)}
        />
      )}

      <div className="px-4 py-3 flex items-center space-x-3 bg-slate-100 rounded-t-lg">
        {!readOnly && (
          <div className="flex flex-col space-y-1">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-xs leading-none"
            >
              ▲
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-xs leading-none"
            >
              ▼
            </button>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={section.title}
            onChange={(e) =>
              onUpdate(section.id, { title: e.target.value })
            }
            disabled={readOnly}
            className="block w-full text-sm font-semibold text-slate-900 border-0 border-b border-transparent focus:border-indigo-500 focus:ring-0 p-0 bg-transparent disabled:opacity-70"
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
            disabled={readOnly}
            className="block w-full text-xs text-slate-500 border-0 border-b border-transparent focus:border-indigo-500 focus:ring-0 p-0 bg-transparent mt-1 disabled:opacity-70"
            placeholder="Descripción (opcional)"
          />
        </div>

        <span className="text-xs text-slate-400 whitespace-nowrap">
          {section.questions.length}{" "}
          {section.questions.length === 1 ? "pregunta" : "preguntas"}
        </span>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          {expanded ? "▾" : "▸"}
        </button>

        {!readOnly && (
          <button
            onClick={() => onDuplicate(section.id)}
            className="text-slate-400 hover:text-indigo-600 text-sm"
            title="Duplicar sección"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}

        {!readOnly && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-rose-400 hover:text-rose-600 text-sm"
            title="Eliminar sección"
          >
            ✕
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-4 py-4 space-y-3">
          {section.questions.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400">
              No hay preguntas.{" "}
              {!readOnly && (
                <button
                  onClick={() => setShowTypeSelector(true)}
                  className="text-indigo-600 hover:text-indigo-500"
                >
                  Agregar primera pregunta
                </button>
              )}
            </div>
          ) : (
            section.questions.map((question, qIdx) => (
              <QuestionEditor
                key={question.id}
                question={question}
                readOnly={readOnly}
                onUpdate={onUpdateQuestion}
                onDelete={onDeleteQuestion}
                onDuplicate={(questionId) =>
                  onDuplicateQuestion(section.id, questionId)
                }
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

          {!readOnly && (
            <button
              onClick={() => setShowTypeSelector(true)}
              className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              + Agregar pregunta
            </button>
          )}
        </div>
      )}

      {confirmDelete && (
        <Modal
          open
          title="Eliminar sección"
          onClose={() => setConfirmDelete(false)}
        >
          <p className="pb-4 text-sm text-slate-600">
            Se eliminará la sección con todo su contenido ({section.questions.length}{" "}
            {section.questions.length === 1 ? "pregunta" : "preguntas"}). Esta
            acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                setConfirmDelete(false);
                onDelete(section.id);
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700"
            >
              Eliminar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
