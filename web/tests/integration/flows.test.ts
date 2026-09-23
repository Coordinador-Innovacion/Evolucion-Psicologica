import { describe, expect, it } from "vitest";
import { createDefaultConfig, needsOptions } from "@/types/encuestas";
import { resolvePeriodRange, rangeToIsoBounds } from "@/lib/analytics/period";

/**
 * Integración: flujo multi-pieza del constructor de encuestas
 * (tipo → necesidad de opciones → config por defecto).
 */
describe("flujo constructor: tipo de pregunta → config", () => {
  it("opcion_unica exige opciones y config vacía", () => {
    expect(needsOptions("opcion_unica")).toBe(true);
    expect(createDefaultConfig("opcion_unica")).toEqual({});
  });

  it("escala no exige opciones y trae min/max", () => {
    expect(needsOptions("escala")).toBe(false);
    const cfg = createDefaultConfig("escala");
    expect(cfg.min).toBe(1);
    expect(cfg.max).toBe(5);
  });

  it("seleccion_multiple exige opciones", () => {
    expect(needsOptions("seleccion_multiple")).toBe(true);
  });

  it("texto_largo configura max_length útil para UI", () => {
    expect(needsOptions("texto_largo")).toBe(false);
    expect(createDefaultConfig("texto_largo").max_length).toBe(2000);
  });
});

/**
 * Integración: selección de período rápido → filtros de analítica.
 * Simula el camino que usa la página /analitica sin montar React.
 */
describe("flujo analítica: preset → filtros de fecha", () => {
  const now = new Date(2026, 0, 20); // 20 ene 2026

  function applyPreset(
    preset: "this_month" | "last_month" | "last_3_months" | "this_year" | "custom",
    from?: string,
    to?: string
  ) {
    const range = resolvePeriodRange(preset, from ?? null, to ?? null, now);
    const bounds = rangeToIsoBounds(range);
    return { range, bounds };
  }

  it("este mes en enero cubre solo enero", () => {
    const { range } = applyPreset("this_month");
    expect(range.start).toBe("2026-01-01");
    expect(range.end).toBe("2026-01-31");
  });

  it("mes anterior en enero es diciembre del año previo", () => {
    const { range } = applyPreset("last_month");
    expect(range.start).toBe("2025-12-01");
    expect(range.end).toBe("2025-12-31");
  });

  it("personalizado normaliza orden invertido", () => {
    const { range, bounds } = applyPreset("custom", "2026-02-01", "2026-01-01");
    expect(range.start).toBe("2026-01-01");
    expect(range.end).toBe("2026-02-01");
    expect(bounds.startIso <= bounds.endIso).toBe(true);
  });

  it("este año usa bounds de año completo", () => {
    const { bounds } = applyPreset("this_year");
    expect(new Date(bounds.startIso).getFullYear()).toBe(2026);
    expect(new Date(bounds.endIso).getFullYear()).toBe(2026);
    expect(new Date(bounds.endIso).getMonth()).toBe(11);
  });
});

/**
 * Integración: rol → puede ver documentos en analítica.
 */
describe("flujo analítica: rol → includeDocs", () => {
  const canAccess = (role: string | null | undefined): boolean => {
    const DOCUMENT_ROLES = [
      "global",
      "director",
      "admin_ie",
      "coordinador",
      "psicologo",
    ];
    return (
      role !== null &&
      role !== undefined &&
      DOCUMENT_ROLES.includes(role)
    );
  };

  it.each([
    ["global", true],
    ["director", true],
    ["admin_ie", true],
    ["coordinador", true],
    ["psicologo", true],
    ["docente", false],
  ] as const)("rol %s → documentos=%s", (role, expected) => {
    expect(canAccess(role)).toBe(expected);
  });
});
