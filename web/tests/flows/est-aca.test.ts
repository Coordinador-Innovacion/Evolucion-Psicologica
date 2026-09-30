import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, can } from "@/lib/permissions";

/**
 * F2 — EST-01..09 + ACA-01..03 (cierra la Falla #1 del UI_GAP_AUDIT).
 * Verificación estática: migración 053 + fuentes de las pantallas.
 * No sustituye el e2e con filas reales (pendiente sin BD).
 */

const ROOT = path.resolve(__dirname, "../../..");
const WEB = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}
function web(rel: string): string {
  return readFileSync(path.join(WEB, rel), "utf8");
}

const sql053 = read("supabase/migrations/053_f2_student_registration_and_academic.sql");

describe("F2 — migración 053: registro transaccional de estudiantes", () => {
  it("expone verify_student_document para el paso 0 del wizard", () => {
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION verify_student_document");
    expect(sql053).toContain("REVOKE ALL ON FUNCTION verify_student_document");
  });

  it("register_student_full crea estudiante + período + familia + necesidad en una sola RPC", () => {
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION register_student_full");
    for (const param of [
      "p_document_type VARCHAR",
      "p_school_year INTEGER DEFAULT NULL",
      "p_grado_id UUID DEFAULT NULL",
      "p_father JSONB DEFAULT NULL",
      "p_mother JSONB DEFAULT NULL",
      "p_guardian JSONB DEFAULT NULL",
      "p_special_need JSONB DEFAULT NULL",
    ]) {
      expect(sql053).toContain(param);
    }
    // todo-o-nada: handler externo revierte el bloque completo (EST-02 paso 7)
    expect(sql053).toMatch(/EXCEPTION\s+-- Todo o nada \(SPECIFY EST-02 paso 7\)/);
    expect(sql053).toContain("WHEN OTHERS THEN");
    expect(sql053).toContain("register_student_full");
    expect(sql053).toContain("'source', 'register_student_full'");
  });

  it("register_student_full no amplía permisos: familia = G,D,A,C y necesidad = G,P", () => {
    expect(sql053).toMatch(
      /v_family_allowed[\s\S]{0,220}IN \('global', 'director', 'admin_ie', 'coordinador'\)/
    );
    expect(sql053).toMatch(
      /v_need_allowed[\s\S]{0,180}IN \('global', 'psicologo'\)/
    );
    // secciones válidas (023)
    expect(sql053).toMatch(/TRIM\(p_section\) NOT IN \('A', 'B', 'U'\)/);
  });

  it("retorno/retorno no duplica estudiantes (solo abre período si ya existe)", () => {
    // rama existente: valida y actualiza opcionales, sin INSERT de estudiantes
    const start = sql053.indexOf("IF v_student_id IS NOT NULL THEN");
    const elseIdx = sql053.indexOf("ELSE", start);
    const insertIdx = sql053.indexOf("INSERT INTO estudiantes");
    expect(start).toBeGreaterThan(0);
    expect(elseIdx).toBeGreaterThan(start);
    expect(insertIdx).toBeGreaterThan(elseIdx);
    expect(sql053.slice(start, elseIdx)).not.toContain("INSERT INTO estudiantes");

    // el retorno propiamente dicho (EST-07) es una RPC aparte, sin crear estudiantes
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION register_return");
    expect(sql053.slice(sql053.indexOf("CREATE OR REPLACE FUNCTION register_return")))
      .not.toContain("INSERT INTO estudiantes");
  });

  it("EST-07 usa las tres RPCs de período desde la UI", () => {
    const actions = web("components/estudiantes/PeriodActions.tsx");
    expect(actions).toContain('rpc("change_school_section"');
    expect(actions).toContain('rpc("withdraw_student"');
    expect(actions).toContain('rpc("register_return"');
    expect(actions).toContain("motivo");
  });

  it("change_school_section cierra y abre en la misma transacción", () => {
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION change_school_section");
    expect(sql053).toMatch(
      /change_school_section[\s\S]{0,4000}INSERT INTO periodos_escolares/
    );
    expect(sql053).toContain("v_period.section");
  });

  it("withdraw_student exige motivo y delega el cierre a close_school_period", () => {
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION withdraw_student");
    expect(sql053).toMatch(/p_motivo IS NULL OR TRIM\(p_motivo\) = ''/);
    expect(sql053).toContain("close_school_period(v_period.id, v_end, TRIM(p_motivo))");
  });

  it("register_return valida período sin solapamiento antes de abrir", () => {
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION register_return");
    expect(sql053).toMatch(/end_date IS NULL[\s\S]{0,200}RETURN json_build_object\('success', false/);
  });

  it("nadie anónimo puede invocar las RPCs nuevas", () => {
    expect(sql053).toMatch(
      /REVOKE ALL ON FUNCTION register_student_full\([^)]*\) FROM anon/
    );
    expect(sql053).toMatch(
      /REVOKE ALL ON FUNCTION create_academic_structure\(UUID\) FROM anon/
    );
    expect(sql053).toMatch(
      /REVOKE ALL ON FUNCTION list_institution_docentes\(UUID\) FROM anon/
    );
  });
});

