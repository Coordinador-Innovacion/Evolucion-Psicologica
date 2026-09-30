import { test, expect } from "@playwright/test";

/**
 * F2 — EST-01..09 + ACA-01..03 (E2E-01 del spec §8).
 * Limitación del entorno: sin BD/Supabase local, este spec cubre solo el
 * comportamiento UI-only (protección de rutas). La verificación de filas
 * reales (estudiantes, periodos_escolares, familiares, asignaciones_docentes)
 * queda pendiente y los IDs correspondientes se reportan como 🟡.
 */

const PROTECTED = [
  "/estudiantes",
  "/estudiantes/nuevo",
  "/estudiantes/00000000-0000-4000-8000-000000000000",
  "/academico/niveles",
  "/academico/asignaciones",
  "/academico/secciones",
];

// Compilación en frío de rutas pesadas en dev: dar margen al goto.
test.setTimeout(120_000);

test.describe("F2 — rutas de EST/ACA protegidas (UI-only)", () => {
  for (const route of PROTECTED) {
    test(`${route} sin sesión redirige al login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 45_000 });
    });
  }

  test("login accesible para continuar el flujo E2E-01", async ({ page }) => {
    await page.goto("/estudiantes");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 45_000 });
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" })
    ).toBeVisible();
  });
});
