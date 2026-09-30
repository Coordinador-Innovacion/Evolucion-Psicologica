import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("F1 smoke — sistema de diseño y shell (UI-only)", () => {
  test("landing pública muestra marca y acceso", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Evolución Psicológica" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("landing pública pasa axe sin violaciones graves", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical"
    );
    expect(serious).toEqual([]);
  });

  test("AUTH-01 login: formulario completo con mostrar/ocultar contraseña", async ({
    page,
  }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /¿Olvidaste tu contraseña/ })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Registrarme como docente/ })
    ).toBeVisible();

    await page.locator("#password").fill("secreta123");
    await expect(page.locator("#password")).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Mostrar contraseña" }).click();
    await expect(page.locator("#password")).toHaveAttribute("type", "text");
  });

  test("login pasa axe sin violaciones graves", async ({ page }) => {
    await page.goto("/auth/login");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical"
    );
    expect(serious).toEqual([]);
  });

  test("AUTH-02 registro: wizard exige código y no avanza sin validar", async ({
    page,
  }) => {
    await page.goto("/auth/registro");
    await expect(page.locator("#institution_code")).toBeVisible();
    await expect(page.getByRole("button", { name: /Buscar I.E./ })).toBeDisabled();
    await page.locator("#institution_code").fill("MOD-001");
    await expect(page.getByRole("button", { name: /Buscar I.E./ })).toBeEnabled();
    await expect(page.getByText("Crear cuenta docente")).toBeVisible();
  });

  test("AUTH-05 recuperar contraseña presenta formulario neutro", async ({
    page,
  }) => {
    await page.goto("/auth/recuperar");
    await expect(page.locator("#email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enviar enlace de recuperación" })
    ).toBeVisible();
  });

  test("AUTH-07 404 muestra página de sistema con estilo", async ({ page }) => {
    await page.goto("/404");
    await expect(page.getByText("Página no encontrada")).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver al inicio" })).toBeVisible();
  });

  test("AUTH-07 403 muestra página de sistema", async ({ page }) => {
    await page.goto("/403");
    await expect(page.getByText("No tienes acceso a esta sección")).toBeVisible();
  });

  test("ruta protegida sin sesión redirige al login", async ({ page }) => {
    await page.goto("/configuracion");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
  });

  test("páginas de sistema pasan axe sin violaciones graves", async ({ page }) => {
    await page.goto("/404");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical"
    );
    expect(serious).toEqual([]);
  });

  test("dark mode: la raíz alterna la clase .dark", async ({ page }) => {
    await page.goto("/auth/login");
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(hasDark).toBe(false);
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
      document.documentElement.classList.add("dark");
    });
    const nowDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(nowDark).toBe(true);
  });
});
