import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mig = (name: string) =>
  readFileSync(join(__dirname, "../../../supabase/migrations", name), "utf8");

describe("T67 — registro docente + bootstrap Global", () => {
  const sql050 = mig("050_t67_auth_registration_bootstrap.sql");
  const sql051 = mig("051_bootstrap_first_global_empty_code.sql");
  const sql049 = mig("049_t66_bootstrap_promotion_security.sql");
  const sql045 = mig("045_t65_security_and_correctness_fixes.sql");
  const authTs = readFileSync(
    join(__dirname, "../../lib/actions/auth.ts"),
    "utf8"
  );
  const registro = readFileSync(
    join(__dirname, "../../app/auth/registro/page.tsx"),
    "utf8"
  );

  it("lookup_institution_by_code existe y es SECURITY DEFINER", () => {
    expect(sql050).toContain(
      "CREATE OR REPLACE FUNCTION lookup_institution_by_code"
    );
    expect(sql050).toContain("SECURITY DEFINER");
    expect(sql050).toContain(
      "GRANT EXECUTE ON FUNCTION lookup_institution_by_code"
    );
  });

  it("handle_new_user exige institution_code y set institution_id server-side", () => {
    expect(sql050).toContain("Código modular de I.E. obligatorio");
    expect(sql050).toContain("Código modular de I.E. no válido");
    expect(sql050).toContain("institution_id");
    expect(sql050).toContain("v_role NOT IN ('docente')");
  });

  it("claim_first_global se mantiene pero REVOKE desde anon/authenticated", () => {
    expect(sql049).toContain("CREATE OR REPLACE FUNCTION claim_first_global()");
    expect(sql050).toContain(
      "REVOKE EXECUTE ON FUNCTION claim_first_global() FROM anon"
    );
    expect(sql050).toContain(
      "REVOKE EXECUTE ON FUNCTION claim_first_global() FROM authenticated"
    );
    expect(sql050).toContain(
      "has_function_privilege('authenticated'"
    );
  });

  it("signup solo envía role docente + institution_code; emailRedirectTo dinámico", () => {
    expect(authTs).toContain('role: "docente"');
    expect(authTs).toContain("institution_code");
    expect(authTs).toContain("emailRedirectTo");
    expect(authTs).toContain("getAppOrigin");
    expect(authTs).not.toMatch(/localhost:3000/);
  });

  it("registro UI: paso código modular → confirmación → datos", () => {
    expect(registro).toContain("lookup_institution_by_code");
    expect(registro).toContain("Confirmar I.E.");
    expect(registro).toContain('name="institution_code"');
    expect(registro).toContain('name="full_name"');
  });

  it("recuperación estándar Supabase Auth presente", () => {
    expect(authTs).toContain("resetPasswordForEmail");
    expect(authTs).toContain("updateUser");
  });

  it("045 sigue forzando docente en whitelist (doble barrera)", () => {
    expect(sql045).toContain("IF v_role NOT IN ('docente') THEN");
  });

  it("051: sin código + sin Global → primer global; con Global → error igual", () => {
    expect(sql051).toContain("FROM perfiles WHERE role = 'global'");
    expect(sql051).toContain("'global',");
    expect(sql051).toContain("NULL");
    expect(sql051).toContain("RAISE EXCEPTION 'Código modular de I.E. obligatorio'");
    expect(sql051).toContain("v_role NOT IN ('docente')");
    expect(sql051).toContain("Código modular de I.E. no válido");
  });
});
