import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB = path.resolve(__dirname, "../..");
const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

function web(rel: string): string {
  return readFileSync(path.join(WEB, rel), "utf8");
}

function mig(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

describe("Global — listado de encuestas sin institución propia", () => {
  const src = web("hooks/useEncuestas.ts");

  it("load selecciona role y no temprano-corta sin institution_id", () => {
    expect(src).toContain('select("institution_id, role")');
    expect(src).toContain("profile?.role === \"global\"");
  });

  it("Global lista todas las encuestas vía RLS directo (sin RPC con NULL)", () => {
    expect(src).toMatch(
      /profile\?\.role === "global"[\s\S]*?from\("encuestas"\)[\s\S]*?encuesta_versiones\(status\)/
    );
    expect(src).toContain("institution_name: s.institutions?.name ?? null");
  });

  it("createSurvey acepta institutionId opcional (selector para Global)", () => {
    expect(src).toContain("institutionId?: string");
    expect(src).toContain("const targetInstitution = institutionId ?? profile?.institution_id");
    expect(src).toContain('"Seleccione una institución"');
    expect(src).toContain("p_institution_id: targetInstitution");
  });
});

describe("Global — /encuestas selector de I.E. al crear", () => {
  const src = web("app/encuestas/page.tsx");

  it("carga instituciones solo para global y las muestra en el modal", () => {
    expect(src).toContain("useInstitutions(\n    isGlobal === true\n  )");
    expect(src).toContain("{needsInstitution && (");
    expect(src).toContain("Institución educativa *");
  });

  it("envía la institución seleccionada y bloquea submit sin ella", () => {
    expect(src).toContain("newInstitutionId || undefined");
    expect(src).toContain(
      "(needsInstitution && !newInstitutionId)"
    );
  });

  it("lista muestra nombre de institución cuando existe", () => {
    expect(src).toContain("{survey.institution_name && (");
  });
});

describe("Global — /coordinador licencias y promoción", () => {
  const src = web("app/coordinador/page.tsx");

  it("monta ExpiringLicensesPanel (alerta global ≤30 días) solo para global", () => {
    expect(src).toContain(
      'import { ExpiringLicensesPanel } from "@/components/licencias/ExpiringLicensesPanel";'
    );
    expect(src).toContain("{isGlobal && <ExpiringLicensesPanel />}");
  });

  it("selector de I.E. habilita licencia y promoción para Global", () => {
    expect(src).toContain("selectedInstitutionId");
    expect(src).toContain(
      'profile.institution_id ??\n    (isGlobal && selectedInstitutionId ? selectedInstitutionId : null)'
    );
    expect(src).toContain('<LicenseAlert institutionId={institutionId} />');
    expect(src).toContain("<PromotionWizard");
    expect(src).toContain("institutionId && (");
  });
});

describe("Global — página /instituciones (RPCs T08)", () => {
  const src = web("app/instituciones/page.tsx");

  it("aceso restringido a rol global", () => {
    expect(src).toContain('profile.role !== "global"');
    expect(src).toContain("Solo el rol Global puede administrar instituciones.");
  });

  it("CRUD completo vía RPCs create/update/delete_institution", () => {
    expect(src).toContain('supabase.rpc("create_institution"');
    expect(src).toContain('supabase.rpc("update_institution"');
    expect(src).toContain('"delete_institution",');
    expect(src).toContain("p_institution_id");
    expect(src).toContain("refresh()");
  });
});

describe("Global — navegación", () => {
  const nav = web("components/HomeNav.tsx");

  it("HomeNav muestra Instituciones solo a global", () => {
    expect(nav).toContain('profile?.role === "global"');
    expect(nav).toContain('href="/instituciones"');
  });

  it("coordinador enlaza a /instituciones para global", () => {
    const coord = web("app/coordinador/page.tsx");
    expect(coord).toContain('href="/instituciones"');
  });
});

describe("Backend — invariante que sustenta el fix (sin cambios SQL)", () => {
  it("RLS: Global puede ver todas las encuestas", () => {
    const sql = mig("028_survey_rls.sql");
    expect(sql).toContain('CREATE POLICY "Global can view all surveys"');
    expect(sql).toContain('CREATE POLICY "Global can manage all surveys"');
  });

  it("create_survey permite a Global cualquier institución", () => {
    const sql = mig("029_survey_functions.sql");
    expect(sql).toMatch(
      /IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN/
    );
  });

  it("get_expiring_licenses es Global-only (por eso el panel va en Global)", () => {
    const sql = mig("045_t65_security_and_correctness_fixes.sql");
    expect(sql).toMatch(
      /get_expiring_licenses\(\)[\s\S]*?IS DISTINCT FROM 'global'/
    );
  });

  it("RPCs T08 existen y exigen rol global", () => {
    const sql = mig("020_institution_management.sql");
    expect(sql).toContain("FUNCTION create_institution(");
    expect(sql).toContain("FUNCTION update_institution(");
    expect(sql).toMatch(
      /create_institution[\s\S]*?v_user_role != 'global' THEN/
    );
  });
});
