import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

/**
 * F5 — TRF-01..03 y PRO-01..03 (§5.10 y §5.16).
 * Verificación estática: migración 056 (P7 resuelto con RPC de búsqueda),
 * fuentes de las pantallas y alineación de permisos con el server (048).
 * No sustituye el e2e con filas reales (pendiente sin BD) — E2E-07 §8.
 */

const ROOT = path.resolve(__dirname, "../../..");
const WEB = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}
function web(rel: string): string {
  return readFileSync(path.join(WEB, rel), "utf8");
}

const sql056 = read("supabase/migrations/056_f5_transfer_case_lookup.sql");
const sql048 = read("supabase/migrations/048_t66_transfer_b_solicita_a_autoriza.sql");

const trfList = web("app/transferencias/page.tsx");
const trfNueva = web("app/transferencias/nueva/page.tsx");
const trfDetalle = web("app/transferencias/[id]/page.tsx");
const proList = web("app/promocion/page.tsx");
const proNueva = web("app/promocion/nueva/page.tsx");
const proDetalle = web("app/promocion/[loteId]/page.tsx");
const proLib = web("lib/promocion.ts");
const nav = web("components/layout/nav.ts");

describe("F5 — migración 056: find_transferable_case (P7)", () => {
  it("crea la RPC con seguridad DEFINER y revoca anon", () => {
    expect(sql056).toContain("FUNCTION find_transferable_case");
    expect(sql056).toContain("SECURITY DEFINER");
    expect(sql056).toContain(
      "REVOKE ALL ON FUNCTION find_transferable_case(UUID) FROM anon"
    );
  });

  it("restringe a global/director/admin_ie (solo quien puede solicitar)", () => {
    expect(sql056).toContain(
      "v_role NOT IN ('global', 'director', 'admin_ie')"
    );
    expect(sql056).toContain(
      "Solo Director o Admin I.E. pueden identificar casos transferibles"
    );
  });

  it("devuelve datos mínimos: caso, estudiante e I.E. origen, sin clínica", () => {
    expect(sql056).toContain("'caso_id'");
    expect(sql056).toContain("'origin_institution_name'");
    expect(sql056).toContain("'student_name'");
    expect(sql056).toContain("'cases'");
    expect(sql056).not.toContain("FROM atenciones");
    expect(sql056).not.toContain("contenido clinico");
    expect(sql056).toContain("sin contenido clínico");
  });

  it("exige período activo del estudiante (origen de la transferencia)", () => {
    expect(sql056).toContain("pe.end_date IS NULL");
    expect(sql056).toContain("pe.tipo = 'regular'");
    expect(sql056).toContain(
      "El estudiante no tiene un período activo en ninguna institución"
    );
  });
});

describe("F5 — TRF-01 lista con tabs", () => {
  it("tabs: Por autorizar (A) · Solicitadas por mí (B) · Historial", () => {
    expect(trfList).toContain('"Por autorizar"');
    expect(trfList).toContain('"Solicitadas por mí"');
    expect(trfList).toContain('"Historial"');
    expect(trfList).toContain('id: "por_autorizar"');
    expect(trfList).toContain('id: "mias"');
    expect(trfList).toContain('id: "historial"');
  });

  it("el estado se muestra como pill con etiquetas en español", () => {
    expect(trfList).toContain("StatusPill");
    expect(trfList).toContain('pending: "Pendiente"');
    expect(trfList).toContain('approved: "Autorizada"');
    expect(trfList).toContain('rejected: "Rechazada"');
  });

  it("historial = approved/rejected (no pending)", () => {
    expect(trfList).toContain('row.status === "pending"');
    expect(trfList).toContain("historial.push(row)");
  });

  it("gate por capacidad transferencias.consultar", () => {
    expect(trfList).toContain('can(role, "transferencias.consultar")');
    expect(can(null, "transferencias.consultar")).toBe(false);
    expect(can("docente", "transferencias.consultar")).toBe(true);
  });
});

