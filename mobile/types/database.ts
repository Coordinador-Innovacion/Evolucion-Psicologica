/**
 * Tipos de dominio para la app móvil (Docente).
 * Re-exportados desde supabase.ts.
 * Solo incluye las tablas relevantes para Mobile:
 * - Derivaciones
 * - Necesidades Especiales (solo orientación informativa)
 */
export type {
  UserRole,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./supabase";

export type { Database } from "./supabase";

// Tipos de conveniencia
import type { Database } from "./supabase";

type Tables = Database["public"]["Tables"];

export type UserProfile = Tables["perfiles"]["Row"];
export type Estudiante = Tables["estudiantes"]["Row"];
export type NecesidadEspecial = Tables["necesidades_especiales"]["Row"];
export type Derivacion = Tables["derivaciones"]["Row"];
export type PeriodoEscolar = Tables["periodos_escolares"]["Row"];
