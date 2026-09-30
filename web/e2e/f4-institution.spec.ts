import { test, expect } from "@playwright/test";

/**
 * F4 — IE/LIC/USR (E2E-02 del spec §8).
 * Limitación del entorno: sin BD/Supabase local, este spec cubre solo el
 * comportamiento UI-only (protección de rutas). La verificación de filas
 * reales (instituciones, licencias, licencia_codigos) queda pendiente y
 * los IDs correspondientes se reportan como 🟡.
 */

const PROTECTED = [
  "/instituciones",
  "/instituciones/nueva",
  "/instituciones/00000000-0000-4000-8000-000000000000",
  "/licencias",
  "/usuarios",
  "/usuarios/00000000-0000-4000-8000-000000000000",
  "/mi-institucion",
  "/configuracion/perfil",
  "/configuracion/seguridad",
];

// Compilación en frío de rutas pesadas en dev: dar margen al goto.
test.setTimeout(120_000);

test.describe("F4 — rutas de IE/LIC/USR protegidas (UI-only)", () => {
  for (const route of PROTECTED) {
    test(`${route} sin sesión redirige al login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 45_000 });
    });
  }

  test("login accesible para continuar el flujo E2E-02", async ({ page }) => {
    await page.goto("/instituciones/nueva");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 45_000 });
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" })
    ).toBeVisible();
  });
});