describe("F5 — TRF-02 B solicita", () => {
  it("identifica estudiante por DNI y localiza el caso con la RPC 056", () => {
    expect(trfNueva).toContain('"check_student_duplicates_by_dni"');
    expect(trfNueva).toContain('"find_transferable_case"');
    expect(trfNueva).toContain("p_student_id");
    expect(trfNueva).toContain("sin contenido clínico");
  });

  it("solicita con initiate_transfer fijando nivel/grado/sección destino", () => {
    expect(trfNueva).toContain('"initiate_transfer"');
    expect(trfNueva).toContain("p_caso_id");
    expect(trfNueva).toContain("p_origin_institution_id");
    expect(trfNueva).toContain("p_destination_nivel_id");
    expect(trfNueva).toContain("p_destination_grado_id");
    expect(trfNueva).toContain("p_section");
  });

  it("nivel, grado y sección son obligatorios", () => {
    expect(trfNueva).toContain("(obligatorios)");
    expect(trfNueva).toContain("Nivel destino");
    expect(trfNueva).toContain("Grado destino");
    expect(trfNueva).toContain("Sección destino");
    expect(trfNueva).toMatch(
      /Boolean\(lookup && selectedCaseId && nivelId && gradoId && section\)/
    );
  });

  it("confirma que queda pending sin efecto en A (048)", () => {
    expect(trfNueva).toContain("pendiente");
    expect(trfNueva).toContain(
      "ningún efecto en la institución origen hasta que A (origen) la autorice"
    );
    expect(sql048).toContain("Sin efecto inmediato en A: solo INSERT pending");
  });

  it("error claro si ya hay una pending para el caso (literal §7)", () => {
    expect(trfNueva).toContain(
      "Ya existe una solicitud pendiente para este caso."
    );
    expect(trfNueva).toContain("Ya existe una transferencia activa para este caso");
  });

  it("gate por capacidad transferencias.solicitar alineada al server 048", () => {
    expect(trfNueva).toContain('can(role, "transferencias.solicitar")');
    expect(can("director", "transferencias.solicitar")).toBe(true);
    expect(can("admin_ie", "transferencias.solicitar")).toBe(true);
    expect(can("global", "transferencias.solicitar")).toBe(true);
    expect(can("coordinador", "transferencias.solicitar")).toBe(false);
    expect(can("psicologo", "transferencias.solicitar")).toBe(false);
  });
});

describe("F5 — TRF-03 detalle + autorizar/rechazar", () => {
  it("acciones de A: authorize_transfer y reject_transfer", () => {
    expect(trfDetalle).toContain('"authorize_transfer"');
    expect(trfDetalle).toContain('"reject_transfer"');
    expect(trfDetalle).toContain("p_transfer_id");
    expect(trfDetalle).toContain("p_reason");
    expect(can("admin_ie", "transferencias.autorizar")).toBe(true);
    expect(can("coordinador", "transferencias.autorizar")).toBe(false);
  });

  it("diálogo de autorización explica los 4 efectos (spec §5.10)", () => {
    expect(trfDetalle).toContain("Cierra el período escolar en A");
    expect(trfDetalle).toContain("Crea el período escolar en B");
    expect(trfDetalle).toContain("Transfiere la responsabilidad");
    expect(trfDetalle).toContain("conserva acceso de consulta");
  });

  it("rechazo es opcional y sin efectos", () => {
    expect(trfDetalle).toContain("Motivo (opcional)");
    expect(trfDetalle).toContain("no produce efectos");
    expect(sql048).toContain("'transfer_rejected'");
  });

  it("línea de tiempo con eventos transfer_requested/authorized/rejected", () => {
    expect(trfDetalle).toContain("transfer_requested");
    expect(trfDetalle).toContain("transfer_authorized");
    expect(trfDetalle).toContain("transfer_rejected");
  });

  it("sin permiso muestra el literal §7", () => {
    expect(trfDetalle).toContain("No tienes permiso para ver esto.");
  });
});

describe("F5 — PRO-01 lista de lotes", () => {
  it("muestra contexto, estados del ciclo de vida y conteos", () => {
    expect(proList).toContain("Nueva promoción");
    expect(proList).toContain("origin_year");
    expect(proList).toContain("destination_year");
    expect(proList).toContain("readCounts");
    expect(proLib).toContain('PREPARED: "Preparado"');
    expect(proLib).toContain('RUNNING: "En ejecución"');
    expect(proLib).toContain('COMPLETED: "Completado"');
    expect(proLib).toContain('FAILED: "Fallido"');
    expect(proLib).toContain('INTERRUPTED: "Interrumpido"');
  });

  it("aviso si hay un lote recuperable", () => {
    expect(proList).toContain("recuperable");
    expect(proList).toContain("RECUPERABLES");
    expect(proLib).toContain('"PREPARED"');
    expect(proLib).toContain('"INTERRUPTED"');
    expect(proLib).toContain('"FAILED"');
  });

  it("gate por capacidad promocion.gestionar", () => {
    expect(proList).toContain('can(role, "promocion.gestionar")');
    expect(can("coordinador", "promocion.gestionar")).toBe(true);
    expect(can("docente", "promocion.gestionar")).toBe(false);
  });
});

