"use client";

import { QUESTION_TYPE_LABELS } from "@/types/encuestas";
import type { SurveyQuestionType } from "@/types/encuestas";

interface Props {
  onSelect: (type: SurveyQuestionType) => void;
  onClose: () => void;
}

const TYPES: SurveyQuestionType[] = [
  "texto_corto",
  "texto_largo",
  "opcion_unica",
  "seleccion_multiple",
  "si_no",
  "numero",
  "fecha",
  "escala",
  "seleccion_opciones",
];

export function QuestionTypeSelector({ onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Seleccionar tipo de pregunta
        </h3>
        <div className="space-y-2">
          {TYPES.map((type) => (
            <button
              key={type}
              onClick={() => {
                onSelect(type);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {QUESTION_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
