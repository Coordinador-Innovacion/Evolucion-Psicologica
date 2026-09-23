import { describe, expect, it } from "vitest";
import {
  rangeToIsoBounds,
  resolvePeriodRange,
} from "@/lib/analytics/period";
import { toUserMessage } from "@/lib/errors";
import {
  DOCUMENT_ROLES,
  canAccessDocuments,
} from "@/components/documentos/StudentDocumentsPanel";

/**
 * Integración: capa de errores + formas reales de PostgREST/Postgres/RED
 * usadas por hooks y páginas (toUserMessage como pipeline completo).
 */
describe("pipeline de errores PostgREST/Postgres → usuario", () => {
  it("RLS denial (42501) no filtra detalle técnico al usuario", () => {
    const pgError = {
      code: "42501",
      message:
        'new row violates row-level security policy for table "atenciones"',
      details: null,
      hint: null,
    };
    const ui = toUserMessage(pgError, "No tiene permisos");
    expect(ui).toBe("No tiene permisos para realizar esta acción.");
    expect(ui).not.toContain("row-level");
    expect(ui).not.toContain("atenciones");
  });

  it("constraint unique en estudiante", () => {
    const err = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "estudiantes_document_number_key"',
    };
    expect(toUserMessage(err, "fb")).toBe(
      "Ya existe un registro con estos datos únicos."
    );
  });

  it("PostgREST sin sesión", () => {
    expect(toUserMessage({ code: "PGRST301" }, "fb")).toBe(
      "La sesión ha expirado. Inicie sesión nuevamente."
    );
  });

  it("fetch failure de red", () => {
    const network = new TypeError("Failed to fetch");
    expect(toUserMessage(network, "Error de red")).toBe("Error de red");
  });

  it("mensaje de negocio ya amigable se conserva", () => {
    expect(
      toUserMessage(
        { message: "Licencia vencida. Las nuevas atenciones psicológicas están bloqueadas." },
        "fb"
      )
    ).toBe(
      "Licencia vencida. Las nuevas atenciones psicológicas están bloqueadas."
    );
  });

  it("mensaje de negocio de promoción se conserva", () => {
    expect(
      toUserMessage(
        { message: "No tiene permisos para realizar promoción" },
        "fb"
      )
    ).toBe("No tiene permisos para realizar promoción");
  });
});

/**
 * Integración: filtro de período de analítica → límites ISO usados en queries.
 */
describe("filtro de período → bounds para queries", () => {
  const now = new Date(2026, 5, 15);

  it("este mes produce rango inclusivo coherente para gte/lte", () => {
    const range = resolvePeriodRange("this_month", null, null, now);
    const { startIso, endIso } = rangeToIsoBounds(range);
    expect(startIso <= endIso).toBe(true);
    const mid = new Date("2026-06-15T12:00:00");
    expect(mid.getTime()).toBeGreaterThanOrEqual(new Date(startIso).getTime());
    expect(mid.getTime()).toBeLessThanOrEqual(new Date(endIso).getTime());
  });

  it("día fuera del rango queda fuera de los bounds", () => {
    const range = resolvePeriodRange("this_month", null, null, now);
    const { startIso, endIso } = rangeToIsoBounds(range);
    const outside = new Date("2026-05-31T23:00:00");
    expect(outside.getTime() < new Date(startIso).getTime()).toBe(true);
    const after = new Date("2026-07-01T00:00:01");
    expect(after.getTime() > new Date(endIso).getTime()).toBe(true);
  });

  it("personalizado inverso se normaliza antes de filtrar", () => {
    const range = resolvePeriodRange("custom", "2026-06-30", "2026-06-01", now);
    expect(range.start).toBe("2026-06-01");
    expect(range.end).toBe("2026-06-30");
    const { startIso, endIso } = rangeToIsoBounds(range);
    expect(startIso <= endIso).toBe(true);
  });
});

/**
 * Integración: matriz de permisos de documentos coherente con roles de analítica.
 */
describe("permisos de documentos × roles de analítica", () => {
  it("psicologo ve documentos en analítica", () => {
    expect(canAccessDocuments("psicologo")).toBe(true);
  });

  it("docente accede analítica (consulta) pero NO documentos", () => {
    const analiticaRoles = [
      "global",
      "director",
      "admin_ie",
      "coordinador",
      "psicologo",
      "docente",
    ];
    expect(analiticaRoles).toContain("docente");
    expect(canAccessDocuments("docente")).toBe(false);
  });

  it("coordinador ve documentos", () => {
    expect(canAccessDocuments("coordinador")).toBe(true);
  });

  it("DOCUMENT_ROLES no contiene docente", () => {
    expect(DOCUMENT_ROLES.includes("docente" as never)).toBe(false);
  });
});
