/**
 * Tipos generados desde el esquema Supabase de Evolución Psicológica.
 * Fuente: migraciones 001-015 en supabase/migrations/
 * NO editar manualmente — regenerar desde las migraciones.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================================
// Enums de dominio (derivan de CHECK constraints en SQL)
// ============================================================

export type UserRole = "global" | "director" | "admin_ie" | "coordinador" | "docente" | "psicologo";

export type PeriodoTipo = "regular" | "retiro" | "retorno";

export type FamiliarType = "padre" | "madre" | "guardian";

export type SurveyQuestionType =
  | "texto_corto"
  | "texto_largo"
  | "opcion_unica"
  | "seleccion_multiple"
  | "si_no"
  | "numero"
  | "fecha"
  | "escala"
  | "seleccion_opciones";

export type SurveyStatus = "draft" | "published" | "closed";

export type ApplicationStatus =
  | "scheduled"
  | "active"
  | "extended"
  | "completed"
  | "closed"
  | "expired";

export type CasoEstado = "inicio" | "en_proceso" | "cerrado";

export type TransferenciaStatus = "pending" | "accepted" | "approved" | "rejected" | "completed";

export type PromocionLoteStatus =
  | "PREPARED"
  | "RUNNING"
  | "COMPLETED"
  | "COMPLETED_WITH_EXCEPTIONS"
  | "INTERRUPTED"
  | "FAILED";

export type PromocionAccionStatus = "pending" | "processed" | "error" | "excluded";

// ============================================================
// Database — schema "public"
// ============================================================

export interface Database {
  public: {
    Tables: {
      institutions: {
        Row: {
          id: string;
          name: string;
          code: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      niveles_educativos: {
        Row: {
          id: string;
          name: string;
          order_number: number;
          institution_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          order_number: number;
          institution_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          order_number?: number;
          institution_id?: string;
          created_at?: string;
        };
      };
      grados: {
        Row: {
          id: string;
          name: string;
          order_number: number;
          nivel_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          order_number: number;
          nivel_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          order_number?: number;
          nivel_id?: string;
          created_at?: string;
        };
      };
      estudiantes: {
        Row: {
          id: string;
          first_names: string;
          last_names: string;
          document_type: string;
          document_number: string;
          birth_date: string;
          birth_place: string | null;
          address: string | null;
          district: string | null;
          phone: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          first_names: string;
          last_names: string;
          document_type: string;
          document_number: string;
          birth_date: string;
          birth_place?: string | null;
          address?: string | null;
          district?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_names?: string;
          last_names?: string;
          document_type?: string;
          document_number?: string;
          birth_date?: string;
          birth_place?: string | null;
          address?: string | null;
          district?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      periodos_escolares: {
        Row: {
          id: string;
          student_id: string;
          institution_id: string;
          school_year: number;
          nivel_id: string;
          grado_id: string;
          section: string;
          start_date: string;
          end_date: string | null;
          tipo: PeriodoTipo;
          motivo_retiro: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          institution_id: string;
          school_year: number;
          nivel_id: string;
          grado_id: string;
          section: string;
          start_date: string;
          end_date?: string | null;
          tipo: PeriodoTipo;
          motivo_retiro?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          institution_id?: string;
          school_year?: number;
          nivel_id?: string;
          grado_id?: string;
          section?: string;
          start_date?: string;
          end_date?: string | null;
          tipo?: PeriodoTipo;
          motivo_retiro?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      familiares: {
        Row: {
          id: string;
          student_id: string;
          type: FamiliarType;
          full_name: string;
          document_type: string;
          document_number: string;
          phone: string | null;
          email: string | null;
          relationship: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          type: FamiliarType;
          full_name: string;
          document_type: string;
          document_number: string;
          phone?: string | null;
          email?: string | null;
          relationship?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          type?: FamiliarType;
          full_name?: string;
          document_type?: string;
          document_number?: string;
          phone?: string | null;
          email?: string | null;
          relationship?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      encuestas: {
        Row: {
          id: string;
          institution_id: string;
          title: string;
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          institution_id: string;
          title: string;
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          institution_id?: string;
          title?: string;
          description?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      encuesta_versiones: {
        Row: {
          id: string;
          survey_id: string;
          version_number: number;
          status: SurveyStatus;
          published_at: string | null;
          published_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          survey_id: string;
          version_number: number;
          status?: SurveyStatus;
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          survey_id?: string;
          version_number?: number;
          status?: SurveyStatus;
          published_at?: string | null;
          published_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      encuesta_secciones: {
        Row: {
          id: string;
          version_id: string;
          title: string;
          description: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          version_id: string;
          title: string;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          version_id?: string;
          title?: string;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      encuesta_preguntas: {
        Row: {
          id: string;
          section_id: string;
          question_type: SurveyQuestionType;
          label: string;
          description: string | null;
          is_required: boolean;
          sort_order: number;
          config: Json;
          presentation: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          section_id: string;
          question_type: SurveyQuestionType;
          label: string;
          description?: string | null;
          is_required?: boolean;
          sort_order?: number;
          config?: Json;
          presentation?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          section_id?: string;
          question_type?: SurveyQuestionType;
          label?: string;
          description?: string | null;
          is_required?: boolean;
          sort_order?: number;
          config?: Json;
          presentation?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      encuesta_opciones: {
        Row: {
          id: string;
          question_id: string;
          label: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          label: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          question_id?: string;
          label?: string;
          sort_order?: number;
          created_at?: string;
        };
      };
      encuesta_aplicaciones: {
        Row: {
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
          status: ApplicationStatus;
          progress: number;
          access_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          version_id: string;
          institution_id: string;
          respondent_student_id?: string | null;
          respondent_user_id?: string | null;
          year: number;
          section_name?: string | null;
          grade_id?: string | null;
          started_at: string;
          ends_at: string;
          extended_at?: string | null;
          extended_by?: string | null;
          status?: ApplicationStatus;
          progress?: number;
          access_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          version_id?: string;
          institution_id?: string;
          respondent_student_id?: string | null;
          respondent_user_id?: string | null;
          year?: number;
          section_name?: string | null;
          grade_id?: string | null;
          started_at?: string;
          ends_at?: string;
          extended_at?: string | null;
          extended_by?: string | null;
          status?: ApplicationStatus;
          progress?: number;
          access_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      encuesta_respuestas: {
        Row: {
          id: string;
          application_id: string;
          question_id: string;
          answer: Json | null;
          answered_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          question_id: string;
          answer?: Json | null;
          answered_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          question_id?: string;
          answer?: Json | null;
          answered_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      necesidades_especiales: {
        Row: {
          id: string;
          student_id: string;
          condition_type: string;
          clinical_description: string | null;
          teacher_orientation: string | null;
          certifying_entity: string | null;
          certification_date: string | null;
          document_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          condition_type: string;
          clinical_description?: string | null;
          teacher_orientation?: string | null;
          certifying_entity?: string | null;
          certification_date?: string | null;
          document_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          condition_type?: string;
          clinical_description?: string | null;
          teacher_orientation?: string | null;
          certifying_entity?: string | null;
          certification_date?: string | null;
          document_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      derivaciones: {
        Row: {
          id: string;
          student_id: string;
          derivation_date: string;
          school_period_id: string;
          derivador_nombre: string;
          derivador_cargo: string;
          registrador_id: string;
          motivo: string;
          resumen: string | null;
          acciones_previas: string | null;
          adjunto_url: string | null;
          caso_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          derivation_date?: string;
          school_period_id: string;
          derivador_nombre: string;
          derivador_cargo: string;
          registrador_id: string;
          motivo: string;
          resumen?: string | null;
          acciones_previas?: string | null;
          adjunto_url?: string | null;
          caso_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          derivation_date?: string;
          school_period_id?: string;
          derivador_nombre?: string;
          derivador_cargo?: string;
          registrador_id?: string;
          motivo?: string;
          resumen?: string | null;
          acciones_previas?: string | null;
          adjunto_url?: string | null;
          caso_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      casos: {
        Row: {
          id: string;
          student_id: string;
          situation: string;
          derivation_id: string | null;
          estado: CasoEstado;
          opened_at: string;
          closed_at: string | null;
          close_reason: string | null;
          current_responsible_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          situation: string;
          derivation_id?: string | null;
          estado?: CasoEstado;
          opened_at?: string;
          closed_at?: string | null;
          close_reason?: string | null;
          current_responsible_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          situation?: string;
          derivation_id?: string | null;
          estado?: CasoEstado;
          opened_at?: string;
          closed_at?: string | null;
          close_reason?: string | null;
          current_responsible_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      caso_responsables_historial: {
        Row: {
          id: string;
          caso_id: string;
          responsible_id: string;
          desde: string;
          hasta: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          caso_id: string;
          responsible_id: string;
          desde?: string;
          hasta?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          caso_id?: string;
          responsible_id?: string;
          desde?: string;
          hasta?: string | null;
          created_at?: string;
        };
      };
      atenciones: {
        Row: {
          id: string;
          caso_id: string;
          fecha: string;
          motivo: string;
          que_se_hizo: string;
          observaciones: string | null;
          compromisos: string | null;
          proxima_atencion: string | null;
          origen: string | null;
          created_by: string;
          created_at: string;
          edited_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          caso_id: string;
          fecha?: string;
          motivo: string;
          que_se_hizo: string;
          observaciones?: string | null;
          compromisos?: string | null;
          proxima_atencion?: string | null;
          origen?: string | null;
          created_by: string;
          created_at?: string;
          edited_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          caso_id?: string;
          fecha?: string;
          motivo?: string;
          que_se_hizo?: string;
          observaciones?: string | null;
          compromisos?: string | null;
          proxima_atencion?: string | null;
          origen?: string | null;
          created_by?: string;
          created_at?: string;
          edited_at?: string | null;
          updated_at?: string;
        };
      };
      transferencias: {
        Row: {
          id: string;
          caso_id: string;
          origin_institution_id: string;
          destination_institution_id: string;
          requested_by: string;
          authorized_by: string | null;
          status: TransferenciaStatus;
          transferred_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          caso_id: string;
          origin_institution_id: string;
          destination_institution_id: string;
          requested_by: string;
          authorized_by?: string | null;
          status?: TransferenciaStatus;
          transferred_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          caso_id?: string;
          origin_institution_id?: string;
          destination_institution_id?: string;
          requested_by?: string;
          authorized_by?: string | null;
          status?: TransferenciaStatus;
          transferred_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      licencias: {
        Row: {
          id: string;
          institution_id: string;
          start_date: string;
          end_date: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          institution_id: string;
          start_date: string;
          end_date: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          institution_id?: string;
          start_date?: string;
          end_date?: string;
          created_by?: string;
          created_at?: string;
        };
      };
      licencia_codigos: {
        Row: {
          id: string;
          license_id: string;
          code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          license_id: string;
          code: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          license_id?: string;
          code?: string;
          created_at?: string;
        };
      };
      lotes_promocion: {
        Row: {
          id: string;
          institution_id: string;
          origin_year: number;
          destination_year: number;
          started_by: string;
          started_at: string;
          completed_at: string | null;
          status: PromocionLoteStatus;
          counts: Json;
          idempotency_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          institution_id: string;
          origin_year: number;
          destination_year: number;
          started_by: string;
          started_at?: string;
          completed_at?: string | null;
          status?: PromocionLoteStatus;
          counts?: Json;
          idempotency_key: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          institution_id?: string;
          origin_year?: number;
          destination_year?: number;
          started_by?: string;
          started_at?: string;
          completed_at?: string | null;
          status?: PromocionLoteStatus;
          counts?: Json;
          idempotency_key?: string;
          created_at?: string;
        };
      };
      acciones_promocion: {
        Row: {
          id: string;
          batch_id: string;
          student_id: string;
          source_period_id: string;
          destination_period_id: string | null;
          automatic_result: string;
          final_result: string;
          status: PromocionAccionStatus;
          processed_at: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          student_id: string;
          source_period_id: string;
          destination_period_id?: string | null;
          automatic_result: string;
          final_result: string;
          status?: PromocionAccionStatus;
          processed_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          batch_id?: string;
          student_id?: string;
          source_period_id?: string;
          destination_period_id?: string | null;
          automatic_result?: string;
          final_result?: string;
          status?: PromocionAccionStatus;
          processed_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
      };
      excepciones_promocion: {
        Row: {
          id: string;
          action_id: string;
          automatic_result: string;
          final_result: string;
          motivo: string;
          usuario_id: string;
          fecha: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_id: string;
          automatic_result: string;
          final_result: string;
          motivo: string;
          usuario_id: string;
          fecha?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_id?: string;
          automatic_result?: string;
          final_result?: string;
          motivo?: string;
          usuario_id?: string;
          fecha?: string;
          created_at?: string;
        };
      };
      auditoria: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          table_name: string;
          record_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          table_name: string;
          record_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          table_name?: string;
          record_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
      documentos: {
        Row: {
          id: string;
          student_id: string;
          filename: string;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
          uploaded_by: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          filename: string;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
          uploaded_by: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          filename?: string;
          mime_type?: string;
          size_bytes?: number;
          storage_path?: string;
          uploaded_by?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      perfiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          document_number: string;
          role: UserRole;
          institution_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          document_number: string;
          role: UserRole;
          institution_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          document_number?: string;
          role?: UserRole;
          institution_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ============================================================
// Tipos de conveniencia
// ============================================================

/** Row completa de una tabla */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** Payload para INSERT */
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/** Payload para UPDATE */
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
