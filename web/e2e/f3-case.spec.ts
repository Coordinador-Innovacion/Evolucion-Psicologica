import { test, expect } from "@playwright/test";

/**
 * F3 — CAS/ATN/DER/NEC (E2E-02 del spec §8).
 * Limitación del entorno: sin BD/Supabase local, este spec cubre solo el
 * comportamiento UI-only (protección de rutas). La verificación de filas
 * reales (casos, atenciones, derivaciones, necesidades) queda pendiente y
 * los IDs correspondientes se reportan como 🟡.
 */

const PROTECTED = [
  "/atenciones",
  "/derivaciones",
  "/derivaciones/nueva",
  "/derivaciones/00000000-0000-4000-8000-000000000000",
  "/necesidades-especiales",
  "/casos",
  "/casos/nuevo",
  "/casos/00000000-0000-4000-8000-000000000000",
  "/casos/00000000-0000-4000-8000-000000000000/atenciones/nueva",
  "/casos/00000000-0000-4000-8000-000000000000/atenciones/00000000-0000-4000-8000-000000000001",
];

// Compilación en frío de rutas pesadas en dev: dar margen al goto.
test.setTimeout(120_000);

test.describe("F3 — rutas de CAS/ATN/DER/NEC protegidas (UI-only)", () => {
  for (const route of PROTECTED) {
    test(`${route} sin sesión redirige al login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 45_000 });
    });
  }

  test("login accesible para continuar el flujo E2E-02", async ({ page }) => {
    await page.goto("/casos");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 45_000 });
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" })
    ).toBeVisible();
  });
});
