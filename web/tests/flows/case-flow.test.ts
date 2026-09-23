import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CasoEstado } from "@/types/supabase";

/**
 * T61 — Casos y Atenciones
 * Reglas: 02_SPECIFY (Caso/Atención), 07_CONVERGE, 04_PLAN, migraciones 007/008/031/036/038.
 * Verificación estática de SQL + lógica de ventana en cliente.
 * No sustituye pruebas allow/deny en vivo (pendiente sin BD).
 */

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

function mig(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

const sql007 = mig("007_referrals_and_cases.sql");
const sql008 = mig("008_attentions.sql");
const sql031 = mig("031_case_management.sql");
const sql036 = mig("036_case_rls_institution_scope.sql");
const sql038 = mig("038_case_flow_fixes.sql");

/** Transiciones del camino de negocio (SPECIFY/CONVERGE). */
const ALLOWED_TRANSITIONS: Record<CasoEstado, CasoEstado[]> = {
  // close_case SQL permite cerrar desde inicio o en_proceso (solo niega ya cerrado);
  // el camino documentado es Inicio → En proceso → Cerrado.
  inicio: ["en_proceso", "cerrado"],
  en_proceso: ["cerrado"],
  cerrado: ["inicio"],
};

function canTransition(from: CasoEstado, to: CasoEstado): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Ventana de edición de atención (30 min, hora del servidor en SQL). */
const ATTENTION_EDIT_WINDOW_MINUTES = 30;

function remainingEditMinutes(createdAt: Date, now: Date): number {
  const elapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60);
  return Math.max(0, ATTENTION_EDIT_WINDOW_MINUTES - elapsed);
}

function canEditAttention(createdAt: Date, now: Date): boolean {
  return remainingEditMinutes(createdAt, now) > 0;
}

describe("T61 — esquema de Caso y Atención", () => {
  it("casos: CHECK de estados solo permite inicio|en_proceso|cerrado", () => {
    expect(sql007).toContain(
      "CHECK (estado IN ('inicio', 'en_proceso', 'cerrado'))"
    );
    expect(sql007).not.toMatch(/estado IN \([^)]*activo[^)]*\)/i);
  });

  it("casos: creación por defecto es Inicio", () => {
    expect(sql007).toContain("DEFAULT 'inicio'");
  });

  it("atenciones: NOT NULL en motivo y que_se_hizo; sin borrado físico por diseño", () => {
    expect(sql008).toMatch(/motivo TEXT NOT NULL/);
    expect(sql008).toMatch(/que_se_hizo TEXT NOT NULL/);
    expect(sql008).not.toMatch(/ON DELETE CASCADE[\s\S]{0,80}atenciones/);
  });

  it("atenciones: cascade desde casos conserva historia al no borrar el caso", () => {
    expect(sql008).toContain("caso_id UUID NOT NULL REFERENCES casos(id) ON DELETE CASCADE");
  });
});

describe("T61 — flujo de estados (SPECIFY/CONVERGE)", () => {
  it("transiciones permitidas: Inicio→En proceso, En proceso→Cerrado, Cerrado→Inicio", () => {
    expect(canTransition("inicio", "en_proceso")).toBe(true);
    expect(canTransition("en_proceso", "cerrado")).toBe(true);
    expect(canTransition("cerrado", "inicio")).toBe(true);
  });

  it("no hay reapertura sin cerrar ni auto-transición a sí mismo", () => {
    expect(canTransition("en_proceso", "inicio")).toBe(false);
    expect(canTransition("inicio", "inicio")).toBe(false);
    expect(canTransition("cerrado", "en_proceso")).toBe(false);
    expect(canTransition("cerrado", "cerrado")).toBe(false);
  });

  it("close_case SQL solo niega si ya está cerrado (permite Inicio→Cerrado documentado)", () => {
    expect(sql038).toContain("El caso ya está cerrado");
    expect(canTransition("inicio", "cerrado")).toBe(true);
    expect(canTransition("en_proceso", "cerrado")).toBe(true);
    expect(canTransition("cerrado", "inicio")).toBe(true);
  });
});

