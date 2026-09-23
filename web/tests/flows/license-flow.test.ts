import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LicenseStatus } from "@/hooks/useLicenseStatus";

/**
 * T63 — Licencias
 * DC-003 (VIGENTE): licencia vencida solo bloquea nuevas atenciones psicológicas
 * server-side; no cambia roles, no cierra sesiones (DC-005).
 * DC-004: alerta a ≤30 días con días restantes; vencida indica bloqueo.
 * Migraciones 010 (tablas) y 032 (funciones).
 */

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

function mig(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

const sql010 = mig("010_licenses.sql");
const sql032 = mig("032_licenses.sql");

/** Espejo de get_license_status (032) para casos de borde. */
function deriveLicenseStatus(
  start: string,
  end: string,
  today: string
): { status: LicenseStatus | "unknown"; daysRemaining: number } {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  const t = new Date(today + "T00:00:00Z").getTime();
  const daysRemaining = Math.round((e - t) / (24 * 60 * 60 * 1000));

  if (s <= t && e >= t) {
    return {
      status: daysRemaining <= 30 ? "expiring_soon" : "active",
      daysRemaining,
    };
  }
  if (e < t) return { status: "expired", daysRemaining };
  if (s > t) return { status: "scheduled", daysRemaining };
  return { status: "unknown", daysRemaining };
}

/** Espejo de can_create_attention (032) para no-global. */
function canCreateAttention(
  license: { start: string; end: string } | null,
  today: string
): { allowed: boolean; reason: string } {
  const t = new Date(today + "T00:00:00Z").getTime();
  if (!license) return { allowed: false, reason: "no_license" };
  const s = new Date(license.start + "T00:00:00Z").getTime();
  const e = new Date(license.end + "T00:00:00Z").getTime();
  if (s <= t && e >= t) return { allowed: true, reason: "active" };
  if (e < t) return { allowed: false, reason: "expired" };
  return { allowed: false, reason: "no_license" };
}

describe("T63 — esquema de licencias (010)", () => {
  it("licencias: fechas NOT NULL e institución FK", () => {
    expect(sql010).toContain("institution_id UUID NOT NULL");
    expect(sql010).toContain("start_date DATE NOT NULL");
    expect(sql010).toContain("end_date DATE NOT NULL");
  });

  it("renovación = nuevo registro; sin solapamiento por EXCLUDE GIST", () => {
    expect(sql010).toContain("EXCLUDE USING GIST");
    expect(sql010).toContain("institution_id WITH =");
    expect(sql010).toContain("daterange(start_date, end_date, '[]') WITH &&");
  });

  it("códigos de licencia únicos y no reutilizados", () => {
    expect(sql010).toContain("code VARCHAR(100) UNIQUE NOT NULL");
    expect(sql010).toContain("UNIQUE(license_id, code)");
  });
});

describe("T63 — get_license_status / DC-004 (032)", () => {
  it("estados derivados: active, expiring_soon, expired, scheduled, none", () => {
    expect(sql032).toContain("CREATE OR REPLACE FUNCTION get_license_status(");
    expect(sql032).toContain("'expiring_soon'");
    expect(sql032).toContain("'expired'");
    expect(sql032).toContain("'scheduled'");
    expect(sql032).toContain("'none'");
    expect(sql032).toContain("'active'");
  });

  it("alerta ≤30 días con días restantes (DC-004)", () => {
    expect(sql032).toContain("IF v_days_remaining <= 30 THEN");
    expect(sql032).toMatch(/Faltan ' \|\| v_days_remaining \|\| ' día\(s\)/);
  });

  it("vencida indica bloqueo de nuevas atenciones (DC-003/DC-004)", () => {
    expect(sql032).toContain(
      "Licencia vencida. Las nuevas atenciones psicológicas están bloqueadas."
    );
  });

  it("casos de borde del espejo cliente", () => {
    expect(deriveLicenseStatus("2026-01-01", "2026-12-31", "2026-06-15").status).toBe("active");
    expect(deriveLicenseStatus("2026-01-01", "2026-12-31", "2026-12-01").status).toBe("expiring_soon");
    expect(deriveLicenseStatus("2026-01-01", "2026-03-31", "2026-04-01").status).toBe("expired");
    expect(deriveLicenseStatus("2026-05-01", "2026-12-31", "2026-04-15").status).toBe("scheduled");
    expect(deriveLicenseStatus("2026-01-01", "2026-12-31", "2026-12-02").daysRemaining).toBe(29);
  });
});

describe("T63 — can_create_attention / DC-003 (032)", () => {
  it("bloquea solo si no hay licencia vigente o está vencida", () => {
    expect(sql032).toContain("CREATE OR REPLACE FUNCTION can_create_attention(");
    expect(sql032).toContain("'reason', 'expired'");
    expect(sql032).toContain("'reason', 'no_license'");
    expect(sql032).toContain("'allowed', true");
    expect(canCreateAttention(null, "2026-06-15")).toEqual({
      allowed: false,
      reason: "no_license",
    });
    expect(
      canCreateAttention({ start: "2026-01-01", end: "2026-06-01" }, "2026-06-15")
    ).toEqual({ allowed: false, reason: "expired" });
    expect(
      canCreateAttention({ start: "2026-01-01", end: "2026-12-31" }, "2026-06-15")
    ).toEqual({ allowed: true, reason: "active" });
  });

  it("licencia por vencer (≤30 días) permite crear atención", () => {
    expect(
      canCreateAttention({ start: "2026-01-01", end: "2026-12-31" }, "2026-12-15")
    ).toEqual({ allowed: true, reason: "active" });
    expect(sql032).toMatch(/v_days_remaining <= 30[\s\S]{0,120}expiring_soon/);
  });
});

describe("T63 — create_attention valida licencia en servidor (032)", () => {
  it("rpc create_attention: roles, caso cerrado y licencia server-side", () => {
    expect(sql032).toContain("CREATE OR REPLACE FUNCTION create_attention(");
    expect(sql032).toContain(
      "Solo Psicólogo o Global pueden crear atenciones"
    );
    expect(sql032).toContain(
      "No se puede crear una atención en un caso cerrado. Reabra el caso primero."
    );
    expect(sql032).toMatch(/can_create_attention\(v_user_institution\)/);
    expect(sql032).toContain("SECURITY DEFINER");
  });

  it("Global bypass la restricción de licencia", () => {
    expect(sql032).toContain("IF v_user_role != 'global' THEN");
    expect(sql032).toMatch(/v_license_check := can_create_attention/);
  });

  it("si la licencia está por vencer, crea con advertencia (no bloquea)", () => {
    expect(sql032).toContain("license_warning");
    expect(sql032).toContain("'reason') = 'expiring_soon'");
    expect(sql032).toContain("'success', true");
  });

  it("valida campos obligatorios motivo y que_se_hizo", () => {
    expect(sql032).toContain("El motivo es obligatorio");
    expect(sql032).toContain('El campo "qué se hizo" es obligatorio');
  });
});

describe("T63 — get_expiring_licenses (alerta Global, DC-004)", () => {
  it("incluye vencidas y ≤30 días, ordenadas por end_date", () => {
    expect(sql032).toContain("CREATE OR REPLACE FUNCTION get_expiring_licenses(");
    expect(sql032).toContain("WHERE l.end_date <= v_today + INTERVAL '30 days'");
    expect(sql032).toContain("ORDER BY l.end_date ASC");
    expect(sql032).toContain("days_remaining");
  });
});

describe("T63 — DC-003: no se invalida sesión ni se cambian roles", () => {
  it("032 no toca perfiles.role ni auth en vencimiento", () => {
    expect(sql032).not.toMatch(/UPDATE perfiles\s+SET role/);
    expect(sql032).not.toMatch(/auth\.signOut|goOffline|endSession/i);
  });

  it("solo create_attention consume can_create_attention; update_attention no exige licencia vigente", () => {
    expect(sql031HasNoLicenseGate()).toBe(true);
  });
});

function sql031HasNoLicenseGate(): boolean {
  const sql031 = mig("031_case_management.sql");
  return !sql031.includes("can_create_attention");
}
