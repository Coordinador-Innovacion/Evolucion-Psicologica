import { test, expect } from "@playwright/test";

/**
 * F5 — TRF/PRO (E2E-07 del spec §8).
 * Limitación del entorno: sin BD/Supabase local, este spec cubre solo el
 * comportamiento UI-only (protección de rutas). La verificación de filas
 * reales (transferencias, lotes_promocion, acciones/excepciones) queda
 * pendiente y los IDs correspondientes se reportan como 🟡.
 */

const PROTECTED = [
  "/transferencias",
  "/transferencias/nueva",
  "/transferencias/00000000-0000-4000-8000-000000000000",
  "/promocion",
  "/promocion/nueva",
  "/promocion/00000000-0000-4000-8000-000000000000",
];

// Compilación en frío de rutas pesadas en dev: dar margen al goto.
test.setTimeout(120_000);

test.describe("F5 — rutas de TRF/PRO protegidas (UI-only)", () => {
  for (const route of PROTECTED) {
    test(`${route} sin sesión redirige al login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 45_000 });
    });
  }

  test("login accesible para continuar el flujo E2E-07", async ({ page }) => {
    await page.goto("/transferencias/nueva");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 45_000 });
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" })
    ).toBeVisible();
  });
});
