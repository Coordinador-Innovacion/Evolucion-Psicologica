"use client";

import { useState } from "react";
import type { SurveyQuestionData } from "@/types/encuestas";
import { QUESTION_TYPE_LABELS, needsOptions } from "@/types/encuestas";
import { OptionEditor } from "./OptionEditor";
import { QuestionTypeSelector } from "./QuestionTypeSelector";

interface Props {
  question: SurveyQuestionData;
  onUpdate: (
    questionId: string,
    updates: Partial<
      Pick<
        SurveyQuestionData,
        | "label"
        | "description"
        | "is_required"
        | "config"
        | "presentation"
        | "question_type"
      >
    >
  ) => void;
  onDelete: (questionId: string) => void;
  onAddOption: (questionId: string) => void;
  onUpdateOption: (optionId: string, label: string) => void;
  onDeleteOption: (optionId: string) => void;
  onReorderOptions: (questionId: string, orderedIds: string[]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function QuestionEditor({
  question,
  onUpdate,
  onDelete,
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

  const handleConfigChange = (key: string, value: unknown) => {
    onUpdate(question.id, {
      config: { ...question.config, [key]: value },
    });
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      {showTypeSelector && (
        <QuestionTypeSelector
          onSelect={(type) => onUpdate(question.id, { question_type: type })}
          onClose={() => setShowTypeSelector(false)}
        />
      )}

      <div className="px-4 py-3 flex items-center space-x-3">
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

        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={question.label}
            onChange={(e) => onUpdate(question.id, { label: e.target.value })}
            className="block w-full text-sm font-medium text-slate-900 border-0 border-b border-transparent focus:border-indigo-500 focus:ring-0 p-0 bg-transparent"
            placeholder="Etiqueta de la pregunta"
          />
        </div>

        <button
          onClick={() => setShowTypeSelector(true)}
          className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded border border-slate-200 hover:border-slate-300 whitespace-nowrap"
        >
          {QUESTION_TYPE_LABELS[question.question_type]}
        </button>

        <label className="flex items-center space-x-1 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={question.is_required}
            onChange={(e) =>
              onUpdate(question.id, { is_required: e.target.checked })
            }
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>Obligatoria</span>
        </label>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          {expanded ? "▾" : "▸"}
        </button>

        <button
          onClick={() => onDelete(question.id)}
          className="text-rose-400 hover:text-rose-600 text-sm"
          title="Eliminar pregunta"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Descripción (opcional)
            </label>
            <input
              type="text"
              value={question.description || ""}
              onChange={(e) =>
                onUpdate(question.id, {
                  description: e.target.value || null,
                })
              }
              className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Descripción o ayuda para el encuestado"
            />
          </div>

          {question.question_type === "escala" && (
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Mínimo
                </label>
                <input
                  type="number"
                  value={(question.config.min as number) ?? 1}
                  onChange={(e) =>
                    handleConfigChange("min", parseInt(e.target.value) || 1)
                  }
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Máximo
                </label>
                <input
                  type="number"
                  value={(question.config.max as number) ?? 5}
                  onChange={(e) =>
                    handleConfigChange("max", parseInt(e.target.value) || 5)
                  }
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Etiqueta mín.
                </label>
                <input
                  type="text"
                  value={(question.config.min_label as string) || ""}
                  onChange={(e) =>
                    handleConfigChange("min_label", e.target.value)
                  }
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ej: Nada"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Etiqueta máx.
                </label>
                <input
                  type="text"
                  value={(question.config.max_label as string) || ""}
                  onChange={(e) =>
                    handleConfigChange("max_label", e.target.value)
                  }
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ej: Mucho"
                />
              </div>
            </div>
          )}

          {question.question_type === "numero" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Mínimo
                </label>
                <input
                  type="number"
                  value={(question.config.min as number) ?? ""}
                  onChange={(e) =>
                    handleConfigChange(
                      "min",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Sin límite"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Máximo
                </label>
                <input
                  type="number"
                  value={(question.config.max as number) ?? ""}
                  onChange={(e) =>
                    handleConfigChange(
                      "max",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Sin límite"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Decimales
                </label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={(question.config.decimal_places as number) ?? 0}
                  onChange={(e) =>
                    handleConfigChange(
                      "decimal_places",
                      parseInt(e.target.value) || 0
                    )
                  }
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {(question.question_type === "texto_corto" ||
            question.question_type === "texto_largo") && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Longitud máxima
              </label>
              <input
                type="number"
                value={
                  (question.config.max_length as number) ??
                  (question.question_type === "texto_corto" ? 255 : 2000)
                }
                onChange={(e) =>
                  handleConfigChange(
                    "max_length",
                    parseInt(e.target.value) || 255
                  )
                }
                className="block w-32 px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {needsOptions(question.question_type) && (
            <div>
              <OptionEditor
                options={question.options}
                onUpdate={onUpdateOption}
                onDelete={onDeleteOption}
                onReorder={(ids) => onReorderOptions(question.id, ids)}
              />
              <button
                onClick={() => onAddOption(question.id)}
                className="mt-2 ml-8 text-xs text-indigo-600 hover:text-indigo-500"
              >
                + Agregar opción
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
