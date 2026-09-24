import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TransferenciaStatus } from "@/types/supabase";

/**
 * T62 — Transferencias (A1 / DC-007)
 * Flujo vigente (048): B (destino) solicita → pending SIN efecto en A;
 * A (origen) autoriza → cierra período A, crea período B, transfiere
 * responsabilidad; A puede rechazar → rejected sin efectos.
 * Reemplaza el flujo 019 (A inicia con efecto inmediato → B acepta).
 * 040 conserva CHECK con accepted (histórico).
 */

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

function mig(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

const sql009 = mig("009_transfers.sql");
const sql040 = mig("040_transfer_status_accepted_fix.sql");
const sql048 = mig("048_t66_transfer_b_solicita_a_autoriza.sql");

const TRANSFER_ROLES = ["global", "director", "admin_ie"] as const;

/** Activa para índice único: solo pending (048). */
function isActiveTransfer(status: TransferenciaStatus): boolean {
  return status === "pending";
}

function canSolicit(role: string): boolean {
  return (TRANSFER_ROLES as readonly string[]).includes(role);
}

function canAuthorize(role: string): boolean {
  return (TRANSFER_ROLES as readonly string[]).includes(role);
}

describe("T62 — esquema y CHECK de status", () => {
  it("009: origen ≠ destino en CHECK", () => {
    expect(sql009).toContain(
      "CHECK (origin_institution_id != destination_institution_id)"
    );
  });

  it("040: CHECK incluye 'accepted' (histórico) junto a pending/approved/rejected", () => {
    expect(sql040).toContain("DROP CONSTRAINT IF EXISTS transferencias_status_check");
    expect(sql040).toContain(
      "CHECK (status IN ('pending', 'accepted', 'approved', 'rejected', 'completed'))"
    );
    const statuses: TransferenciaStatus[] = [
      "pending",
      "accepted",
      "approved",
      "rejected",
      "completed",
    ];
    expect(statuses).toContain("accepted");
    expect(isActiveTransfer("pending")).toBe(true);
    expect(isActiveTransfer("accepted")).toBe(false);
    expect(isActiveTransfer("approved")).toBe(false);
    expect(isActiveTransfer("completed")).toBe(false);
  });
});

describe("T62 — initiate_transfer (048): B solicita, sin efecto en A", () => {
  it("solo global|director|admin_ie pueden solicitar", () => {
    expect(sql048).toContain(
      "IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN"
    );
    expect(sql048).toContain(
      "Solo Director o Admin I.E. pueden solicitar transferencias"
    );
    expect(canSolicit("director")).toBe(true);
    expect(canSolicit("admin_ie")).toBe(true);
    expect(canSolicit("global")).toBe(true);
    expect(canSolicit("psicologo")).toBe(false);
    expect(canSolicit("docente")).toBe(false);
    expect(canSolicit("coordinador")).toBe(false);
  });

  it("destino no-global = propia institución; origen ≠ destino", () => {
    expect(sql048).toContain("v_dest_inst := v_user_institution");
    expect(sql048).toContain(
      "La institución origen y destino deben ser diferentes"
    );
  });

  it("bloquea doble solicitud: solo pending cuenta (índice único)", () => {
    expect(sql048).toContain("AND status = 'pending'");
    expect(sql048).toContain(
      "Ya existe una transferencia activa para este caso"
    );
    expect(sql048).toContain("WHERE status = 'pending'");
    expect(sql048).toContain("ux_transferencias_active_caso");
  });

  it("sin efecto inmediato: transferred_at NULL, no cierra período A", () => {
    expect(sql048).toContain("NULL          -- SIN transferred_at hasta que A autorice");
    expect(sql048).toMatch(
      /Sin efecto inmediato en A: solo INSERT pending/
    );
    const start = sql048.indexOf("FUNCTION initiate_transfer(");
    const end = sql048.indexOf("COMMENT ON FUNCTION initiate_transfer");
    const initiateBody = start >= 0 && end > start ? sql048.slice(start, end) : sql048;
    expect(initiateBody).not.toContain("motivo_retiro = 'transferencia_a_otra_institucion'");
    expect(initiateBody).not.toContain("SET end_date = CURRENT_DATE");
    expect(initiateBody).toContain("'transfer_requested'");
    expect(initiateBody).toContain("'status', 'pending'");
    expect(initiateBody).toContain("'role_action', 'B_solicita'");
  });

  it("fija nivel/grado/sección destino al solicitar", () => {
    expect(sql048).toContain("destination_nivel_id");
    expect(sql048).toContain("destination_grado_id");
    expect(sql048).toContain("v_section_out := COALESCE(p_section, v_origin_period.section)");
  });
});

describe("T62 — authorize_transfer (048): A autoriza con efectos", () => {
  it("solo global|director|admin_ie del origen autorizan", () => {
    expect(sql048).toContain(
      "Solo Director o Admin I.E. pueden autorizar transferencias"
    );
    expect(sql048).toContain(
      "Solo puede autorizar transferencias de su institución (origen)"
    );
    expect(canAuthorize("director")).toBe(true);
    expect(canAuthorize("psicologo")).toBe(false);
  });

  it("solo pending; exige nivel y grado destino (NOT NULL en períodos)", () => {
    expect(sql048).toContain("IF v_transfer.status != 'pending' THEN");
    expect(sql048).toContain(
      "Solo se pueden autorizar transferencias pendientes"
    );
    expect(sql048).toContain(
      "La solicitud debe indicar nivel y grado destino antes de autorizar"
    );
  });

  it("efectos: cierra período A, crea período B, transfiere responsabilidad", () => {
    expect(sql048).toContain("motivo_retiro = 'transferencia_a_otra_institucion'");
    expect(sql048).toContain("SET end_date = CURRENT_DATE");
    expect(sql048).toMatch(
      /INSERT INTO periodos_escolares[\s\S]*'regular'/
    );
    expect(sql048).toContain("v_transfer.destination_institution_id");
    expect(sql048).toContain("SET status = 'approved'");
    expect(sql048).toContain("authorized_at");
    expect(sql048).toContain("transferred_at");
    expect(sql048).toContain("INSERT INTO caso_responsables_historial");
    expect(sql048).toContain("'transfer_authorized'");
    expect(sql048).toContain("'role_action', 'A_autoriza'");
    expect(sql048).toContain("FOR UPDATE");
  });

  it("FALLA si destino sin nivel/grado (columnas NOT NULL)", () => {
    expect(sql048).toContain(
      "IF v_transfer.destination_nivel_id IS NULL OR v_transfer.destination_grado_id IS NULL THEN"
    );
  });
});

describe("T62 — reject_transfer (048): A rechaza sin efectos", () => {
  it("solo origen/global; solo pending; audita transfer_rejected", () => {
    expect(sql048).toContain("CREATE OR REPLACE FUNCTION reject_transfer(");
    expect(sql048).toContain(
      "Solo Director o Admin I.E. pueden rechazar transferencias"
    );
    expect(sql048).toContain(
      "Solo puede rechazar transferencias de su institución (origen)"
    );
    expect(sql048).toContain("IF v_transfer.status != 'pending' THEN");
    expect(sql048).toContain("SET status = 'rejected'");
    expect(sql048).toContain("'transfer_rejected'");
    expect(sql048).toContain("'role_action', 'A_rechaza'");
  });
});

describe("T62 — flujo A1 (modelo) y limpieza de flujo 019", () => {
  it("fases: none → pending (B) → approved|rejected (A); sin accepted en camino nuevo", () => {
    type Phase = "none" | "pending" | "approved" | "rejected";
    let phase: Phase = "none";
    phase = "pending";
    expect(phase).toBe("pending");
    phase = "approved";
    expect(phase).toBe("approved");
    expect(sql048).toContain("DROP FUNCTION IF EXISTS accept_transfer(UUID)");
    expect(sql048).toContain(
      "DROP FUNCTION IF EXISTS accept_transfer(UUID, UUID, UUID, VARCHAR)"
    );
    expect(sql048).toContain("DROP FUNCTION IF EXISTS execute_transfer(UUID, UUID)");
    expect(sql048).toContain(
      "DROP FUNCTION IF EXISTS process_transfer(UUID, TEXT, UUID, TEXT)"
    );
  });

  it("048 elimina accept_transfer; verificación runtime exige A1", () => {
    expect(sql048).toContain("SECURITY DEFINER");
    expect(sql048).toContain("initiate_transfer");
    expect(sql048).toContain("authorize_transfer");
    expect(sql048).toContain("reject_transfer");
    expect(sql048).toContain(
      "Error: accept_transfer aún existe (debe eliminarse en A1)"
    );
    expect(sql048).toContain("ux_transferencias_active_caso");
  });
});
