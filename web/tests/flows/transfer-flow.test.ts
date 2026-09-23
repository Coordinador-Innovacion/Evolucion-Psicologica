import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TransferenciaStatus } from "@/types/supabase";

/**
 * T62 — Transferencias
 * Regla vigente (019): A (origen) inicia con efecto inmediato; B (destino)
 * acepta y crea PeriodoEscolar; queda pending/accepted indefinidamente sin
 * reversión automática. SPECIFY (B solicita/A autoriza) es el flujo histórico
 * de 009/016/017; 019 lo reemplaza para el flujo actual de traslado.
 * Contradicción de CHECK (009 vs 'accepted' de 019) corregida en 040.
 */

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

function mig(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

const sql009 = mig("009_transfers.sql");
const sql019 = mig("019_transfer_flow_fix.sql");
const sql040 = mig("040_transfer_status_accepted_fix.sql");

const TRANSFER_ROLES = ["global", "director", "admin_ie"] as const;

type TransferPhase = "none" | "pending" | "accepted";

/** Estados activos: 019 considera pending y accepted como transferencia activa. */
function isActiveTransfer(status: TransferenciaStatus): boolean {
  return status === "pending" || status === "accepted";
}

function canInitiate(role: string): boolean {
  return (TRANSFER_ROLES as readonly string[]).includes(role);
}

function canAccept(role: string): boolean {
  return (TRANSFER_ROLES as readonly string[]).includes(role);
}

describe("T62 — esquema y CHECK de status", () => {
  it("009: origen ≠ destino en CHECK", () => {
    expect(sql009).toContain(
      "CHECK (origin_institution_id != destination_institution_id)"
    );
  });

  it("040: CHECK incluye 'accepted' (corrige contradicción 009 vs 019)", () => {
    expect(sql040).toContain("DROP CONSTRAINT IF EXISTS transferencias_status_check");
    expect(sql040).toContain(
      "CHECK (status IN ('pending', 'accepted', 'approved', 'rejected', 'completed'))"
    );
    expect(sql040).toContain("transferencias_status_check");
  });

  it("tipo TS TransferenciaStatus incluye accepted", () => {
    const statuses: TransferenciaStatus[] = [
      "pending",
      "accepted",
      "approved",
      "rejected",
      "completed",
    ];
    expect(statuses).toContain("accepted");
    expect(isActiveTransfer("pending")).toBe(true);
    expect(isActiveTransfer("accepted")).toBe(true);
    expect(isActiveTransfer("approved")).toBe(false);
    expect(isActiveTransfer("completed")).toBe(false);
  });
});

describe("T62 — initiate_transfer (019): efecto inmediato en A", () => {
  it("solo global|director|admin_ie pueden iniciar", () => {
    expect(sql019).toContain(
      "IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN"
    );
    expect(sql019).toContain(
      "Solo Director o Admin I.E. pueden iniciar transferencias"
    );
    expect(canInitiate("director")).toBe(true);
    expect(canInitiate("admin_ie")).toBe(true);
    expect(canInitiate("global")).toBe(true);
    expect(canInitiate("psicologo")).toBe(false);
    expect(canInitiate("docente")).toBe(false);
    expect(canInitiate("coordinador")).toBe(false);
  });

  it("no-global debe ser de la institución origen", () => {
    expect(sql019).toContain(
      "Solo puede transferir estudiantes de su institución"
    );
  });

  it("bloquea misma institución destino", () => {
    expect(sql019).toContain(
      "La institución origen y destino deben ser diferentes"
    );
  });

  it("bloquea doble transferencia activa (pending o accepted)", () => {
    expect(sql019).toContain(
      "AND status IN ('pending', 'accepted')"
    );
    expect(sql019).toContain(
      "Ya existe una transferencia activa para este caso"
    );
  });

  it("efecto inmediato: transferred_at=NOW, cierra periodo A, limpia responsable", () => {
    expect(sql019).toMatch(
      /transferred_at[\s\S]{0,400}NOW\(\)/
    );
    expect(sql019).toContain("motivo_retiro = 'transferencia_a_otra_institucion'");
    expect(sql019).toContain("SET end_date = CURRENT_DATE");
    expect(sql019).toContain("current_responsible_id = NULL");
    expect(sql019).toContain("motivo_salida");
    expect(sql019).toContain("'transfer_initiated'");
    expect(sql019).toContain("'status', 'pending'");
  });

  it("insert inicial usa status pending", () => {
    expect(sql019).toMatch(
      /INSERT INTO transferencias[\s\S]*'pending'[\s\S]*NOW\(\)/
    );
  });
});

describe("T62 — accept_transfer (019): B acepta y crea periodo", () => {
  it("solo global|director|admin_ie del destino pueden aceptar", () => {
    expect(sql019).toContain(
      "IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN"
    );
    expect(sql019).toContain(
      "Solo puede aceptar transferencias destinadas a su institución"
    );
    expect(canAccept("director")).toBe(true);
    expect(canAccept("psicologo")).toBe(false);
  });

  it("solo acepta status pending", () => {
    expect(sql019).toContain("IF v_transfer.status != 'pending' THEN");
    expect(sql019).toContain("Solo se pueden aceptar transferencias pendientes");
  });

  it("aceptar cambia status a 'accepted' y audita", () => {
    expect(sql019).toContain("SET status = 'accepted'");
    expect(sql019).toContain("'transfer_accepted'");
    expect(sql019).toContain("'status', 'accepted'");
    expect(sql019).toContain("new_period_id");
  });

  it("crea PeriodoEscolar en destino con tipo regular", () => {
    expect(sql019).toMatch(
      /INSERT INTO periodos_escolares[\s\S]*'regular'/
    );
    expect(sql019).toContain("v_transfer.destination_institution_id");
  });

  it("asigna responsable Director de B y registra historial", () => {
    expect(sql019).toMatch(
      /UPDATE casos[\s\S]*current_responsible_id = \([\s\S]*role = 'director'[\s\S]*destination_institution_id/
    );
    expect(sql019).toContain("INSERT INTO caso_responsables_historial");
  });

  it("no hay reversión: no se elimina transferencia ni se restaura A", () => {
    expect(sql019).not.toMatch(/DELETE FROM transferencias/);
    expect(sql019).not.toMatch(/ROLLBACK|revert/i);
  });
});

describe("T62 — flujo de fases (modelo)", () => {
  it("none → pending al iniciar; pending → accepted al aceptar; sin vuelta atrás", () => {
    let phase: TransferPhase = "none";
    phase = "pending";
    expect(phase).toBe("pending");
    phase = "accepted";
    expect(phase).toBe("accepted");
    // accepted no vuelve a pending en 019
    expect(sql019).not.toMatch(/status = 'pending'[\s\S]{0,80}WHERE id = p_transfer_id/);
  });

  it("019 elimina process_transfer antiguo (flujo A autoriza de 009)", () => {
    expect(sql019).toContain("DROP FUNCTION IF EXISTS process_transfer(UUID, TEXT, TEXT)");
    expect(sql019).toContain("DROP FUNCTION IF EXISTS execute_transfer(UUID, UUID)");
  });

  it("inicio y aceptación exigen roles server-side (SECURITY DEFINER)", () => {
    expect(sql019).toContain("SECURITY DEFINER");
    expect(sql019).toContain("initiate_transfer");
    expect(sql019).toContain("accept_transfer");
  });
});
