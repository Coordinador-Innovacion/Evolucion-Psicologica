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

const WHITELIST = "('director', 'admin_ie', 'coordinador', 'psicologo', 'docente')";

describe("T68 — migración 052: RPCs de administración de personal", () => {
  const sql = mig("052_t68_admin_staff.sql");

  it("define los tres RPCs", () => {
    expect(sql).toContain("FUNCTION admin_create_staff(");
    expect(sql).toContain("FUNCTION admin_update_staff_role(");
    expect(sql).toContain("FUNCTION get_staff_list()");
  });

  it("los tres validan rol global server-side", () => {
    expect(sql).toContain("'Solo Global puede registrar personal'");
    expect(sql).toContain("'Solo Global puede modificar roles'");
    expect(sql).toContain("'Solo Global puede ver el personal'");
  });

  it("whitelist de roles institucionales sin 'global' y sin roles nuevos", () => {
    expect(sql).toContain(`p_role NOT IN ${WHITELIST}`);
    expect(sql).toContain(`p_new_role NOT IN ${WHITELIST}`);
    const createFn = sql.match(
      /CREATE OR REPLACE FUNCTION admin_create_staff\([\s\S]*?\$\$ LANGUAGE plpgsql/
    );
    expect(createFn?.[0]).not.toMatch(/NOT IN \([^)]*'global'/);
  });

  it("admin_update_staff_role no toca la I.E. (sin institution_id)", () => {
    const updateFn = sql.match(
      /CREATE OR REPLACE FUNCTION admin_update_staff_role\([\s\S]*?\$\$ LANGUAGE plpgsql/
    );
    expect(updateFn).toBeTruthy();
    expect(updateFn?.[0]).not.toContain("institution_id");
    expect(updateFn?.[0]).toContain("No se puede modificar el perfil Global");
  });

  it("admin_create_staff exige I.E. existente y contraseña >= 8", () => {
    expect(sql).toContain("'Institución no encontrada'");
    expect(sql).toContain("length(p_password) < 8");
    expect(sql).toContain("'El correo ya está registrado'");
  });

  it("identidad se crea en auth.users con bcrypt y el trigger resuelve el perfil", () => {
    expect(sql).toContain("INSERT INTO auth.users");
    expect(sql).toContain("INSERT INTO auth.identities");
    expect(sql).toContain("extensions.crypt(p_password, extensions.gen_salt('bf', 10))");
    expect(sql).toContain("UPDATE perfiles SET role = p_role WHERE user_id = v_uid");
  });

  it("REVOKE a PUBLIC/anon: el navegador solo vía authenticated", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION admin_create_staff");
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).toContain("TO authenticated");
  });

  it("auditoría de creación y cambio de rol", () => {
    expect(sql).toContain("'staff_create'");
    expect(sql).toContain("'staff_role_update'");
  });

  it("la migración NO modifica handle_new_user (registro público intacto)", () => {
    expect(sql).not.toContain("FUNCTION handle_new_user");
    expect(sql).toContain("handle_new_user (registro público) fue modificado");
  });
});

describe("T68 — regresión: registro público por código modular sin cambios", () => {
  const sql051 = mig("051_bootstrap_first_global_empty_code.sql");

  it("051 conserva whitelist docente y validación de código", () => {
    expect(sql051).toContain("v_role NOT IN ('docente')");
    expect(sql051).toContain("Código modular de I.E. obligatorio");
    expect(sql051).toContain("Código modular de I.E. no válido");
  });

  const authAction = web("lib/actions/auth.ts");

  it("signUp público sigue enviando institution_code y rol docente", () => {
    expect(authAction).toContain("institution_code: institutionCode");
    expect(authAction).toContain('role: "docente"');
  });
});

describe("T68 — frontend: página /personal", () => {
  const src = web("app/personal/page.tsx");

  it("acceso restringido a rol global", () => {
    expect(src).toContain('profile.role !== "global"');
    expect(src).toContain("Solo el rol Global puede administrar el personal.");
  });

  it("alta completa: I.E., rol, datos y contraseña", () => {
    expect(src).toContain('supabase.rpc("admin_create_staff"');
    expect(src).toContain("p_institution_id: newInstId");
    expect(src).toContain("p_role: newRole");
    expect(src).toContain("p_password: newPassword");
    expect(src).toContain("minLength={8}");
    expect(src).toContain('href="/instituciones"');
  });

  it("selector de rol no ofrece el rol global", () => {
    const roles = src.match(/const STAFF_ROLES = \[[\s\S]*?\] as const;/);
    expect(roles).toBeTruthy();
    expect(roles?.[0]).toContain('"docente"');
    expect(roles?.[0]).not.toContain('"global"');
  });

  it("cambio de rol solo envía usuario y rol (sin I.E.)", () => {
    const call = src.match(
      /rpc\("admin_update_staff_role", \{[\s\S]*?\}\)/
    );
    expect(call?.[0]).toContain("p_user_id: editTarget.user_id");
    expect(call?.[0]).toContain("p_new_role: editRole");
    expect(call?.[0]).not.toContain("p_institution");
    expect(src).toContain("La I.E. no se modifica desde esta pantalla.");
  });

  it("listado vía get_staff_list y sin edición de rol para global", () => {
    expect(src).toContain('supabase.rpc("get_staff_list")');
    expect(src).toContain('row.role !== "global"');
  });
});

describe("T68 — navegación", () => {
  it("HomeNav muestra Personal a global", () => {
    const nav = web("components/HomeNav.tsx");
    expect(nav).toContain('href="/personal"');
    expect(nav).toContain('profile?.role === "global"');
  });

  it("coordinador enlaza a /personal para global", () => {
    const coord = web("app/coordinador/page.tsx");
    expect(coord).toContain('href="/personal"');
  });
});
