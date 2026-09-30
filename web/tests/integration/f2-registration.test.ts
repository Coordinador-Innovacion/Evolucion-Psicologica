import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F2 (parte ejecutable sin BD): verificación estática de la migración 053.
 * Cubre la Falla #1 (UI_GAP_AUDIT §E): registro transaccional de estudiantes,
 * verificación de documento, acciones de período y asignaciones docentes.
 * No sustituye E2E-01 con filas reales (requiere Supabase local).
 */

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

function mig(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

const sql = mig("053_f2_student_registration_and_academic.sql");

describe("F2 — migración 053: registro transaccional (Falla #1)", () => {
  it("define register_student_full en una sola transacción", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION register_student_full(");
    expect(sql).toContain("SECURITY DEFINER");
    // sub-entidades dentro de la misma función
    expect(sql).toMatch(/INSERT INTO periodos_escolares/);
    expect(sql).toMatch(/upsert_family_member\(/);
    expect(sql).toMatch(/INSERT INTO necesidades_especiales/);
    expect(sql).toMatch(/INSERT INTO auditoria/);
    // todo o nada: handler que revierte el bloque completo
    expect(sql).toMatch(/EXCEPTION[\s\S]*WHEN OTHERS THEN/);
  });

  it("register_student_full valida nivel/grado/sección y solape de período", () => {
    expect(sql).toContain("El nivel no pertenece a la institución");
    expect(sql).toContain("El grado no pertenece al nivel seleccionado");
    expect(sql).toContain("Sección inválida. Use A, B o U");
    expect(sql).toMatch(/WHEN exclusion_violation OR unique_violation THEN/);
  });

  it("register_student_full coincide con los roles de EST-02 (Docente excluido)", () => {
    expect(sql).toContain(
      "v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo')"
    );
    expect(sql).toContain("Solo el Psicólogo o Global registran necesidad especial");
    expect(sql).toContain("Su rol no puede registrar familiares en este flujo");
  });

  it("verify_student_document clasifica los 4 casos de EST-02 Paso 0", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION verify_student_document(");
    expect(sql).toContain("'status', 'new'");
    expect(sql).toContain("'status', 'active_own'");
    expect(sql).toContain("'status', 'active_other'");
    expect(sql).toContain("'status', 'inactive'");
    // sin exponer datos personales de la otra I.E.
    expect(sql).toMatch(
      /RETURN json_build_object\('success', true, 'status', 'active_other'\)/
    );
    // Docente excluido de la verificación
    expect(sql).toContain(
      "v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo')"
    );
  });

  it("las RPCs nuevas no son ejecutables por anónimos", () => {
    const revokes = sql.match(/REVOKE ALL ON FUNCTION [^;]+ FROM anon;/g) ?? [];
    expect(revokes.length).toBeGreaterThanOrEqual(9);
  });
});

describe("F2 — migración 053: acciones de período (EST-07)", () => {
  it("change_school_section cierra y abre en la misma transacción", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION change_school_section(");
    expect(sql).toMatch(
      /UPDATE periodos_escolares\s+SET end_date = v_new_start[\s\S]{0,400}INSERT INTO periodos_escolares/
    );
    expect(sql).toContain("'school_period_section_change'");
    // mismos permisos que gestión de períodos (sin Psicólogo)
    expect(sql).toContain(
      "v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador')"
    );
  });

  it("withdraw_student exige motivo y delega en close_school_period (023)", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION withdraw_student(");
    expect(sql).toContain("El motivo de retiro es obligatorio");
    expect(sql).toMatch(/close_school_period\(v_period\.id, v_end/);
  });

  it("register_return no duplica estudiante y usa tipo retorno", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION register_return(");
    expect(sql).toContain("El estudiante ya tiene un período activo");
    expect(sql).toMatch(/'tipo', 'retorno'|, 'retorno'\)/);
    expect(sql).toContain("'school_period_return'");
  });
});

describe("F2 — migración 053: estructura académica (ACA-*)", () => {
  it("create_academic_structure crea Primaria 1–6 y Secundaria 1–5", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION create_academic_structure(");
    expect(sql).toContain("ARRAY['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto']");
    expect(sql).toContain("'Primaria (1.º–6.º)'");
    expect(sql).toContain("'Secundaria (1.º–5.º)'");
    expect(sql).toContain(
      "v_user_role NOT IN ('global', 'director', 'admin_ie')"
    );
  });

  it("list_institution_docentes resuelve el hueco de SELECT de perfiles", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION list_institution_docentes(");
    expect(sql).toMatch(/FROM perfiles p\s+WHERE p\.institution_id = v_inst_target AND p\.role = 'docente'/);
  });

  it("crea la tabla asignaciones_docentes con índice activo y RLS", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS asignaciones_docentes (");
    expect(sql).toContain("WHERE end_date IS NULL");
    expect(sql).toContain("ALTER TABLE asignaciones_docentes ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      'CREATE POLICY "Institution members can view teaching assignments"'
    );
    expect(sql).toContain(
      'CREATE POLICY "Global and Directors can manage teaching assignments"'
    );
    // CHECK de secciones alineado con periodos_escolares (023)
    expect(sql).toContain("CONSTRAINT asignaciones_section_valid CHECK (section IN ('A', 'B', 'U'))");
  });

  it("CRUD de asignaciones con validación y auditoría", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION create_teaching_assignment(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION close_teaching_assignment(");
    expect(sql).toContain("El usuario no es docente de esta institución");
    expect(sql).toContain("'teaching_assignment_create'");
    expect(sql).toContain("'teaching_assignment_close'");
  });

  it("verificación de integridad al final de la migración", () => {
    expect(sql).toContain("RAISE EXCEPTION 'Error: RPCs de F2 incompletas");
    expect(sql).toContain("asignaciones_docentes no fue creada");
  });
});
