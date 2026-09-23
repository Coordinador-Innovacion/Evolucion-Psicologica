import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T60 (parte ejecutable sin BD): verificación estática de políticas RLS
 * en migraciones. Comprueba aislamiento institucional, roles y permisos
 * según SPECIFY/PLAN/DECISIONES — no sustituye allow/deny en vivo
 * (ver supabase/tests/rls_allow_deny.sql para entorno con Supabase).
 */

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

function mig(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

describe("RLS estático — casos/atenciones (aislamiento institucional)", () => {
  const sql = mig("036_case_rls_institution_scope.sql");

  it("política de casos exige psicologo + institución vía periodos_escolares", () => {
    expect(sql).toContain(
      'CREATE POLICY "Psychologist can manage cases in their institution"'
    );
    expect(sql).toMatch(
      /get_user_role\(\) = 'psicologo'[\s\S]*institution_id = get_user_institution\(\)/
    );
    expect(sql).not.toContain(
      'CREATE POLICY "Psychologist can manage cases"\n    ON casos'
    );
  });

  it("política de atenciones acota por caso → estudiante → institución", () => {
    expect(sql).toContain(
      'CREATE POLICY "Psychologist can manage attentions in their institution"'
    );
    expect(sql).toMatch(
      /caso_id IN \([\s\S]*periodos_escolares[\s\S]*institution_id = get_user_institution\(\)/
    );
  });

  it("historial de responsables también acotado", () => {
    expect(sql).toContain(
      'CREATE POLICY "Psychologist can manage case history in their institution"'
    );
  });
});

describe("RLS estático — documentos (roles y aislamiento)", () => {
  const sql = mig("037_document_access_role_scope.sql");

  it("SELECT de documentos restringido a roles documentales (sin docente)", () => {
    expect(sql).toContain('CREATE POLICY "Authorized roles can view documents"');
    expect(sql).toMatch(
      /get_user_role\(\) IN \('director', 'admin_ie', 'coordinador', 'psicologo'\)/
    );
    expect(sql).not.toMatch(
      /Authorized roles can view documents[\s\S]{0,400}docente/
    );
  });

  it("get_document_url verifica rol antes de firmar", () => {
    expect(sql).toContain(
      "IF v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN"
    );
    expect(sql).toContain("storage.sign('documentos'");
    expect(sql).not.toContain("storage.sign('documentos', v_doc.storage_path, 0)");
  });

  it("list_student_documents verifica rol e institución", () => {
    expect(sql).toContain(
      "IF v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN"
    );
    expect(sql).toMatch(/periodos_escolares[\s\S]*institution_id = v_user_institution/);
  });
});

describe("RLS estático — registro de estudiantes (S14 + INSERT)", () => {
  const sql = mig("039_students_registration_rls_fix.sql");

  it("INSERT permite psicologo (SPECIFY S14)", () => {
    expect(sql).toContain('CREATE POLICY "Authorized roles can insert students"');
    expect(sql).toMatch(
      /FOR INSERT[\s\S]*get_user_role\(\) IN \('director', 'admin_ie', 'coordinador', 'psicologo'\)/
    );
  });

  it("INSERT no exige id en periodos_escolares en WITH CHECK", () => {
    const insertPolicy = sql.slice(
      sql.indexOf('CREATE POLICY "Authorized roles can insert students"'),
      sql.indexOf('CREATE POLICY "Coordinator and Director can update')
    );
    expect(insertPolicy).not.toContain("periodos_escolares");
  });

  it("create_student incluye psicologo en roles", () => {
    expect(sql).toContain(
      "'global', 'director', 'admin_ie', 'coordinador', 'psicologo'"
    );
  });

  it("UPDATE/DELETE de estudiantes excluye psicologo y acota institución", () => {
    expect(sql).toMatch(
      /FOR UPDATE[\s\S]*periodos_escolares[\s\S]*institution_id = get_user_institution\(\)/
    );
    expect(sql).not.toMatch(
      /FOR UPDATE[\s\S]{0,300}'psicologo'/
    );
  });
});

describe("RLS estático — encuestas (docente no gestiona)", () => {
  const sql = mig("028_survey_rls.sql");

  it("can_manage_surveys excluye docente", () => {
    expect(sql).toContain(
      "get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')"
    );
    expect(sql).not.toMatch(
      /can_manage_surveys[\s\S]{0,200}'docente'/
    );
  });

  it("gestión de encuestas de institución usa can_manage_surveys + institution_id", () => {
    expect(sql).toMatch(
      /Authorized roles can manage institution surveys[\s\S]*can_manage_surveys\(\)[\s\S]*institution_id = get_user_institution\(\)/
    );
  });
});

describe("RLS estático — licencias (server-side)", () => {
  const sql = mig("032_licenses.sql");

  it("get_license_status deriva estado por fechas", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION get_license_status");
    expect(sql).toContain("'expiring_soon'");
    expect(sql).toContain("'expired'");
    expect(sql).toContain("'scheduled'");
  });

  it("can_create_attention bloquea solo nuevas atenciones con licencia vencida (DC-003)", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION can_create_attention");
    expect(sql).toContain("Las nuevas atenciones psicológicas están bloqueadas");
  });

  it("create_attention valida licencia en servidor", () => {
    expect(sql).toMatch(/can_create_attention\(/);
    expect(sql).toContain("SECURITY DEFINER");
  });
});

describe("RLS estático — promoción (roles y aislamiento)", () => {
  const sql = mig("033_promotion.sql");

  it("preview_promotion solo roles global|director|admin_ie|coordinador", () => {
    expect(sql).toContain(
      "v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador')"
    );
  });

  it("preview_promotion acota institución para no-global", () => {
    expect(sql).toContain(
      "IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN"
    );
  });

  it("map_grade marca egreso en último grado", () => {
    expect(sql).toContain("'is_egreso', true");
    expect(sql).toContain("Egreso");
  });
});

describe("RLS estático — helper de rol global", () => {
  const sql = mig("014_rls_policies.sql");

  it("get_user_role e is_global_user definidos", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION get_user_role()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION is_global_user()");
    expect(sql).toContain("get_user_role() = 'global'");
  });
});
