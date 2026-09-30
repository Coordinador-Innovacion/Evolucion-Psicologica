import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, can } from "@/lib/permissions";

/**
 * F3 — CAS-01..07, ATN-01..04, DER-01..03, NEC-01..03 (cierra la Falla #2
 * del UI_GAP_AUDIT: "No se puede crear un Caso").
 * Verificación estática: migración 054 + fuentes de las pantallas.
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

const sql054 = read("supabase/migrations/054_f3_case_flow.sql");

const nav = web("components/layout/nav.ts");
const detail = web("app/casos/[id]/page.tsx");
const caseList = web("app/casos/page.tsx");
const caseNuevo = web("app/casos/nuevo/page.tsx");
const caseForm = web("components/casos/CaseCreateForm.tsx");
const ficha = web("app/estudiantes/[id]/page.tsx");

describe("F3 — migración 054: RPCs de flujo de caso", () => {
  it("crea las 8 funciones requeridas", () => {
    for (const fn of [
      "server_now",
      "list_institution_psychologists",
      "create_case",
      "reassign_case_responsible",
      "create_derivation",
      "create_referral_with_case",
      "link_case_derivation",
      "list_attention_audit",
    ]) {
      expect(sql054).toContain(`FUNCTION ${fn}`);
    }
  });

  it("todas las funciones revocan anon", () => {
    expect((sql054.match(/REVOKE ALL ON FUNCTION/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it("create_case exige período activo y audita", () => {
    expect(sql054).toContain("FUNCTION create_case");
    expect(sql054).toMatch(/periodos_escolares[\s\S]{0,600}end_date IS NULL/);
    expect(sql054).toContain("'case_created'");
  });

  it("reassign_case_responsible cierra la fila abierta sin solaparse", () => {
    expect(sql054).toContain("GREATEST(NOW(), v_open_desde + INTERVAL '1 microsecond')");
    expect(sql054).toContain("'case_reassigned'");
  });

  it("create_derivation determina el período por la fecha del evento", () => {
    expect(sql054).toMatch(/v_period_id[\s\S]{0,400}derivation_date/);
    expect(sql054).toContain("'derivation_created'");
  });

  it("create_referral_with_case es todo-o-nada (RAISE si falla el caso)", () => {
    const start = sql054.indexOf("FUNCTION create_referral_with_case");
    const slice = sql054.slice(start, start + 4000);
    expect(slice).toContain("RAISE EXCEPTION");
    expect(slice).toContain("EXCEPTION");
  });

  it("link_case_derivation actualiza ambos lados y audita", () => {
    const start = sql054.indexOf("FUNCTION link_case_derivation");
    const slice = sql054.slice(start, start + 5000);
    expect(slice).toContain("UPDATE casos SET derivation_id");
    expect(slice).toContain("UPDATE derivaciones SET caso_id");
    expect(slice).toContain("'case_derivation_linked'");
    expect(slice).toContain("ya tiene una derivación vinculada");
  });

  it("list_attention_audit: solo metadatos y roles G,D,A,C", () => {
    const start = sql054.indexOf("FUNCTION list_attention_audit");
    const slice = sql054.slice(start, start + 5000);
    expect(slice).toContain("NOT IN ('global', 'director', 'admin_ie', 'coordinador')");
    expect(slice).toContain("RETURN QUERY");
    expect(slice).toContain("au.action");
    expect(slice).toContain("COALESCE(pf.full_name, 'Usuario')");
  });

  it("server_now devuelve la hora del servidor (SECURITY DEFINER)", () => {
    const start = sql054.indexOf("FUNCTION server_now");
    const slice = sql054.slice(start, start + 600);
    expect(slice).toContain("CURRENT_TIMESTAMP");
    expect(slice).toContain("SECURITY DEFINER");
  });
});

describe("F3 — navegación y permisos", () => {
  it("nav incluye /atenciones y /derivaciones con sus iconos", () => {
    expect(nav).toContain('href: "/atenciones"');
    expect(nav).toContain('href: "/derivaciones"');
    expect(nav).toContain('icon: "pulse"');
    expect(nav).toContain('icon: "branch"');
    expect(nav).toContain('capability: "atenciones.consultar"');
    expect(nav).toContain('capability: "derivaciones.consultar"');
  });

  it("el bloque /derivaciones del nav no restringe roles (spec: visible a todos)", () => {
    const block = nav.match(
      new RegExp(`href: "/derivaciones",((?:(?!href:)[\\s\\S])*)`)
    )?.[1] ?? "";
    expect(block).not.toContain("roles:");
  });

  it("permissions.ts registra las rutas nuevas", () => {
    for (const p of [
      "/atenciones",
      "/derivaciones",
      "/derivaciones/nueva",
      "/necesidades-especiales",
    ]) {
      expect(CAPABILITIES).toBeDefined();
      const perm = web("lib/permissions.ts");
      expect(perm).toContain(`path: "${p}"`);
    }
  });

  it("badge de derivaciones sin caso requiere derivaciones.crear", () => {
    const badges = web("components/layout/nav-badges.ts");
    expect(badges).toContain('can(role, "derivaciones.crear")');
    expect(badges).toContain('.is("caso_id", null)');
    expect(badges).toContain('next["/derivaciones"]');
  });
});

describe("F3 — CAS-01..03", () => {
  it("CAS-01: listado con estados, filtros y alta", () => {
    expect(caseList).toContain('from("casos")');
    expect(caseList).toContain("CaseStatusBadge");
    expect(caseList).toContain("Nuevo caso");
    expect(caseList).toContain('"Sin derivación"');
    expect(caseList).toContain('"Mis casos"');
    expect(caseList).toContain('"Todos"');
    expect(caseList).toContain("Responsable");
  });

  it("CAS-01: filtro de I.E. solo para global", () => {
    expect(caseList).toContain("isGlobal");
    expect(caseList).toContain('from("institutions")');
    expect(caseList).toContain('from("periodos_escolares")');
    expect(caseList).toContain('.eq("institution_id", ieFilter)');
    expect(caseList).toContain("ieStudentIds");
    expect(caseList).toContain("{isGlobal && (");
    expect(caseList).toContain('label="Institución"');
  });

  it("CAS-02: página y formulario de alta con RPC transaccional", () => {
    expect(caseNuevo).toContain("RestrictedAccess");
    expect(caseNuevo).toContain('can(role, "casos.gestionar")');
    expect(caseForm).toContain('"create_case"');
    expect(caseForm).toContain('"create_referral_with_case"');
    expect(caseForm).toContain("no tiene un período activo");
    expect(caseForm).toContain("Crear caso");
    expect(caseForm).toContain("list_institution_psychologists");
  });

  it("CAS-02: la ficha abre el alta en un Modal", () => {
    expect(ficha).toContain("CaseCreateForm");
    expect(ficha).toContain("newCaseOpen");
    expect(ficha).toContain('"Nuevo caso"');
    expect(ficha).toContain("Modal");
  });

  it("CAS-03: detalle conserva CaseActions/NewAttentionForm/canManage", () => {
    expect(detail).toContain("CaseActions");
    expect(detail).toContain("NewAttentionForm");
    expect(detail).toContain("canManage");
    expect(detail).toContain("CaseStatusBadge");
    expect(detail).toContain('from("casos")');
  });

  it("CAS-03: tabs, evolución, línea de tiempo y acciones rápidas", () => {
    expect(detail).toContain('"Resumen"');
    expect(detail).toContain('"Atenciones"');
    expect(detail).toContain('"Derivaciones"');
    expect(detail).toContain('"Historial"');
    expect(detail).toContain("Evolución del caso");
    expect(detail).toContain("Línea de tiempo");
    expect(detail).toContain("Reasignar responsable");
    expect(detail).toContain("Registrar atención");
    expect(detail).toContain("Vincular derivación");
    expect(detail).toContain("Ver historial completo");
    expect(detail).toContain("Registrar primera atención");
  });

  it("CAS-04/05: cerrar y reabrir pasan por CaseActions (backend 031/038)", () => {
    expect(detail).toContain("onStateChanged={reload}");
    expect(detail).toContain("estado !== \"cerrado\"");
  });

  it("CAS-06: reasignar vía RPC con psicólogos de la I.E.", () => {
    expect(detail).toContain("ReassignCaseModal");
    const modal = web("components/casos/ReassignCaseModal.tsx");
    expect(modal).toContain('"reassign_case_responsible"');
    expect(modal).toContain("list_institution_psychologists");
    expect(modal).toContain("Nuevo responsable");
    expect(modal).toContain("Motivo (opcional)");
  });

  it("CAS-07: transferencia pending y origen en solo consulta", () => {
    expect(detail).toContain('from("transferencias")');
    expect(detail).toContain("Transferido a");
    expect(detail).toContain("Solo consulta");
    expect(detail).toContain("Histórico inmutable");
    expect(detail).toContain("pendiente de autorización");
    expect(detail).toContain("transferredOut");
  });

  it("ninguna página de casos declara <nav", () => {
    for (const rel of ["app/casos/page.tsx", "app/casos/nuevo/page.tsx", "app/casos/[id]/page.tsx"]) {
      expect(web(rel)).not.toContain("<nav");
    }
  });
});

describe("F3 — ATN-01..04", () => {
  const list = web("app/atenciones/page.tsx");
  const nueva = web("app/casos/[id]/atenciones/nueva/page.tsx");
  const edit = web("app/casos/[id]/atenciones/[aid]/page.tsx");
  const form = web("components/casos/NewAttentionForm.tsx");
  const audit = web("components/casos/AttentionAuditPanel.tsx");

  it("ATN-01: lista global sin notas clínicas", () => {
    expect(list).toContain('from("atenciones")');
    expect(list).not.toContain("que_se_hizo");
    expect(list).not.toContain("observaciones");
    expect(list).toContain("atenciones/");
    expect(list).toContain("CaseStatusBadge");
    expect(list).toContain("Responsable");
    expect(list).toContain("Anterior");
  });

  it("ATN-01: filtros y paginación", () => {
    expect(list).toContain("Fecha desde");
    expect(list).toContain("Fecha hasta");
    expect(list).toContain("Estado del caso");
    expect(list).toContain("PAGE_SIZE");
    expect(list).toContain("Siguiente");
  });

  it("ATN-02: gate G,P, licencia y rechazo del servidor", () => {
    expect(nueva).toContain("RestrictedAccess");
    expect(nueva).toContain('role === "global" || role === "psicologo"');
    expect(nueva).toContain("useLicenseStatus");
    expect(nueva).toContain("Licencia vencida: nuevas atenciones bloqueadas");
    expect(nueva).toContain("showOrigen");
  });

  it("ATN-02: formulario fija fecha en servidor y expone columnas reales", () => {
    expect(form).toContain("La fecha y hora las fija el servidor");
    expect(form).toContain("att-motivo");
    expect(form).toContain("att-queSeHizo");
    expect(form).toContain("att-observaciones");
    expect(form).toContain("att-compromisos");
    expect(form).toContain("att-proxima");
    expect(form).toContain("att-origen");
    expect(form).toContain("title={disabled ? disabledReason : undefined}");
  });

  it("ATN-03: cuenta regresiva con hora del servidor y bloqueo", () => {
    expect(edit).toContain('"server_now"');
    expect(edit).toContain("serverOffset");
    expect(edit).toContain("EDIT_WINDOW_MS = 30 * 60 * 1000");
    expect(edit).toContain("Editable");
    expect(edit).toContain("Ya no se puede editar (pasaron 30 minutos)");
    expect(edit).toContain("Copiar texto");
    expect(edit).toContain("draft");
    expect(edit).toContain("useAttentionEdit");
    expect(edit).toContain("updateAttention");
  });

  it("ATN-04: panel de auditoría solo metadatos con gate de auditoría", () => {
    expect(audit).toContain('"list_attention_audit"');
    expect(audit).toContain("Solo metadatos");
    expect(audit).not.toContain("que_se_hizo");
    expect(edit).toContain('can(role, "auditoria.consultar")');
    expect(edit).toContain("AttentionAuditPanel");
  });
});

describe("F3 — DER-01..03", () => {
  const list = web("app/derivaciones/page.tsx");
  const nueva = web("app/derivaciones/nueva/page.tsx");
  const det = web("app/derivaciones/[id]/page.tsx");

  it("DER-01: lista con filtros con/sin Caso, estudiante, fecha y derivador", () => {
    expect(list).toContain('from("derivaciones")');
    expect(list).toContain('"Sin Caso"');
    expect(list).toContain('"Con Caso"');
    expect(list).toContain("Derivador");
    expect(list).toContain("Fecha desde");
    expect(list).toContain("Buscar estudiante");
    expect(list).toContain('can(role, "derivaciones.consultar")');
  });

  it("DER-02: alta con período por fecha, adjunto opcional y toggle de Caso", () => {
    expect(nueva).toContain('"create_derivation"');
    expect(nueva).toContain('"create_referral_with_case"');
    expect(nueva).toContain("useDocumentUpload");
    expect(nueva).toContain("doc:");
    expect(nueva).toContain("Crear Caso a partir de esta derivación");
    expect(nueva).toContain('type="date"');
    expect(nueva).toContain("registrador");
    expect(nueva).toContain('can(role, "derivaciones.crear")');
    expect(nueva).toContain("RestrictedAccess");
  });

  it("DER-03: detalle con vínculo como antecedente", () => {
    expect(det).toContain('"link_case_derivation"');
    expect(det).toContain("Vincular a un Caso como antecedente");
    expect(det).toContain("no crea un segundo");
    expect(det).toContain("useStudentDocuments");
    expect(det).toContain("Adjunto");
    expect(det).toContain("Ver ficha");
  });
});

describe("F3 — NEC-01..03", () => {
  const tabs = web("components/estudiantes/StudentTabs.tsx");
  const dash = web("components/dashboard/DashboardShell.tsx");
  const listado = web("app/necesidades-especiales/page.tsx");

  it("NEC-01: formulario en la ficha con aviso «No crea un Caso»", () => {
    expect(tabs).toContain("No crea un Caso");
    expect(tabs).toContain('from("necesidades_especiales")');
    expect(tabs).toContain("Tipo de condición");
    expect(tabs).toContain("Orientación para el docente");
    expect(tabs).toContain("Descripción clínica");
    expect(ficha).toContain('canManage={can(role, "necesidades.gestionar")}');
    expect(ficha).toContain("onChanged={refresh}");
    expect(tabs).not.toContain("NEC-01/NEC-02");
  });

  it("NEC-01: entidad única maneja el error 23505", () => {
    expect(tabs).toContain("23505");
    expect(tabs).toContain("una sola entidad por estudiante");
  });

  it("NEC-02: tarjeta DASH-DO usa la vista segura, nunca la tabla clínica", () => {
    expect(dash).toContain('from("v_necesidades_docente")');
    expect(dash).not.toContain('from("necesidades_especiales")');
    expect(dash).toContain("Orientación informativa");
    expect(dash).toContain("Sin orientaciones registradas");
  });

  it("NEC-03: listado global con gate de consulta", () => {
    expect(listado).toContain('from("necesidades_especiales")');
    expect(listado).toContain('can(role, "necesidades.consultar")');
    expect(listado).toContain("RestrictedAccess");
    expect(listado).toContain("Buscar estudiante");
    expect(listado).toContain("Condición");
  });
});

describe("F3 — coherencia de permisos (UI anticipa, servidor manda)", () => {
  it("capacidades de atenciones/derivaciones/necesidades presentes", () => {
    expect(CAPABILITIES["atenciones.consultar"]).toBeDefined();
    expect(CAPABILITIES["derivaciones.crear"]).toBeDefined();
    expect(CAPABILITIES["necesidades.gestionar"]).toBeDefined();
    expect(can("global", "necesidades.gestionar")).toBe(true);
    expect(can("docente", "necesidades.gestionar")).toBe(false);
  });

  it("el alta de casos no está bloqueada por licencia (solo atenciones)", () => {
    expect(caseForm).not.toContain("useLicenseStatus");
    const nueva = web("app/casos/[id]/atenciones/nueva/page.tsx");
    expect(nueva).toContain("useLicenseStatus");
  });
});