describe("T61 — cierre y reapertura (031 + 038)", () => {
  it("close_case: solo global|psicologo, exige motivo, no re-cierra", () => {
    expect(sql038).toContain(
      "IF v_user_role NOT IN ('global', 'psicologo') THEN"
    );
    expect(sql038).toContain("El caso ya está cerrado");
    expect(sql038).toContain("El motivo de cierre es obligatorio");
    expect(sql038).toContain("SET estado = 'cerrado'");
    expect(sql038).toContain("close_reason");
  });

  it("close_case: cierra fila abierta del historial (desde/hasta) sin duplicar", () => {
    expect(sql038).toMatch(
      /SELECT id INTO v_open_row_id[\s\S]*hasta IS NULL[\s\S]*UPDATE caso_responsables_historial[\s\S]*SET hasta = NOW/
    );
    expect(sql038).toContain("motivo_salida = 'cierre_de_caso'");
  });

  it("reopen_case: solo Cerrado→Inicio, exige motivo, reasigna responsable", () => {
    expect(sql031).toContain("Solo se pueden reabrir casos cerrados");
    expect(sql031).toContain("El motivo de reapertura es obligatorio");
    expect(sql031).toContain("SET estado = 'inicio'");
    expect(sql031).toContain("current_responsible_id = v_psychologist_id");
    expect(sql031).toContain("'case_reopened'");
  });

  it("acote institucional en close/reopen (no-global exige periodo activo)", () => {
    expect(sql038).toMatch(
      /v_user_role != 'global'[\s\S]*periodos_escolares[\s\S]*institution_id = v_user_institution/
    );
    expect(sql031).toMatch(
      /v_user_role != 'global'[\s\S]*periodos_escolares[\s\S]*institution_id = v_user_institution/
    );
  });
});

describe("T61 — primera atención y reapertura (038 vigente sobre 031)", () => {
  it("trigger transiciona Inicio→En proceso con la primera atención", () => {
    expect(sql038).toContain("IF v_caso.estado = 'inicio' THEN");
    expect(sql038).toContain("SET estado = 'en_proceso'");
    expect(sql038).toContain("'case_auto_transition'");
    expect(sql038).toContain("'first_attention'");
  });

  it("tras reapertura también transiciona (no solo count=1 de la vida del caso)", () => {
    expect(sql038).toContain("'first_attention_after_reopen'");
    expect(sql038).not.toMatch(
      /IF v_attention_count = 1 AND v_caso\.estado = 'inicio'/
    );
  });

  it("aborta atención en caso Cerrado con mensaje de reapertura", () => {
    expect(sql038).toContain(
      "No se puede crear una atención en un caso cerrado. Reabra el caso primero."
    );
    expect(sql038).toMatch(
      /IF v_caso\.estado = 'cerrado' THEN\s+RAISE EXCEPTION/
    );
  });

  it("038 recrea trigger y función close_case (corrección T54 aplicada)", () => {
    expect(sql038).toContain("CREATE OR REPLACE FUNCTION trigger_case_first_attention()");
    expect(sql038).toContain("CREATE OR REPLACE FUNCTION close_case(");
    expect(sql038).toContain("trg_case_first_attention");
    expect(sql038).toContain("CREATE TRIGGER trg_case_first_attention");
  });
});

describe("T61 — ventana de 30 minutos (update_attention)", () => {
  it("031 valida ventana con hora del servidor (CURRENT_TIMESTAMP)", () => {
    expect(sql031).toContain("CREATE OR REPLACE FUNCTION update_attention(");
    expect(sql031).toMatch(
      /EXTRACT\(EPOCH FROM \(CURRENT_TIMESTAMP - v_attention\.created_at\)\) \/ 60/
    );
    expect(sql031).toContain("v_elapsed_minutes > 30");
    expect(sql031).toContain("Solo Psicólogo o Global pueden editar atenciones");
    expect(sql031).toContain("edited_at = CURRENT_TIMESTAMP");
  });

  it("ventana del cliente: editable solo dentro de 30 minutos", () => {
    const created = new Date("2026-01-20T10:00:00Z");
    const dentro = new Date("2026-01-20T10:29:59Z");
    const enLimite = new Date("2026-01-20T10:30:00Z");
    const fuera = new Date("2026-01-20T10:31:00Z");

    expect(canEditAttention(created, dentro)).toBe(true);
    expect(canEditAttention(created, enLimite)).toBe(false);
    expect(canEditAttention(created, fuera)).toBe(false);
    expect(remainingEditMinutes(created, enLimite)).toBe(0);
    expect(remainingEditMinutes(created, dentro)).toBeGreaterThan(0);
  });

  it("la autoridad final de la ventana es el servidor, no el cliente", () => {
    expect(sql031).toContain("SECURITY DEFINER");
    expect(sql031).toMatch(/CURRENT_TIMESTAMP/);
  });
});

describe("T61 — RLS de casos/atenciones (036)", () => {
  it("casos: FOR ALL exige psicologo + institución vía periodos_escolares", () => {
    expect(sql036).toContain(
      'CREATE POLICY "Psychologist can manage cases in their institution"'
    );
    expect(sql036).not.toContain(
      'CREATE POLICY "Psychologist can manage cases"\n    ON casos'
    );
  });

  it("atenciones e historial acotados por caso → estudiante → institución", () => {
    expect(sql036).toContain(
      'CREATE POLICY "Psychologist can manage attentions in their institution"'
    );
    expect(sql036).toContain(
      'CREATE POLICY "Psychologist can manage case history in their institution"'
    );
    expect(sql036).toMatch(
      /caso_id IN \([\s\S]*periodos_escolares[\s\S]*institution_id = get_user_institution\(\)/
    );
  });
});
