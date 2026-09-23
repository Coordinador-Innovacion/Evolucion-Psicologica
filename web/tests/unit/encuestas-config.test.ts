import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUS_LABELS,
  QUESTION_TYPES_WITH_OPTIONS,
  createDefaultConfig,
  createDefaultPresentation,
  needsOptions,
} from "@/types/encuestas";
import type { SurveyQuestionType } from "@/types/supabase";

describe("needsOptions", () => {
  it("requiere opciones solo en tipos de selección", () => {
    expect(needsOptions("opcion_unica")).toBe(true);
    expect(needsOptions("seleccion_multiple")).toBe(true);
    expect(needsOptions("seleccion_opciones")).toBe(true);
  });

  it("no requiere opciones en tipos libres o cerrados sin opciones", () => {
    expect(needsOptions("texto_corto")).toBe(false);
    expect(needsOptions("texto_largo")).toBe(false);
    expect(needsOptions("si_no")).toBe(false);
    expect(needsOptions("numero")).toBe(false);
    expect(needsOptions("fecha")).toBe(false);
    expect(needsOptions("escala")).toBe(false);
  });

  it("QUESTION_TYPES_WITH_OPTIONS coincide con needsOptions", () => {
    const all: SurveyQuestionType[] = [
      "texto_corto",
      "texto_largo",
      "opcion_unica",
      "seleccion_multiple",
      "si_no",
      "numero",
      "fecha",
      "escala",
      "seleccion_opciones",
    ];
    for (const t of all) {
      expect(needsOptions(t)).toBe(QUESTION_TYPES_WITH_OPTIONS.includes(t));
    }
  });
});

describe("createDefaultConfig", () => {
  it("escala tiene min/max y labels", () => {
    expect(createDefaultConfig("escala")).toEqual({
      min: 1,
      max: 5,
      min_label: "Mínimo",
      max_label: "Máximo",
    });
  });

  it("numero permite null en min/max y decimal_places 0", () => {
    expect(createDefaultConfig("numero")).toEqual({
      min: null,
      max: null,
      decimal_places: 0,
    });
  });

  it("texto_corto limita a 255", () => {
    expect(createDefaultConfig("texto_corto")).toEqual({ max_length: 255 });
  });

  it("texto_largo limita a 2000", () => {
    expect(createDefaultConfig("texto_largo")).toEqual({ max_length: 2000 });
  });

  it("seleccion_opciones no multiple por defecto", () => {
    expect(createDefaultConfig("seleccion_opciones")).toEqual({
      allow_multiple: false,
    });
  });

  it("tipos sin config especial devuelven {}", () => {
    expect(createDefaultConfig("opcion_unica")).toEqual({});
    expect(createDefaultConfig("seleccion_multiple")).toEqual({});
    expect(createDefaultConfig("si_no")).toEqual({});
    expect(createDefaultConfig("fecha")).toEqual({});
  });
});

describe("createDefaultPresentation", () => {
  it("ancho full por defecto", () => {
    expect(createDefaultPresentation()).toEqual({ width: "full" });
  });
});

describe("APPLICATION_STATUS_LABELS", () => {
  it("cubre estados del tipo ApplicationStatus", () => {
    const statuses = [
      "scheduled",
      "active",
      "extended",
      "completed",
      "closed",
      "expired",
    ];
    for (const s of statuses) {
      expect(APPLICATION_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it("completed se etiqueta Completada", () => {
    expect(APPLICATION_STATUS_LABELS.completed).toBe("Completada");
  });
});
