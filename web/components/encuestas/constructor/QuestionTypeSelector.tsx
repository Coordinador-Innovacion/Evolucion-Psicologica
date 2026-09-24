"use client";

import { Modal } from "@/components/ui/modal";
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
    <Modal open onClose={onClose} title="Seleccionar tipo de pregunta">
      <div className="space-y-2">
        {TYPES.map((type) => (
          <button
            key={type}
            onClick={() => {
              onSelect(type);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-slate-700 rounded-md hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
          >
            {QUESTION_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
