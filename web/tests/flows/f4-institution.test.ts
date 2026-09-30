import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

/**
 * F4 — IE-01..06, LIC-01..05, USR-01..03 (cierra la Falla #3 del
 * UI_GAP_AUDIT: "create_institution solo recibía name+code sin niveles ni
 * licencia").
 * Verificación estática: migración 055 + fuentes de las pantallas.
 * No sustituye el e2e con filas reales (pendiente sin BD) — E2E-02 §8.
 */

const ROOT = path.resolve(__dirname, "../../..");
const WEB = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}
function web(rel: string): string {
  return readFileSync(path.join(WEB, rel), "utf8");
}

const sql055 = read("supabase/migrations/055_f4_institution_license_user.sql");

const instList = web("app/instituciones/page.tsx");
const instNueva = web("app/instituciones/nueva/page.tsx");
const instDetail = web("app/instituciones/[id]/page.tsx");
const miInst = web("app/mi-institucion/page.tsx");
const licencias = web("app/licencias/page.tsx");
const licModal = web("components/licencias/LicenseFormModal.tsx");
const usuarios = web("app/usuarios/page.tsx");
const usuarioDetalle = web("app/usuarios/[id]/page.tsx");
const configTabs = web("components/configuracion/ConfiguracionTabs.tsx");
const configPerfil = web("app/configuracion/perfil/page.tsx");
const configSeguridad = web("app/configuracion/seguridad/page.tsx");
const nav = web("components/layout/nav.ts");
const licenciasLib = web("lib/licencias.ts");

describe("F4 — migración 055: RPCs de institución, licencia y usuarios", () => {
  it("crea las funciones requeridas", () => {
    for (const fn of [
      "get_user_role",
      "is_global_user",
      "create_license_with_codes",
      "create_institution_with_license",
      "list_users",
      "admin_update_staff",
    ]) {
      expect(sql055).toContain(`FUNCTION ${fn}`);
    }
  });

  it("perfiles gana la columna activo", () => {
    expect(sql055).toContain(
      "ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS activo"
    );
  });

  it("las funciones revocan anon", () => {
    expect((sql055.match(/REVOKE ALL ON FUNCTION/g) ?? []).length).toBeGreaterThanOrEqual(
      4
    );
  });

  it("create_license_with_codes valida rol, solapamiento y audita", () => {
    const start = sql055.indexOf("FUNCTION create_license_with_codes");
    const slice = sql055.slice(start, start + 6000);
    expect(slice).toContain("daterange");
    expect(slice).toContain("exclusion_violation");
    expect(slice).toContain("'license_created'");
    expect(slice).toContain("auth.uid()");
  });

  it("create_institution_with_license es todo-o-nada con niveles y licencia", () => {
    const start = sql055.indexOf("FUNCTION create_institution_with_license");
    const slice = sql055.slice(start, start + 9000);
    expect(slice).toContain("create_license_with_codes");
    expect(slice).toContain("RAISE EXCEPTION");
    expect(slice).toContain("'institution_create'");
    expect(slice).toContain("niveles_educativos");
    expect(slice).toContain("'Primaria'");
    expect(slice).toContain("'Secundaria'");
  });

  it("list_users expone email y activo con alcance global/director", () => {
    const start = sql055.indexOf("FUNCTION list_users");
    const slice = sql055.slice(start, start + 5000);
    expect(slice).toContain("auth.users");
    expect(slice).toContain("activo");
    expect(slice).toContain("'global'");
    expect(slice).toContain("'director'");
  });

  it("admin_update_staff bloquea perfiles Global y auto-desactivación", () => {
    const start = sql055.indexOf("FUNCTION admin_update_staff(");
    const slice = sql055.slice(start, start + 7000);
    expect(slice).toContain("p_activo");
    expect(slice).toContain("p_institution_id");
    expect(slice).toContain("'staff_update'");
    expect(slice).toContain("auth.uid()");
  });

  it("get_user_role/is_global_user exigen usuario activo", () => {
    for (const fn of ["FUNCTION get_user_role", "FUNCTION is_global_user"]) {
      const start = sql055.indexOf(fn);
      expect(start).toBeGreaterThan(-1);
      const slice = sql055.slice(start, start + 1500);
      expect(slice).toContain("activo");
    }
  });
});

describe("F4 — IE-01/IE-02: listado y wizard de creación", () => {
  it("el gate de /instituciones conserva los literales protegidos", () => {
    expect(instList).toContain('profile.role !== "global"');
    expect(instList).toContain(
      "Solo el rol Global puede administrar instituciones."
    );
    expect(instList).toContain('supabase.rpc("create_institution"');
    expect(instList).toContain('rpc("update_institution"');
    expect(instList).toContain('"delete_institution",');
    expect(instList).toContain("p_institution_id");
    expect(instList).toContain("refresh()");
  });

  it("IE-01: lista estado de licencia derivado y lleva al wizard", () => {
    expect(instList).toContain("estadoDeGrupo");
    expect(instList).toContain('href="/instituciones/nueva"');
    expect(instList).toContain("Est. activos");
    expect(instList).toContain("Usuarios");
  });

  it("IE-02: el wizard vive en la página y se monta desde /nueva", () => {
    expect(instList).toContain("export function InstitutionCreateWizard");
    expect(instList).toContain("create_institution_with_license");
    expect(instList).toContain(
      "hasta registrar una licencia, las nuevas atenciones estarán bloqueadas."
    );
    expect(instNueva).toContain("InstitutionCreateWizard");
  });

  it("IE-05: el mapeo de error histórico usa el literal de §7", () => {
    expect(instList).toContain(
      "No se puede eliminar: tiene períodos históricos."
    );
    expect(instList).toContain("código modular");
  });
});

