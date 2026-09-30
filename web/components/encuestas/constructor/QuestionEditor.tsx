"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Copy } from "lucide-react";
import type { SurveyQuestionData, SurveyQuestionType } from "@/types/encuestas";
import { QUESTION_TYPE_LABELS, needsOptions } from "@/types/encuestas";
import { OptionEditor } from "./OptionEditor";
import { QuestionTypeSelector } from "./QuestionTypeSelector";

const PRESENTATION_OPTIONS: Partial<
  Record<SurveyQuestionType, { value: string; label: string }[]>
> = {
  opcion_unica: [
    { value: "normal", label: "Normal (radios)" },
    { value: "visual", label: "Visual (tarjetas con icono)" },
  ],
  seleccion_multiple: [
    { value: "normal", label: "Normal (casillas)" },
    { value: "visual", label: "Visual (tarjetas con icono)" },
  ],
  si_no: [
    { value: "normal", label: "Normal (interruptor segmentado)" },
    { value: "visual", label: "Visual (botones grandes)" },
  ],
  numero: [
    { value: "normal", label: "Normal (campo numérico)" },
    { value: "visual", label: "Visual (stepper)" },
  ],
  escala: [
    { value: "normal", label: "Segmentos numéricos" },
    { value: "stars", label: "Estrellas" },
    { value: "emojis", label: "Emojis" },
    { value: "slider", label: "Deslizador" },
  ],
};

function presentationValue(
  type: SurveyQuestionType,
  presentation: Record<string, unknown>
): string {
  if (type === "escala") {
    if (presentation.mode === "visual" && typeof presentation.style === "string") {
      return presentation.style;
    }
    return "normal";
  }
  return presentation.mode === "visual" ? "visual" : "normal";
}

interface Props {
  question: SurveyQuestionData;
  readOnly?: boolean;
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
  onDuplicate?: (questionId: string) => void;
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
  readOnly = false,
  onUpdate,
  onDelete,
  onDuplicate,
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

  const handleConfigChange = (key: string, value: unknown) => {
    onUpdate(question.id, {
      config: { ...question.config, [key]: value },
    });
  };

  const presentationChoices = PRESENTATION_OPTIONS[question.question_type];
  const currentPresentation = presentationValue(
    question.question_type,
    question.presentation
  );
  const isVisual =
    question.question_type === "escala"
      ? currentPresentation !== "normal"
      : currentPresentation === "visual";
  const optionIcons =
    question.presentation.option_icons &&
    typeof question.presentation.option_icons === "object"
      ? (question.presentation.option_icons as Record<string, string>)
      : {};

  const handlePresentationChange = (value: string) => {
    if (question.question_type === "escala") {
      if (value === "normal") {
        onUpdate(question.id, {
          presentation: { ...question.presentation, mode: "normal" },
        });
      } else {
        onUpdate(question.id, {
          presentation: { ...question.presentation, mode: "visual", style: value },
        });
      }
      return;
    }
    onUpdate(question.id, {
      presentation: { ...question.presentation, mode: value },
    });
  };

  const handleOptionIcon = (optionId: string, icon: string) => {
    onUpdate(question.id, {
      presentation: {
        ...question.presentation,
        option_icons: { ...optionIcons, [optionId]: icon },
      },
    });
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      {showTypeSelector && !readOnly && (
        <QuestionTypeSelector
          onSelect={(type) => onUpdate(question.id, { question_type: type })}
          onClose={() => setShowTypeSelector(false)}
        />
      )}

      <div className="px-4 py-3 flex items-center space-x-3">
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
            value={question.label}
            onChange={(e) => onUpdate(question.id, { label: e.target.value })}
            disabled={readOnly}
            className="block w-full text-sm font-medium text-slate-900 border-0 border-b border-transparent focus:border-indigo-500 focus:ring-0 p-0 bg-transparent disabled:opacity-70"
            placeholder="Etiqueta de la pregunta"
          />
        </div>

        <button
          onClick={() => !readOnly && setShowTypeSelector(true)}
          disabled={readOnly}
          className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded border border-slate-200 hover:border-slate-300 whitespace-nowrap disabled:opacity-60"
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
            disabled={readOnly}
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

        {!readOnly && (
          <button
            onClick={() => onDuplicate?.(question.id)}
            className="text-slate-400 hover:text-indigo-600 text-sm"
            title="Duplicar pregunta"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}

        {!readOnly && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-rose-400 hover:text-rose-600 text-sm"
            title="Eliminar pregunta"
          >
            ✕
          </button>
        )}
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
              disabled={readOnly}
              className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              placeholder="Descripción o ayuda para el encuestado"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Presentación
            </label>
            {presentationChoices ? (
              <select
                value={currentPresentation}
                onChange={(e) => handlePresentationChange(e.target.value)}
                disabled={readOnly}
                className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              >
                {presentationChoices.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-400">
                {question.question_type === "seleccion_opciones"
                  ? "Desplegable con búsqueda (automática cuando hay más de 8 opciones)."
                  : "Presentación fija para este tipo."}
              </p>
            )}
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
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
            </div>
          )}

          {question.question_type === "seleccion_multiple" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Mínimo a seleccionar
                </label>
                <input
                  type="number"
                  min={0}
                  value={(question.config.min_selected as number) ?? ""}
                  onChange={(e) =>
                    handleConfigChange(
                      "min_selected",
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                  placeholder="Sin límite"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Máximo a seleccionar
                </label>
                <input
                  type="number"
                  min={1}
                  value={(question.config.max_selected as number) ?? ""}
                  onChange={(e) =>
                    handleConfigChange(
                      "max_selected",
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                  placeholder="Sin límite"
                />
              </div>
            </div>
          )}

          {question.question_type === "fecha" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Fecha mínima
                </label>
                <input
                  type="date"
                  value={
                    typeof question.config.min_date === "string"
                      ? question.config.min_date
                      : ""
                  }
                  onChange={(e) =>
                    handleConfigChange("min_date", e.target.value || null)
                  }
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Fecha máxima
                </label>
                <input
                  type="date"
                  value={
                    typeof question.config.max_date === "string"
                      ? question.config.max_date
                      : ""
                  }
                  onChange={(e) =>
                    handleConfigChange("max_date", e.target.value || null)
                  }
                  disabled={readOnly}
                  className="block w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
                disabled={readOnly}
                className="block w-32 px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
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
                iconMap={isVisual ? optionIcons : undefined}
                onUpdateIcon={isVisual ? handleOptionIcon : undefined}
                disabled={readOnly}
              />
              {!readOnly && (
                <button
                  onClick={() => onAddOption(question.id)}
                  className="mt-2 ml-8 text-xs text-indigo-600 hover:text-indigo-500"
                >
                  + Agregar opción
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <Modal
          open
          title="Eliminar pregunta"
          onClose={() => setConfirmDelete(false)}
        >
          <p className="pb-4 text-sm text-slate-600">
            Se eliminará la pregunta y sus opciones. Esta acción no se puede
            deshacer.
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
                onDelete(question.id);
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