describe("F5 — PRO-02 wizard de 4 pasos", () => {
  it("pasos Ámbito → Preparar → Revisar → Ejecutar", () => {
    expect(proNueva).toContain('label: "Ámbito"');
    expect(proNueva).toContain('label: "Preparar"');
    expect(proNueva).toContain('label: "Revisar"');
    expect(proNueva).toContain('label: "Ejecutar"');
    expect(proNueva).toContain("Stepper");
  });

  it("ámbito: I.E. + año origen (prefijado anterior) y destino (actual)", () => {
    expect(proNueva).toContain("const ANIO_ACTUAL = new Date().getFullYear()");
    expect(proNueva).toContain("useState(ANIO_ACTUAL - 1)");
    expect(proNueva).toContain("useState(ANIO_ACTUAL)");
    expect(proNueva).toContain("destinationYear > originYear");
  });

  it("preparar llama prepare_promotion con idempotency_key (no muta)", () => {
    expect(proNueva).toContain('"prepare_promotion"');
    expect(proNueva).toContain("p_idempotency_key");
    expect(proNueva).toContain("crypto.randomUUID()");
    expect(proNueva).toContain("sin mutar datos");
  });

  it("revisar: conteos por grado, badge de cambio de nivel, egreso y retirados", () => {
    expect(proNueva).toContain("Conteos por grado");
    expect(proNueva).toContain("Cambio de nivel");
    expect(proNueva).toContain("Retirados excluidos");
    expect(proNueva).toContain("PromotionExceptionsPanel");
  });

  it("ejecutar: confirmación tipeada PROMOVER + idempotencia", () => {
    expect(proNueva).toContain('"PROMOVER"');
    expect(proNueva).toContain('confirmText !== "PROMOVER"');
    expect(proNueva).toContain('"execute_promotion"');
    expect(proNueva).toContain(
      "Ya existe una promoción completada para este contexto."
    );
  });

  it("sin programación: la promoción es siempre manual (DC-011)", () => {
    expect(proNueva).toContain("siempre manual (DC-011)");
    expect(proNueva).toContain("no se puede programar");
  });

  it("adoptar lote activo del contexto si prepare lo reporta", () => {
    expect(proNueva).toContain(
      "Ya existe un lote de promoción activo para este contexto"
    );
    expect(proNueva).toContain('in("status", ["PREPARED", "RUNNING"])');
  });
});

describe("F5 — PRO-03 detalle con reanudación", () => {
  it("reanuda INTERRUPTED/RUNNING con resume_promotion", () => {
    expect(proDetalle).toContain('"resume_promotion"');
    expect(proDetalle).toContain("p_batch_id");
    expect(proDetalle).toContain(
      'lote.status === "INTERRUPTED" || lote.status === "RUNNING"'
    );
  });

  it("FAILED/PREPARED se ejecutan con execute_promotion (misma key)", () => {
    expect(proDetalle).toContain('"execute_promotion"');
    expect(proDetalle).toContain("p_idempotency_key");
    expect(proDetalle).toContain("lote.idempotency_key");
  });

  it("acciones paginadas y excepciones auditadas", () => {
    expect(proDetalle).toContain('"acciones_promocion"');
    expect(proDetalle).toContain("Ver más");
    expect(proDetalle).toContain('"excepciones_promocion"');
    expect(proDetalle).toContain("PromotionExceptionsPanel");
    expect(proDetalle).toContain("motivo");
  });

  it("línea de tiempo del lote", () => {
    expect(proDetalle).toContain("promotion_prepared");
    expect(proDetalle).toContain("promotion_executed");
    expect(proDetalle).toContain("Línea de tiempo");
  });
});

describe("F5 — navegación", () => {
  it("nav registra /transferencias y /promocion con capacidades", () => {
    expect(nav).toContain('href: "/transferencias"');
    expect(nav).toContain('href: "/promocion"');
    expect(nav).toContain('capability: "transferencias.consultar"');
    expect(nav).toContain('capability: "promocion.gestionar"');
  });
});