describe("F4 — IE-03/04/05/06: detalle y mi institución", () => {
  it("IE-03: los 7 tabs existen", () => {
    for (const tab of [
      "Resumen",
      "Datos",
      "Licencias",
      "Usuarios",
      "Niveles",
      "Estudiantes",
      "Promoción",
    ]) {
      expect(instDetail).toContain(`label: "${tab}"`);
    }
    expect(instDetail).toContain("LicenseFormModal");
    expect(instDetail).toContain("list_users");
    expect(instDetail).toContain("create_academic_structure");
    expect(instDetail).toContain("Renovar");
  });

  it("IE-04/IE-05: editar y eliminar con confirmación", () => {
    expect(instDetail).toContain('rpc(\n        "update_institution"');
    expect(instDetail).toContain('"delete_institution"');
    expect(instDetail).toContain(
      "No se puede eliminar: tiene períodos históricos."
    );
  });

  it("IE-06: /mi-institucion muestra código modular con botón Copiar", () => {
    expect(miInst).toContain("Mi institución");
    expect(miInst).toContain("navigator.clipboard");
    expect(miInst).toContain("Copiar");
    expect(miInst).toContain("estadoDeGrupo");
    expect(miInst).toContain("LicenseAlert");
    expect(miInst).toContain("Niveles habilitados");
  });
});

describe("F4 — LIC-01..05: tablero y registro de licencias", () => {
  it("LIC-01: tablero con estados derivados, filtros y orden por vencimiento", () => {
    expect(licencias).toContain("Solo el rol Global puede gestionar licencias.");
    expect(licencias).toContain("estadoDeGrupo");
    expect(licencias).toContain("vencimiento más próximo primero");
    expect(licencias).toContain("Por vencer");
    expect(licencias).toContain("Registrar licencia");
  });

  it("LIC-02: el modal valida fin > inicio y solapamiento y llama al RPC", () => {
    expect(licModal).toContain("create_license_with_codes");
    expect(licModal).toContain("solapa");
    expect(licModal).toContain("end > start");
    expect(licModal).toContain("p_codes");
  });

  it("LIC-03: renovar crea un registro nuevo con inicio al día siguiente", () => {
    expect(licencias).toContain("nextDayISO");
    expect(licencias).toContain(
      "Renovar crea un registro nuevo (nunca edita el anterior)"
    );
    expect(licenciasLib).toContain("export function nextDayISO");
  });

  it("LIC-04: ExpiringLicensesPanel también se monta en LIC-01", () => {
    expect(licencias).toContain("ExpiringLicensesPanel");
  });

  it("estados derivados: futura / vigente / por vencer ≤30 d / vencida", () => {
    expect(licenciasLib).toContain('"futura"');
    expect(licenciasLib).toContain('"vigente"');
    expect(licenciasLib).toContain('"por_vencer"');
    expect(licenciasLib).toContain('"vencida"');
    expect(licenciasLib).toContain("DIAS_AVISO = 30");
  });
});

describe("F4 — USR-01..03: usuarios, ficha y configuración propia", () => {
  it("USR-01: lista con filtros vía list_users y aviso de incorporación", () => {
    expect(usuarios).toContain('"list_users"');
    expect(usuarios).toContain("el registro público");
    expect(usuarios).toContain('label="Institución"');
    expect(usuarios).toContain("Ver ficha");
  });

  it("USR-02: un solo rol por radio, I.E. solo Global y activar/desactivar", () => {
    expect(usuarioDetalle).toContain('type="radio"');
    expect(usuarioDetalle).toContain("admin_update_staff_role");
    expect(usuarioDetalle).toContain("p_new_role");
    expect(usuarioDetalle).toContain("admin_update_staff");
    expect(usuarioDetalle).toContain("p_activo");
    expect(usuarioDetalle).toContain("p_institution_id");
    expect(usuarioDetalle).toContain("Desactivar usuario");
    expect(usuarioDetalle).toContain("No existe «crear usuario con contraseña»");
  });

  it("USR-03: rutas propias de perfil/seguridad y cierre de otras sesiones", () => {
    expect(configPerfil).toContain("ConfiguracionContent");
    expect(configPerfil).toContain('initialTab="perfil"');
    expect(configSeguridad).toContain('initialTab="seguridad"');
    expect(configTabs).toContain("Cerrar otras sesiones");
    expect(configTabs).toContain('scope: "others"');
    expect(configTabs).toContain("changePassword");
  });
});

describe("F4 — navegación y permisos", () => {
  it("nav declara licencias, usuarios y mi institución", () => {
    expect(nav).toContain('href: "/licencias"');
    expect(nav).toContain('capability: "licencias.gestionar"');
    expect(nav).toContain('href: "/usuarios"');
    expect(nav).toContain('capability: "usuarios.listar"');
    expect(nav).toContain('href: "/mi-institucion"');
    expect(nav).toContain('roles: ["director", "admin_ie"]');
  });

  it("capacidades F4 coherentes con el spec", () => {
    expect(can("global", "licencias.gestionar")).toBe(true);
    expect(can("director", "licencias.gestionar")).toBe(false);
    expect(can("global", "usuarios.listar")).toBe(true);
    expect(can("director", "usuarios.listar")).toBe(true);
    expect(can("admin_ie", "usuarios.listar")).toBe(false);
    expect(can("admin_ie", "instituciones.propia")).toBe(true);
    expect(can("docente", "instituciones.propia")).toBe(false);
  });
});
