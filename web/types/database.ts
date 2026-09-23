/**
 * Tipos de dominio — re-exportados desde supabase.ts
 * Para uso en componentes y lógica de negocio.
 */
export type {
  UserRole,
  PeriodoTipo,
  FamiliarType,
  SurveyQuestionType,
  SurveyStatus,
  ApplicationStatus,
  CasoEstado,
  TransferenciaStatus,
  PromocionLoteStatus,
  PromocionAccionStatus,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./supabase";

export type { Database } from "./supabase";

// Tipos de conveniencia para las tablas más usadas
import type { Database } from "./supabase";

type Tables = Database["public"]["Tables"];

export type UserProfile = Tables["perfiles"]["Row"];
export type Institution = Tables["institutions"]["Row"];
export type NivelEducativo = Tables["niveles_educativos"]["Row"];
export type Grado = Tables["grados"]["Row"];
export type Estudiante = Tables["estudiantes"]["Row"];
export type PeriodoEscolar = Tables["periodos_escolares"]["Row"];
export type Familiar = Tables["familiares"]["Row"];
export type Encuesta = Tables["encuestas"]["Row"];
export type EncuestaVersion = Tables["encuesta_versiones"]["Row"];
export type EncuestaSeccion = Tables["encuesta_secciones"]["Row"];
export type EncuestaPregunta = Tables["encuesta_preguntas"]["Row"];
export type EncuestaOpcion = Tables["encuesta_opciones"]["Row"];
export type EncuestaAplicacion = Tables["encuesta_aplicaciones"]["Row"];
export type EncuestaRespuesta = Tables["encuesta_respuestas"]["Row"];
export type NecesidadEspecial = Tables["necesidades_especiales"]["Row"];
export type Derivacion = Tables["derivaciones"]["Row"];
export type Caso = Tables["casos"]["Row"];
export type CasoResponsableHistorial = Tables["caso_responsables_historial"]["Row"];
export type Atencion = Tables["atenciones"]["Row"];
export type Transferencia = Tables["transferencias"]["Row"];
export type Licencia = Tables["licencias"]["Row"];
export type LicenciaCodigo = Tables["licencia_codigos"]["Row"];
export type LotePromocion = Tables["lotes_promocion"]["Row"];
export type AccionPromocion = Tables["acciones_promocion"]["Row"];
export type ExcepcionPromocion = Tables["excepciones_promocion"]["Row"];
export type Auditoria = Tables["auditoria"]["Row"];
export type Documento = Tables["documentos"]["Row"];
