import type { SurveyQuestionType } from "./supabase";

export type { SurveyQuestionType, SurveyStatus } from "./supabase";

export interface SurveySectionData {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  questions: SurveyQuestionData[];
}

export interface SurveyQuestionData {
  id: string;
  section_id: string;
  question_type: SurveyQuestionType;
  label: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  config: Record<string, unknown>;
  presentation: Record<string, unknown>;
  options: SurveyOptionData[];
}

export interface SurveyOptionData {
  id: string;
  question_id: string;
  label: string;
  sort_order: number;
}

export interface SurveyDetail {
  id: string;
  title: string;
  description: string | null;
  institution_id: string;
  created_at: string;
  version_id: string;
  version_number: number;
  status: string;
}

export interface SurveyListItem {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  version_count: number;
  published_versions: number;
  institution_name?: string | null;
}

export interface SurveyVersionItem {
  id: string;
  version_number: number;
  status: string;
  published_at: string | null;
  created_at: string;
  application_count: number;
  response_count: number;
}

export interface SurveyApplicationItem {
  id: string;
  version_id: string;
  institution_id: string;
  respondent_student_id: string | null;
  respondent_user_id: string | null;
  year: number;
  section_name: string | null;
  grade_id: string | null;
  started_at: string;
  ends_at: string;
  extended_at: string | null;
  extended_by: string | null;
  status: string;
  progress: number;
  access_token: string | null;
  created_at: string;
  updated_at: string;
}

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  scheduled: "Programada",
  active: "Activa",
  extended: "Ampliada",
  completed: "Completada",
  closed: "Cerrada",
  expired: "Vencida",
};

export const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  texto_corto: "Texto corto",
  texto_largo: "Texto largo",
  opcion_unica: "Opción única",
  seleccion_multiple: "Selección múltiple",
  si_no: "Sí / No",
  numero: "Número",
  fecha: "Fecha",
  escala: "Escala",
  seleccion_opciones: "Selección desde opciones",
};

export const QUESTION_TYPES_WITH_OPTIONS: SurveyQuestionType[] = [
  "opcion_unica",
  "seleccion_multiple",
  "seleccion_opciones",
];

export function needsOptions(type: SurveyQuestionType): boolean {
  return QUESTION_TYPES_WITH_OPTIONS.includes(type);
}

export function createDefaultConfig(
  type: SurveyQuestionType
): Record<string, unknown> {
  switch (type) {
    case "escala":
      return { min: 1, max: 5, min_label: "Mínimo", max_label: "Máximo" };
    case "numero":
      return { min: null, max: null, decimal_places: 0 };
    case "texto_corto":
      return { max_length: 255 };
    case "texto_largo":
      return { max_length: 2000 };
    case "seleccion_opciones":
      return { allow_multiple: false };
    default:
      return {};
  }
}

export function createDefaultPresentation(): Record<string, unknown> {
  return { width: "full" };
}
