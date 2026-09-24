import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PromocionLoteStatus } from "@/types/supabase";

/**
 * T64 — Promoción masiva
 * Reglas: SPECIFY (promoción), CONVERGE, 00_DECISIONES (sin roles extra),
 * migraciones 011 (tablas) y 033 (RPC server-side).
 * Idempotente, reanudable, doble ejecución bloqueada, egreso último grado.
 */

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

function mig(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

const sql011 = mig("011_promotion.sql");
const sql033 = mig("033_promotion.sql");
const sql049 = mig("049_t66_bootstrap_promotion_security.sql");

const PROMOTION_ROLES = ["global", "director", "admin_ie", "coordinador"] as const;

function canPromote(role: string): boolean {
  return (PROMOTION_ROLES as readonly string[]).includes(role);
}

/** Estados de lote reanudables (033 resume_promotion / execute). */
const RESUMABLE: PromocionLoteStatus[] = ["PREPARED", "RUNNING", "INTERRUPTED"];

function isResumable(status: PromocionLoteStatus): boolean {
  return RESUMABLE.includes(status);
}

function isIdempotentHit(status: PromocionLoteStatus): boolean {
  return status === "COMPLETED" || status === "COMPLETED_WITH_EXCEPTIONS";
}

/** Espejo mínimo de map_grade: último grado del último nivel → egreso. */
function mapGrade(
  orderInNivel: number,
  hasNextInNivel: boolean,
  hasNextNivel: boolean
): { isEgreso: boolean } {
  if (hasNextInNivel) return { isEgreso: false };
  if (hasNextNivel) return { isEgreso: false };
  if (orderInNivel >= 1) return { isEgreso: true };
  return { isEgreso: true };
}

describe("T64 — esquema de promoción (011)", () => {
  it("lotes: status CHECK con estados de ciclo de vida", () => {
    expect(sql011).toContain(
      "status IN ('PREPARED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'INTERRUPTED', 'FAILED')"
    );
    expect(sql011).toContain("DEFAULT 'PREPARED'");
  });

  it("lotes: idempotency_key UNIQUE (idempotencia a nivel de datos)", () => {
    expect(sql011).toContain("idempotency_key VARCHAR(255) UNIQUE NOT NULL");
  });

  it("acciones: status CHECK y UNIQUE(batch_id, student_id) sin duplicados", () => {
    expect(sql011).toContain(
      "status IN ('pending', 'processed', 'error', 'excluded')"
    );
    expect(sql011).toContain("UNIQUE(batch_id, student_id)");
  });

  it("excepciones: trazan resultado automático vs final y usuario", () => {
    expect(sql011).toContain("automatic_result");
    expect(sql011).toContain("final_result");
    expect(sql011).toContain("motivo TEXT NOT NULL");
    expect(sql011).toContain("usuario_id UUID NOT NULL");
  });
});

describe("T64 — roles e institución (033, server-side)", () => {
  it("preview/execute/exception/resume/wizard: solo 4 roles (sin docente/psicologo)", () => {
    const expected =
      "v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador')";
    expect(sql033.split(expected).length - 1).toBeGreaterThanOrEqual(5);
    expect(canPromote("coordinador")).toBe(true);
    expect(canPromote("director")).toBe(true);
    expect(canPromote("admin_ie")).toBe(true);
    expect(canPromote("global")).toBe(true);
    expect(canPromote("docente")).toBe(false);
    expect(canPromote("psicologo")).toBe(false);
  });

  it("no-global solo promueve en su institución", () => {
    expect(sql033).toContain(
      "IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN"
    );
    expect(sql033).toContain("Solo puede promover en su institución");
  });

  it("RPCs con SECURITY DEFINER (autoridad en servidor)", () => {
    expect(sql033).toContain("SECURITY DEFINER");
    expect(sql033).toContain("CREATE OR REPLACE FUNCTION execute_promotion(");
    expect(sql033).toContain("CREATE OR REPLACE FUNCTION preview_promotion(");
  });
});

describe("T64 — map_grade / último grado = Egreso (033)", () => {
  it("marca is_egreso true solo sin siguiente grado ni nivel", () => {
    expect(sql033).toContain("'is_egreso', true");
    expect(sql033).toContain("Egreso — último grado del último nivel");
    expect(sql033).toContain("CREATE OR REPLACE FUNCTION map_grade(");
  });

  it("siguiente grado en el mismo nivel no es egreso", () => {
    expect(sql033).toContain("g.order_number = v_origin_grado.order_number + 1");
    expect(mapGrade(1, true, false).isEgreso).toBe(false);
    expect(mapGrade(5, false, true).isEgreso).toBe(false);
    expect(mapGrade(6, false, false).isEgreso).toBe(true);
  });

  it("sin siguiente grado busca primer grado del siguiente nivel", () => {
    expect(sql033).toContain("n.order_number = v_origin_grado.nivel_order + 1");
    expect(sql033).toContain("ORDER BY g.order_number ASC");
  });
});

describe("T64 — preview_promotion (033)", () => {
  it("excluye retiros del preview activo (solo tipo regular con end_date NULL)", () => {
    expect(sql033).toContain("pe.end_date IS NULL");
    expect(sql033).toContain("pe.tipo = 'regular'");
    expect(sql033).toContain("pe.tipo = 'retiro'");
  });

  it("bloquea preview si ya hay lote activo (PREPARED/RUNNING)", () => {
    expect(sql033).toContain("AND status IN ('PREPARED', 'RUNNING')");
    expect(sql033).toContain(
      "Ya existe un lote de promoción activo para este contexto"
    );
  });

  it("retorna estadísticas total/promoted/egreso/retired", () => {
    expect(sql033).toContain("'total_students', v_total");
    expect(sql033).toContain("'promoted', v_promoted");
    expect(sql033).toContain("'egreso', v_egreso");
    expect(sql033).toContain("'retired', v_retired");
  });
});

describe("T64 — execute_promotion: idempotencia y reanudación (033)", () => {
  it("idempotente: mismo idempotency_key COMPLETED no reprocessa", () => {
    expect(sql033).toContain("WHERE idempotency_key = p_idempotency_key");
    expect(sql033).toContain(
      "v_existing_batch.status IN ('COMPLETED', 'COMPLETED_WITH_EXCEPTIONS')"
    );
    expect(sql033).toContain("Lote ya procesado (idempotente)");
    expect(sql033).toContain("'idempotent', true");
    expect(isIdempotentHit("COMPLETED")).toBe(true);
    expect(isIdempotentHit("COMPLETED_WITH_EXCEPTIONS")).toBe(true);
    expect(isIdempotentHit("RUNNING")).toBe(false);
  });

  it("reanudable: PREPARED/RUNNING con misma key continúa (T49)", () => {
    expect(sql033).toContain(
      "IF v_existing_batch.status IN ('PREPARED', 'RUNNING') THEN"
    );
    expect(sql033).toContain("SET status = 'RUNNING'");
    expect(isResumable("PREPARED")).toBe(true);
    expect(isResumable("INTERRUPTED")).toBe(true);
    expect(isResumable("COMPLETED")).toBe(false);
  });

  it("doble ejecución: bloquea otro lote activo para el mismo contexto", () => {
    expect(sql033).toContain(
      "Ya existe un lote de promoción activo para este contexto"
    );
    expect(sql033).toMatch(
      /institution_id = p_institution_id\s+AND origin_year = p_origin_year\s+AND destination_year = p_destination_year\s+AND status IN \('PREPARED', 'RUNNING'\)/
    );
  });

  it("por estudiante: acción existente se salta (already_processed)", () => {
    expect(sql033).toContain("WHERE batch_id = v_batch_id");
    expect(sql033).toContain("AND student_id = v_student.student_id");
    expect(sql033).toContain("v_already_processed := v_already_processed + 1");
    expect(sql033).toContain("'already_processed', v_already_processed");
  });

  it("egreso cierra período con motivo egreso; promovido crea nuevo período destino", () => {
    expect(sql033).toContain("motivo_retiro = 'egreso'");
    expect(sql033).toContain("motivo_retiro = 'promocion'");
    expect(sql033).toContain("p_destination_year");
    expect(sql033).toContain("'egreso', v_egreso_count");
  });

  it("errores por estudiante no abortan el lote: COMPLETED_WITH_EXCEPTIONS", () => {
    expect(sql033).toContain("EXCEPTION WHEN OTHERS THEN");
    expect(sql033).toContain("status = 'error'");
    expect(sql033).toContain("INSERT INTO excepciones_promocion");
    expect(sql033).toContain("'COMPLETED_WITH_EXCEPTIONS'");
    expect(sql033).toContain("'promotion_executed'");
  });
});

describe("T64 — apply_promotion_exception y resume_promotion", () => {
  it("excepción: solo roles autorizados, acción pending, resultados válidos", () => {
    expect(sql033).toContain("CREATE OR REPLACE FUNCTION apply_promotion_exception(");
    expect(sql033).toContain("Solo se pueden excepcionar acciones pendientes");
    expect(sql033).toContain(
      "p_final_result NOT IN ('promoted', 'retained', 'egreso')"
    );
    expect(sql033).toContain("'promotion_exception_applied'");
  });

  it("resume: lote reanudable y con pendientes; audita", () => {
    expect(sql033).toContain("CREATE OR REPLACE FUNCTION resume_promotion(");
    expect(sql033).toContain(
      "IF v_batch.status NOT IN ('PREPARED', 'RUNNING', 'INTERRUPTED') THEN"
    );
    expect(sql033).toContain("No hay acciones pendientes para reanudar");
    expect(sql033).toContain("AND status = 'pending'");
    expect(sql033).toContain("'promotion_resumed'");
  });
});

describe("T64 — wizard prefill (033)", () => {
  it("origen = año anterior, destino = año actual", () => {
    expect(sql033).toContain("CREATE OR REPLACE FUNCTION get_promotion_wizard(");
    expect(sql033).toContain("v_origin_year := v_current_year - 1");
    expect(sql033).toContain("'origin_year', v_origin_year");
    expect(sql033).toContain("'destination_year', v_current_year");
  });

  it("expone lote reanudable existente si lo hay", () => {
    expect(sql033).toContain("existing_batch_id");
    expect(sql033).toContain(
      "AND status IN ('PREPARED', 'RUNNING', 'INTERRUPTED')"
    );
  });
});

describe("T66/A4 — prepare_promotion + execute (049)", () => {
  it("prepare crea PREPARED con preview y NO muta períodos", () => {
    expect(sql049).toContain("CREATE OR REPLACE FUNCTION prepare_promotion(");
    expect(sql049).toContain("'PREPARED'");
    expect(sql049).toContain("'promotion_prepared'");
    const start = sql049.indexOf("FUNCTION prepare_promotion(");
    const end = sql049.indexOf("COMMENT ON FUNCTION prepare_promotion");
    const prepareBody = start >= 0 && end > start ? sql049.slice(start, end) : sql049;
    expect(prepareBody).not.toContain("UPDATE periodos_escolares");
    expect(prepareBody).not.toContain("INSERT INTO periodos_escolares");
    expect(prepareBody).toContain("preview_promotion");
    expect(prepareBody).toContain("'preview', v_preview");
  });

  it("execute solo corre PREPARED|RUNNING|FAILED|INTERRUPTED o auto-prepara", () => {
    expect(sql049).toContain(
      "IF v_existing_batch.status IN ('PREPARED', 'RUNNING', 'FAILED', 'INTERRUPTED') THEN"
    );
    expect(sql049).toContain("v_prep := prepare_promotion(");
    expect(sql049).toContain("'promotion_executed'");
  });

  it("A2: claim_first_global one-shot sin contraseña fija", () => {
    expect(sql049).toContain("CREATE OR REPLACE FUNCTION claim_first_global()");
    expect(sql049).toContain("v_existing > 0");
    expect(sql049).toContain("'first_global_claimed'");
    expect(sql049).toContain("one_shot");
    expect(sql049).not.toMatch(/password\s*[:=]\s*['"](?:admin|123|global)/i);
  });

  it("A5: execute manual; map_grade ya cubierto en 033", () => {
    expect(sql049).toContain("Manual siempre");
    expect(sql033).toContain("CREATE OR REPLACE FUNCTION map_grade(");
  });
});
