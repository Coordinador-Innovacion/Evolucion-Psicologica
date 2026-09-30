"use client";

import { Modal } from "@/components/ui/modal";
import { QUESTION_TYPE_LABELS } from "@/types/encuestas";
import type { SurveyQuestionType } from "@/types/encuestas";
import type { ElementType } from "react";
import {
  AlignLeft,
  CalendarDays,
  CircleDot,
  Hash,
  List,
  ListChecks,
  Star,
  ToggleLeft,
  Type,
} from "lucide-react";

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

const ICONS: Record<SurveyQuestionType, ElementType> = {
  texto_corto: Type,
  texto_largo: AlignLeft,
  opcion_unica: CircleDot,
  seleccion_multiple: ListChecks,
  si_no: ToggleLeft,
  numero: Hash,
  fecha: CalendarDays,
  escala: Star,
  seleccion_opciones: List,
};

const HINTS: Record<SurveyQuestionType, string> = {
  texto_corto: "Una palabra o frase corta",
  texto_largo: "Párrafo con varias líneas",
  opcion_unica: "Elige una sola opción",
  seleccion_multiple: "Elige varias opciones",
  si_no: "Respuesta sí o no",
  numero: "Solo números",
  fecha: "Un día del calendario",
  escala: "Del 1 al 5 (estrellas o números)",
  seleccion_opciones: "Menú desplegable",
};

export function QuestionTypeSelector({ onSelect, onClose }: Props) {
  return (
    <Modal open onClose={onClose} title="Seleccionar tipo de pregunta">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {TYPES.map((type) => {
          const Icon = ICONS[type];
          return (
            <button
              key={type}
              onClick={() => {
                onSelect(type);
                onClose();
              }}
              className="flex flex-col items-start gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50"
            >
              <span className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {QUESTION_TYPE_LABELS[type]}
                </span>
              </span>
              <span className="text-xs text-slate-500">{HINTS[type]}</span>
            </button>
          );
        })}
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
