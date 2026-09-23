import { describe, expect, it } from "vitest";
import {
  PERIOD_PRESET_LABELS,
  isValidDateOnly,
  rangeToIsoBounds,
  resolvePeriodRange,
} from "@/lib/analytics/period";

describe("resolvePeriodRange", () => {
  const now = new Date(2026, 8, 15); // 15 sep 2026 (mes 0-based)

  it("este mes: desde día 1 hasta último día del mes", () => {
    expect(resolvePeriodRange("this_month", null, null, now)).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("mes anterior", () => {
    expect(resolvePeriodRange("last_month", null, null, now)).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("últimos 3 meses: desde el inicio del mes -2 hasta fin del mes actual", () => {
    expect(resolvePeriodRange("last_3_months", null, null, now)).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
  });

  it("este año", () => {
    expect(resolvePeriodRange("this_year", null, null, now)).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("personalizado usa from/to", () => {
    expect(
      resolvePeriodRange("custom", "2026-01-10", "2026-03-05", now)
    ).toEqual({ start: "2026-01-10", end: "2026-03-05" });
  });

  it("personalizado invierte si desde > hasta", () => {
    expect(
      resolvePeriodRange("custom", "2026-03-05", "2026-01-10", now)
    ).toEqual({ start: "2026-01-10", end: "2026-03-05" });
  });

  it("personalizado vacío usa hoy", () => {
    expect(resolvePeriodRange("custom", "", null, now)).toEqual({
      start: "2026-09-15",
      end: "2026-09-15",
    });
  });

  it("cruce de año en mes anterior (enero)", () => {
    const jan = new Date(2026, 0, 10);
    expect(resolvePeriodRange("last_month", null, null, jan)).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });

  it("labels de presets completos", () => {
    expect(Object.keys(PERIOD_PRESET_LABELS).sort()).toEqual(
      [
        "custom",
        "last_3_months",
        "last_month",
        "this_month",
        "this_year",
      ].sort()
    );
  });
});

describe("rangeToIsoBounds", () => {
  it("convierte rango a ISO de día completo inclusivo", () => {
    const { startIso, endIso } = rangeToIsoBounds({
      start: "2026-03-01",
      end: "2026-03-15",
    });
    const start = new Date(startIso);
    const end = new Date(endIso);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it("start <= end para cualquier rango válido", () => {
    const r = rangeToIsoBounds({ start: "2026-01-01", end: "2026-12-31" });
    expect(r.startIso <= r.endIso).toBe(true);
  });
});

describe("isValidDateOnly", () => {
  it("acepta YYYY-MM-DD", () => {
    expect(isValidDateOnly("2026-09-15")).toBe(true);
  });

  it("rechaza formatos inválidos", () => {
    expect(isValidDateOnly("15/09/2026")).toBe(false);
    expect(isValidDateOnly("2026-9-5")).toBe(false);
    expect(isValidDateOnly("")).toBe(false);
  });
});
