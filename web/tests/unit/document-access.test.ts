import { describe, expect, it } from "vitest";
import {
  DOCUMENT_ROLES,
  canAccessDocuments,
} from "@/components/documentos/StudentDocumentsPanel";

describe("canAccessDocuments / DOCUMENT_ROLES", () => {
  it("permite roles documentales definidos (SPECIFY/037)", () => {
    for (const role of ["global", "director", "admin_ie", "coordinador", "psicologo"]) {
      expect(canAccessDocuments(role)).toBe(true);
      expect(DOCUMENT_ROLES).toContain(role);
    }
  });

  it("niega a docente (SPECIFY: sin función sobre documentos)", () => {
    expect(canAccessDocuments("docente")).toBe(false);
    expect(DOCUMENT_ROLES).not.toContain("docente");
  });

  it("niega null/undefined/rol desconocido", () => {
    expect(canAccessDocuments(null)).toBe(false);
    expect(canAccessDocuments(undefined)).toBe(false);
    expect(canAccessDocuments("otro_rol")).toBe(false);
  });

  it("DOCUMENT_ROLES es exactamente el conjunto de upload_document", () => {
    expect([...DOCUMENT_ROLES].sort()).toEqual(
      ["admin_ie", "coordinador", "director", "global", "psicologo"].sort()
    );
  });
});