describe("F2 — estructura académica (ACA) en la migración 053", () => {
  it("create_academic_structure es idempotente (Primaria 1–6, Secundaria 1–5)", () => {
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION create_academic_structure");
    expect(sql053).toContain("WHERE institution_id = v_inst_target AND LOWER(name) = 'primaria'");
    expect(sql053).toContain("WHERE institution_id = v_inst_target AND LOWER(name) = 'secundaria'");
    expect(sql053).toContain("'Primaria (1.º–6.º)'");
    expect(sql053).toContain("'Secundaria (1.º–5.º)'");
    expect(sql053).toContain("La estructura base ya existe");
  });

  it("create_academic_structure solo G, D, A", () => {
    expect(sql053).toMatch(
      /v_user_role NOT IN \('global', 'director', 'admin_ie'\)[\s\S]{0,120}No tiene permisos para configurar/
    );
  });

  it("list_institution_docentes lista perfiles docente de la I.E. (hueco Admin I.E.)", () => {
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION list_institution_docentes");
    expect(sql053).toContain("p.role = 'docente'");
    expect(sql053).toMatch(/'full_name', p\.full_name/);
  });

  it("asignaciones_docentes existe con RLS, índice único activo y CHECK de sección", () => {
    expect(sql053).toContain("CREATE TABLE IF NOT EXISTS asignaciones_docentes");
    expect(sql053).toContain("CREATE UNIQUE INDEX IF NOT EXISTS asignaciones_docentes_active_key");
    expect(sql053).toContain("WHERE end_date IS NULL");
    expect(sql053).toContain("CONSTRAINT asignaciones_section_valid CHECK (section IN ('A', 'B', 'U'))");
    expect(sql053).toContain("ALTER TABLE asignaciones_docentes ENABLE ROW LEVEL SECURITY");
    expect(sql053).toMatch(/CREATE POLICY "Institution members can view teaching assignments"/);
    expect(sql053).toMatch(/CREATE POLICY "Global and Directors can manage teaching assignments"/);
  });

  it("asignaciones: crear y cerrar vía RPC con auditoría", () => {
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION create_teaching_assignment");
    expect(sql053).toContain("CREATE OR REPLACE FUNCTION close_teaching_assignment");
    expect(sql053).toContain("'teaching_assignment_close', 'asignaciones_docentes'");
  });
});

describe("F2 — ficha EST-04..09 (UI)", () => {
  const ficha = web("app/estudiantes/[id]/page.tsx");
  const tabs = web("components/estudiantes/StudentTabs.tsx");

  it("la ficha declara los 10 tabs del spec", () => {
    for (const label of [
      "Resumen",
      "Datos",
      "Familia",
      "Períodos",
      "Casos",
      "Derivaciones",
      "Necesidad especial",
      "Encuestas",
      "Documentos",
      "Historial",
    ]) {
      expect(tabs).toContain(label);
    }
    expect(ficha).toContain('id: "resumen"');
    expect(ficha).toContain('id: "historial"');
  });

  it("carga períodos por RPC y actives por periodo end_date nulo", () => {
    expect(ficha).toContain('rpc("get_student_periods"');
    expect(ficha).toContain('.is("end_date", null)');
  });

  it("necesidades especiales: clínica solo Global/Psicólogo; docente usa vista segura", () => {
    expect(ficha).toMatch(/role === "global" \|\| role === "psicologo"/);
    expect(ficha).toContain('from("necesidades_especiales")');
    expect(ficha).toContain('from("v_necesidades_docente")');
    // el docente nunca consulta la tabla clínica
    const docenteBranch = ficha.slice(
      ficha.indexOf('} else if (role === "docente") {'),
      ficha.indexOf("let atencionesCount")
    );
    expect(docenteBranch).not.toContain('from("necesidades_especiales")');
    expect(docenteBranch).toContain('from("v_necesidades_docente")');
  });

  it("acciones de período (cambio/retiro/retorno) según permiso estudiantes.periodos", () => {
    expect(ficha).toContain('"estudiantes.periodos"');
    expect(ficha).toContain("Cambiar de sección");
    expect(ficha).toContain("Retirar");
    expect(ficha).toContain("Registrar retorno");
    expect(ficha).toContain("PeriodActions");
  });

  it("editar datos (EST-05) exige estudiantes.editar", () => {
    expect(ficha).toContain('"estudiantes.editar"');
    expect(ficha).toContain("EditStudentDrawer");
  });

  it("familia (EST-06) guarda vía upsert_family_member con relación del guardián", () => {
    expect(tabs).toContain('rpc("upsert_family_member"');
    expect(tabs).toContain("Reasignar guardián");
    expect(tabs).toContain("p_relationship");
    expect(ficha).toContain('"estudiantes.familia"');
  });

  it("documentos (EST-08) sin botón de eliminar", () => {
    const docs = web("components/documentos/StudentDocumentsPanel.tsx");
    expect(docs).toContain("canDelete={false}");
    expect(docs).not.toContain("Eliminar el documento");
    expect(docs).not.toMatch(/await remove\(/);
    // exports de acceso intactos (tests de permisos existentes)
    expect(docs).toContain("export const DOCUMENT_ROLES");
    expect(docs).toContain("export function canAccessDocuments");
  });

  it("encuestas del estudiante se listan con embed de versión", () => {
    expect(ficha).toContain('from("encuesta_aplicaciones")');
    expect(ficha).toContain("version_id(version_number, encuestas(title))");
  });
});

describe("F2 — pantallas ACA-01..03 (UI)", () => {
  it("ACA-01 niveles: estructura base por RPC y grados en solo lectura", () => {
    const page = web("app/academico/niveles/page.tsx");
    expect(page).toContain('rpc("create_academic_structure"');
    expect(page).toContain("Grados fijos — solo lectura.");
    expect(page).toContain('from("niveles_educativos")');
    expect(page).toContain('"academico.gestionar"');
  });

  it("ACA-02 asignaciones: crear/cerrar y listar docentes por RPC", () => {
    const page = web("app/academico/asignaciones/page.tsx");
    expect(page).toContain('rpc("create_teaching_assignment"');
    expect(page).toContain('rpc("close_teaching_assignment"');
    expect(page).toContain('rpc("list_institution_docentes"');
    expect(page).toContain('from("asignaciones_docentes")');
    expect(page).toContain('"academico.gestionar"');
  });

  it("ACA-03 nómina: período activo (end_date nulo) con embed de estudiante", () => {
    const page = web("app/academico/secciones/page.tsx");
    expect(page).toContain('from("periodos_escolares")');
    expect(page).toContain('.is("end_date", null)');
    expect(page).toContain("estudiantes(id, first_names, last_names, document_number)");
    expect(page).toContain("Sección");
  });
});

describe("F2 — navegación y permisos", () => {
  const nav = web("components/layout/nav.ts");

  it("nav: Estudiantes apunta a la lista con capacidad consultar", () => {
    const block = nav.match(
      /href: "\/estudiantes",((?:(?!href:)[\s\S])*)/
    )?.[1];
    expect(block).toBeTruthy();
    expect(block).toContain('capability: "estudiantes.consultar"');
    expect(block).not.toContain("roles:");
  });

  it("nav: Académico visible con academico.gestionar", () => {
    const block = nav.match(
      /href: "\/academico\/niveles",((?:(?!href:)[\s\S])*)/
    )?.[1];
    expect(block).toBeTruthy();
    expect(block).toContain('capability: "academico.gestionar"');
    expect(block).toContain('icon: "calendar"');
  });

  it("permisos: academico.gestionar = Global, Director, Admin I.E.", () => {
    expect([...CAPABILITIES["academico.gestionar"]]).toEqual([
      "global",
      "director",
      "admin_ie",
    ]);
    expect(can("docente", "academico.gestionar")).toBe(false);
    expect(can("coordinador", "academico.gestionar")).toBe(false);
  });

  it("permisos: consulta de estudiantes para todos; registro/docente excluido", () => {
    expect(can("docente", "estudiantes.consultar")).toBe(true);
    expect(can("docente", "estudiantes.registro")).toBe(false);
    expect(can("docente", "estudiantes.periodos")).toBe(false);
    expect(can("psicologo", "estudiantes.periodos")).toBe(false);
    expect(can("coordinador", "estudiantes.periodos")).toBe(true);
  });
});
