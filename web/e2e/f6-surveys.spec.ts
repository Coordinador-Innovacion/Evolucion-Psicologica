import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] && m[2] !== undefined) out[m[1]] = m[2].trim();
  }
  return out;
}

const cwd = process.cwd();
const ROOT = fs.existsSync(path.join(cwd, "supabase", ".env"))
  ? cwd
  : path.join(cwd, "..");
const SUPA = readEnvFile(path.join(ROOT, "supabase", ".env"));
const SUPABASE_URL = SUPA.SUPABASE_URL ?? "";
const SERVICE_KEY = SUPA.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL_A = process.env.E2E_DIRECTOR_A ?? "director.a@e2e.test";
const PASSWORD = process.env.E2E_DIRECTOR_PASS ?? "E2eTest2026!";

const INST_A = "c3469fe6-206d-4536-90f9-8179791235eb";
const STUD_2 = "ca5e0002-0000-4000-8000-000000000002";

// Seed F6 (supabase/seed_f6_e2e.sql)
const SURVEY_SEED = "f6e50001-0000-4000-8000-000000000001";
const V1_SEED = "f6e50002-0000-4000-8000-000000000002";
const A1 = "f6e50101-0000-4000-8000-000000000101";
const A3 = "f6e50103-0000-4000-8000-000000000103";
const SEED_APPS = [
  "f6e50101-0000-4000-8000-000000000101",
  "f6e50102-0000-4000-8000-000000000102",
  "f6e50103-0000-4000-8000-000000000103",
  "f6e50104-0000-4000-8000-000000000104",
  "f6e50105-0000-4000-8000-000000000105",
];
const A1_TOKEN =
  "f6seedtokenopen0001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// E2E-11: estudiante nuevo con DNI fijo y aplicación propia
const DNI_NUEVO = "77123999";
const APP11 = "f6e11011-0000-4000-8000-000000000111";
const TOKEN11 = "f6e11tokenacceso0001zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

const SEED_TITLE = "Encuesta de Bienestar Escolar 2026";

test.setTimeout(480_000);
test.use({ navigationTimeout: 120_000, actionTimeout: 60_000 });
test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/auth/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 60_000,
  });
}

async function surveyVersions(surveyId: string): Promise<Row[]> {
  const { data, error } = await admin
    .from("encuesta_versiones")
    .select("id, version_number, status")
    .eq("survey_id", surveyId)
    .order("version_number");
  expect(error).toBeNull();
  return (data ?? []) as unknown as Row[];
}

async function countSurveyApps(surveyId: string): Promise<number> {
  const versions = await surveyVersions(surveyId);
  const ids = versions.map((v) => String(v.id));
  if (ids.length === 0) return 0;
  const { count, error } = await admin
    .from("encuesta_aplicaciones")
    .select("id", { count: "exact", head: true })
    .in("version_id", ids);
  expect(error).toBeNull();
  return count ?? 0;
}

async function resetSurveyApps() {
  const versions = await surveyVersions(SURVEY_SEED);
  const ids = versions.map((v) => String(v.id));
  if (ids.length === 0) return;
  const { data: apps, error } = await admin
    .from("encuesta_aplicaciones")
    .select("id")
    .in("version_id", ids);
  expect(error).toBeNull();
  const junk = ((apps ?? []) as unknown as Row[])
    .map((a) => String(a.id))
    .filter((id) => !SEED_APPS.includes(id));
  if (junk.length > 0) {
    const { error: delErr } = await admin
      .from("encuesta_aplicaciones")
      .delete()
      .in("id", junk);
    expect(delErr).toBeNull();
  }
}

async function resetRespondentFixtures() {
  await resetSurveyApps();
  await admin.from("encuesta_respuestas").delete().eq("application_id", A1);
  await admin
    .from("encuesta_aplicaciones")
    .update({
      status: "active",
      progress: 0,
      started_at: "2026-01-01T08:00:00-05:00",
      ends_at: "2026-12-31T23:59:00-05:00",
      extended_at: null,
      extended_by: null,
    })
    .eq("id", A1);
  await admin
    .from("encuesta_aplicaciones")
    .update({
      status: "expired",
      progress: 30,
      started_at: "2026-01-10T08:00:00-05:00",
      ends_at: "2026-09-01T23:59:00-05:00",
      extended_at: null,
      extended_by: null,
    })
    .eq("id", A3);
  // Un bloqueo de promoción no debe impedir que el estudiante aparezca
  await admin
    .from("periodos_escolares")
    .update({ end_date: null, motivo_retiro: null })
    .eq("student_id", STUD_2)
    .eq("school_year", 2026);
}

async function questionCard(page: Page, labelText: string) {
  const inputs = page.getByPlaceholder("Etiqueta de la pregunta");
  const n = await inputs.count();
  for (let i = 0; i < n; i += 1) {
    if ((await inputs.nth(i).inputValue()) === labelText) {
      const card = inputs
        .nth(i)
        .locator('xpath=ancestor::div[contains(@class, "bg-white")][1]');
      await expect(
        card.locator('input[placeholder="Etiqueta de la pregunta"]')
      ).toHaveValue(labelText);
      return card;
    }
  }
  throw new Error(`Pregunta no encontrada en el constructor: ${labelText}`);
}

test.describe("F6 encuestas — E2E-09/10/11 contra BD alojada", () => {
  test("E2E-09 · crear con los 9 tipos, preview, publicar, copiar y nueva versión", async ({
    page,
  }) => {
    await login(page, EMAIL_A);

    // Crear encuesta desde cero
    await page.goto("/encuestas/nueva");
    await expect(
      page.getByRole("heading", { level: 1, name: "Nueva encuesta" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Crear desde cero" }).click();
    const title = `E2E-09 Bienestar 9 tipos ${Date.now()}`;
    await page.getByPlaceholder("Título de la encuesta").fill(title);
    await page
      .getByRole("button", { name: "Crear encuesta" })
      .click();
    await page.waitForURL(/\/encuestas\/[0-9a-f-]{36}\/constructor/, {
      timeout: 120_000,
    });
    const surveyId = page.url().split("/encuestas/")[1].split("/")[0];
    expect(surveyId).toMatch(/^[0-9a-f-]{36}$/);

    await expect(
      page.getByRole("heading", { level: 1, name: /E2E-09 Bienestar 9 tipos/ })
    ).toBeVisible({ timeout: 20_000 });

    // Sección inicial (create_survey la crea) o crearla si no vino
    const sectionInput = page.locator(
      'input[placeholder="Título de la sección"]'
    );
    try {
      await expect(sectionInput).toHaveCount(1, { timeout: 15_000 });
    } catch {
      await page.getByRole("button", { name: "+ Agregar sección" }).click();
      await expect(sectionInput).toHaveCount(1);
    }
    await expect(
      page.getByRole("button", { name: "+ Agregar pregunta" })
    ).toBeVisible();

    // 1 pregunta por cada uno de los 9 tipos
    const tipos: Array<[string, string]> = [
      ["Texto corto", "¿Cómo te sientes hoy?"],
      ["Texto largo", "Cuéntanos algo más"],
      ["Opción única", "¿Qué actividad prefieres?"],
      ["Selección múltiple", "¿Qué áreas te gustan?"],
      ["Sí / No", "¿Tienes apoyo en casa?"],
      ["Número", "¿Cuántas horas estudias?"],
      ["Fecha", "Fecha de la reunión"],
      ["Escala", "¿Qué tan contento estás?"],
      ["Selección desde opciones", "Elige tu curso"],
    ];
    for (const [tipo, labelText] of tipos) {
      await page.getByRole("button", { name: "+ Agregar pregunta" }).click();
      const selector = page.getByRole("dialog", {
        name: "Seleccionar tipo de pregunta",
      });
      await expect(selector).toBeVisible();
      await selector
        .getByRole("button", { name: new RegExp(`^${tipo}`) })
        .click();
      await expect(selector).toBeHidden();
      await page
        .getByPlaceholder("Etiqueta de la pregunta")
        .last()
        .fill(labelText);
    }

    // Opciones donde el tipo las requiere (mínimo 2 para publicar)
    for (const labelText of [
      "¿Qué actividad prefieres?",
      "¿Qué áreas te gustan?",
      "Elige tu curso",
    ]) {
      const card = await questionCard(page, labelText);
      await card.getByRole("button", { name: "+ Agregar opción" }).click();
      await card.getByRole("button", { name: "+ Agregar opción" }).click();
    }

    // Ambas presentaciones: visual (opción única) y estrellas (escala)
    const cardUnica = await questionCard(page, "¿Qué actividad prefieres?");
    await cardUnica
      .locator("select")
      .selectOption({ label: "Visual (tarjetas con icono)" });
    const cardEscala = await questionCard(page, "¿Qué tan contento estás?");
    await cardEscala.locator("select").selectOption({ label: "Estrellas" });

    const meta = page
      .locator("div.mt-2.flex.items-center.space-x-4")
      .first();
    await expect(meta).toContainText("9 preguntas", { timeout: 20_000 });
    await expect(page.getByText("Autoguardado ✓")).toBeVisible({
      timeout: 20_000,
    });

    // Vista previa
    await page.getByRole("link", { name: "Vista previa" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Vista previa" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/\d+ secci[oó]n(?:es)?, \d+ pregunta(?:s)?/)
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("link", { name: "Volver al constructor" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /E2E-09 Bienestar 9 tipos/ })
    ).toBeVisible({ timeout: 20_000 });

    // Publicar
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    const pubDialog = page.getByRole("dialog", { name: "Publicar versión" });
    await expect(pubDialog).toBeVisible();
    await expect(pubDialog).toContainText("Revisa las validaciones");
    await expect(pubDialog).not.toContainText("✕");
    await pubDialog.getByRole("button", { name: "Publicar versión" }).click();
    await page.waitForURL(/\/encuestas\/[0-9a-f-]{36}\/versiones$/, {
      timeout: 120_000,
    });
    await expect(page.getByText("Publicada", { exact: true })).toBeVisible();

    const versions = await surveyVersions(surveyId);
    expect(versions).toHaveLength(1);
    expect(versions[0].status).toBe("published");
    const v1Id = String(versions[0].id);

    // La versión publicada es inmutable al abrirla para editar
    await page.goto(`/encuestas/${surveyId}/versiones/${v1Id}/editar`);
    await expect(
      page.getByText("Esta versión está publicada y es inmutable.")
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "+ Agregar sección" })
    ).toHaveCount(0);

    // Nueva versión: clon editable del contenido publicado
    await page.goto(`/encuestas/${surveyId}/versiones`);
    await page.getByRole("button", { name: "Nueva versión" }).click();
    const nvDialog = page.getByRole("dialog", { name: "Nueva versión" });
    await expect(nvDialog).toBeVisible();
    await nvDialog
      .getByRole("button", { name: "Crear nueva versión" })
      .click();
    await page.waitForURL(
      /\/encuestas\/[0-9a-f-]{36}\/versiones\/[0-9a-f-]{36}\/editar/,
      { timeout: 120_000 }
    );
    await expect(page.getByText("Versión 2 (Borrador)")).toBeVisible({
      timeout: 120_000,
    });
    await expect(meta).toContainText("9 preguntas");
    const versionsAfter = await surveyVersions(surveyId);
    expect(versionsAfter).toHaveLength(2);
    expect(versionsAfter[1].status).toBe("draft");

    // Copiar encuesta: copia independiente con su propio borrador
    await page.goto(`/encuestas/${surveyId}`);
    await page.getByRole("button", { name: "Copiar encuesta" }).click();
    const copyDialog = page.getByRole("dialog", { name: "Copiar encuesta" });
    await expect(copyDialog).toBeVisible();
    await expect(copyDialog).toContainText("La copia es completamente independiente");
    await copyDialog.getByRole("button", { name: "Copiar", exact: true }).click();
    await page.waitForURL(/\/encuestas\/[0-9a-f-]{36}\/constructor/, {
      timeout: 120_000,
    });
    const copiedId = page.url().split("/encuestas/")[1].split("/")[0];
    expect(copiedId).not.toBe(surveyId);

    const copiedVersions = await surveyVersions(copiedId);
    expect(copiedVersions.length).toBeGreaterThanOrEqual(1);
    expect(
      copiedVersions.some((v) => v.status === "draft")
    ).toBe(true);
    const originalV1 = await admin
      .from("encuesta_versiones")
      .select("status")
      .eq("id", v1Id)
      .single();
    expect(originalV1.error).toBeNull();
    expect((originalV1.data as Row).status).toBe("published");

    // Versión en uso (seed con aplicaciones): inmutable
    await page.goto(`/encuestas/${SURVEY_SEED}/versiones/${V1_SEED}/editar`);
    await expect(
      page.getByText("Esta versión ya fue utilizada y es inmutable.")
    ).toBeVisible({ timeout: 30_000 });

    // ENC-01: la lista muestra la encuesta creada y el seed
    await page.goto("/encuestas");
    await expect(page.getByText(title).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(SEED_TITLE).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("E2E-10 · aplicación: crear, enlace, DNI, autosave, recuperar, finalizar y ampliar plazo", async ({
    page,
  }) => {
    await resetRespondentFixtures();

    const { data: stud, error: studErr } = await admin
      .from("estudiantes")
      .select("first_names, last_names, document_number")
      .eq("id", STUD_2)
      .single();
    expect(studErr).toBeNull();
    const doc = String((stud as Row).document_number);
    expect(doc.length).toBeGreaterThan(0);

    const beforeApps = await countSurveyApps(SURVEY_SEED);
    expect(beforeApps).toBeGreaterThanOrEqual(5);

    await login(page, EMAIL_A);

    // ---- Wizard de aplicación ----
    await page.goto(`/encuestas/aplicaciones/nueva?survey=${SURVEY_SEED}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Nueva aplicación" })
    ).toBeVisible({ timeout: 60_000 });

    // Paso 1: encuesta y versión publicada
    await expect(
      page.getByRole("heading", { name: "Encuesta y versión publicada" })
    ).toBeVisible({ timeout: 60_000 });
    const selSurvey = page
      .locator('label:has-text("Encuesta *") + select')
      .first();
    await selSurvey.selectOption(SURVEY_SEED);
    const selVersion = page
      .locator('label:has-text("Versión publicada *") + select')
      .first();
    await expect(selVersion).toHaveValue(V1_SEED);
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Paso 2: año escolar con aviso de aplicaciones existentes
    await expect(
      page.getByRole("heading", { name: "Año escolar y contexto" })
    ).toBeVisible();
    await page.getByRole("spinbutton").fill("2026");
    await expect(
      page.getByText(
        /Ya existen \d+ aplicaciones para esta encuesta en 2026/
      )
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Paso 3: respondientes (1 estudiante)
    await expect(
      page.getByRole("heading", { name: "Respondientes" })
    ).toBeVisible();
    await page.getByPlaceholder("Nombre o documento").fill(doc);
    const studentRow = page.locator("label").filter({ hasText: `DNI ${doc}` });
    await expect(studentRow).toHaveCount(1, { timeout: 15_000 });
    await studentRow.getByRole("checkbox").check();
    await expect(page.getByText("Seleccionados: 1")).toBeVisible();
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Paso 4: ventana (abierta todo 2026 → aplicación activa)
    await expect(
      page.getByRole("heading", { name: "Ventana de respuesta" })
    ).toBeVisible();
    const dtInputs = page.locator('input[type="datetime-local"]');
    await dtInputs.nth(0).fill("2026-01-01T08:00");
    await dtInputs.nth(1).fill("2026-12-31T23:00");
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Paso 5: revisión y creación (2.ª aplicación independiente en 2026)
    await expect(page.getByRole("heading", { name: "Revisión" })).toBeVisible();
    await page
      .getByRole("button", { name: "Crear 1 aplicaciones" })
      .click();
    await page.waitForURL(
      /\/encuestas\/aplicaciones\/[0-9a-f-]{36}\?links=1/,
      { timeout: 120_000 }
    );
    const appId = page.url().split("/aplicaciones/")[1].split("?")[0];

    const linksDialog = page.getByRole("dialog", {
      name: "Enlaces de acceso",
    });
    await expect(linksDialog).toBeVisible({ timeout: 15_000 });
    await expect(linksDialog).toContainText("/e/");
    await linksDialog.getByLabel("Cerrar").click();

    const afterApps = await countSurveyApps(SURVEY_SEED);
    expect(afterApps).toBe(beforeApps + 1);
    expect(afterApps).toBeGreaterThan(beforeApps);

    const { data: appRow, error: appErr } = await admin
      .from("encuesta_aplicaciones")
      .select("access_token, status, progress")
      .eq("id", appId)
      .single();
    expect(appErr).toBeNull();
    const token = String((appRow as Row).access_token);
    expect((appRow as Row).status).toBe("active");

    // ---- Enlace público + DNI ----
    await page.goto(`/e/${token}`);
    await page.getByRole("link", { name: /con mi DNI/ }).click();
    await page.waitForURL(/\/e\/.+\/acceso/, { timeout: 120_000 });
    await page.getByLabel("Número de DNI *").fill(doc);
    await page.getByRole("button", { name: "Validar acceso" }).click();
    await expect(page.getByText("Identidad verificada")).toBeVisible({
      timeout: 20_000,
    });
    await page
      .getByRole("button", { name: "Continuar a la encuesta" })
      .click();
    await page.waitForURL(/\/e\/.+\/datos/, { timeout: 120_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Tus datos" })
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Comenzar encuesta" }).click();
    await page.waitForURL(/\/e\/.+\/responder/, { timeout: 120_000 });

    // ---- Responder con autosave ----
    await expect(page.getByText("Sección 1/2")).toBeVisible({
      timeout: 120_000,
    });
    await page.locator('input[type="text"]').fill("Me siento animado");
    await page.getByRole("button", { name: /Sí, deportes/ }).click();
    await page.getByRole("button", { name: "4 de 5" }).click();
    await page.getByRole("button", { name: "7", exact: true }).click();
    await expect(page.getByText("Guardado ✓")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Continuar →" }).click();
    await expect(page.getByText("Sección 2/2")).toBeVisible({
      timeout: 20_000,
    });

    // Recuperar avance tras recargar
    await page.reload();
    await expect(page.getByText("Sección 2/2")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/40%/)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /Ciencias/ }).click();
    await page.getByRole("button", { name: /Sí/ }).click();
    await page.locator('input[type="number"]').fill("6");
    await expect(page.getByText("Guardado ✓")).toBeVisible({
      timeout: 20_000,
    });

    // ---- Finalizar ----
    await page.getByRole("button", { name: "Finalizar encuesta" }).click();
    await expect(
      page.getByRole("heading", { name: "¿Finalizar encuesta?" })
    ).toBeVisible();
    await expect(
      page.getByText("Todas las preguntas obligatorias están respondidas")
    ).toBeVisible();
    await page.getByRole("button", { name: "Sí, finalizar" }).click();
    await expect(page.getByText("¡Gracias por participar!")).toBeVisible({
      timeout: 120_000,
    });

    const { data: finalApp, error: finalErr } = await admin
      .from("encuesta_aplicaciones")
      .select("status, progress")
      .eq("id", appId)
      .single();
    expect(finalErr).toBeNull();
    expect((finalApp as Row).status).toBe("completed");
    const { count: respCount, error: respErr } = await admin
      .from("encuesta_respuestas")
      .select("id", { count: "exact", head: true })
      .eq("application_id", appId);
    expect(respErr).toBeNull();
    expect(respCount ?? 0).toBeGreaterThanOrEqual(7);

    // ---- Ampliar plazo de la aplicación vencida (misma aplicación) ----
    await page.goto(`/encuestas/${SURVEY_SEED}/aplicaciones`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Aplicaciones" })
    ).toBeVisible({ timeout: 30_000 });
    const expiredRow = page
      .locator("div.divide-y > div")
      .filter({ hasText: "Vencida" });
    await expect(expiredRow).toHaveCount(1);
    await expiredRow.getByRole("button", { name: "Ampliar plazo" }).click();
    const extDialog = page.getByRole("dialog", { name: "Ampliar plazo" });
    await expect(extDialog).toBeVisible();
    await extDialog
      .locator('input[type="datetime-local"]')
      .fill("2026-12-31T23:59");
    await extDialog.getByRole("button", { name: "Ampliar plazo" }).click();
    const extendedRow = page
      .locator("div.divide-y > div")
      .filter({ hasText: "Ampliada" });
    await expect(extendedRow).toHaveCount(1, { timeout: 20_000 });
    await expect(extendedRow).toContainText("30% avance");

    const { data: a3, error: a3Err } = await admin
      .from("encuesta_aplicaciones")
      .select("id, status, progress, extended_at, ends_at")
      .eq("id", A3)
      .single();
    expect(a3Err).toBeNull();
    expect((a3 as Row).id).toBe(A3);
    expect((a3 as Row).status).toBe("extended");
    expect(Number((a3 as Row).progress)).toBe(30);
    expect((a3 as Row).extended_at).toBeTruthy();
    expect(new Date(String((a3 as Row).ends_at)).getTime()).toBeGreaterThan(
      Date.now()
    );

    // APL-01: lista global de aplicaciones de la institución
    await page.goto("/encuestas/aplicaciones");
    await expect(
      page.getByRole("link", { name: "Nueva aplicación" })
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.locator("div.divide-y").getByText(SEED_TITLE).first()
    ).toBeVisible({ timeout: 60_000 });

    // APL-06: visor de respuestas (solo lectura) de la aplicación completada
    await page.goto(`/encuestas/aplicaciones/${appId}/respuestas`);
    await expect(
      page.getByText("Visor solo lectura de las respuestas.")
    ).toBeVisible({ timeout: 60_000 });
  });

  test("E2E-11 · estudiante no registrado: acceso denegado → registro mínimo → completa datos", async ({
    page,
  }) => {
    await resetSurveyApps();
    await admin.from("encuesta_respuestas").delete().eq("application_id", A1);
    await admin
      .from("encuesta_aplicaciones")
      .update({
        status: "active",
        progress: 0,
        started_at: "2026-01-01T08:00:00-05:00",
        ends_at: "2026-12-31T23:59:00-05:00",
        extended_at: null,
        extended_by: null,
      })
      .eq("id", A1);
    // Limpieza de ejecuciones previas
    await admin.from("encuesta_aplicaciones").delete().eq("id", APP11);
    const { data: olds } = await admin
      .from("estudiantes")
      .select("id")
      .eq("document_number", DNI_NUEVO);
    for (const old of (olds ?? []) as unknown as Row[]) {
      const { error } = await admin
        .from("estudiantes")
        .delete()
        .eq("id", String(old.id));
      expect(error).toBeNull();
    }

    await login(page, EMAIL_A);

    // 1) Acceso denegado con un DNI que no corresponde a ningún respondiente
    await page.goto(`/e/${A1_TOKEN}`);
    await page.getByRole("link", { name: /con mi DNI/ }).click();
    await page.waitForURL(/\/e\/.+\/acceso/, { timeout: 120_000 });
    await page.getByLabel("Número de DNI *").fill(DNI_NUEVO);
    await page.getByRole("button", { name: "Validar acceso" }).click();
    await expect(
      page.getByText(
        "No encontramos un registro con este DNI para esta encuesta."
      )
    ).toBeVisible({ timeout: 20_000 });

    // 2) Registro mínimo del estudiante (rol con estudiantes.registro)
    await page.goto("/estudiantes/nuevo?modo=minimo");
    await expect(
      page.getByRole("heading", { name: "Registro mínimo de estudiante" })
    ).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder("Ej. 70123456").fill(DNI_NUEVO);
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(
      page.getByText(
        `no existe ningún estudiante con DNI ${DNI_NUEVO}`
      )
    ).toBeVisible({ timeout: 20_000 });
    await page
      .getByPlaceholder("Nombres del estudiante")
      .fill("Prueba");
    await page
      .getByPlaceholder("Apellidos del estudiante")
      .fill("Acceso Demo");
    await page.locator('input[type="date"]').first().fill("2014-03-15");
    await page.getByRole("button", { name: "Registrar estudiante" }).click();
    await expect(
      page.getByRole("heading", { name: "Estudiante registrado" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("El estudiante ya puede acceder a la encuesta mediante su DNI.")
    ).toBeVisible();

    // 3) Aplicación propia para el nuevo respondiente (fixture: el wizard
    //    solo lista estudiantes con período activo; el registro mínimo aún
    //    no crea período — E2E-10 cubre la creación vía UI)
    const { data: nuevo, error: nuevoErr } = await admin
      .from("estudiantes")
      .select("id")
      .eq("document_number", DNI_NUEVO)
      .single();
    expect(nuevoErr).toBeNull();
    const { error: insErr } = await admin
      .from("encuesta_aplicaciones")
      .insert({
        id: APP11,
        version_id: V1_SEED,
        institution_id: INST_A,
        respondent_student_id: String((nuevo as Row).id),
        year: 2026,
        started_at: "2026-01-01T08:00:00-05:00",
        ends_at: "2026-12-31T23:59:00-05:00",
        status: "active",
        progress: 0,
        access_token: TOKEN11,
      });
    expect(insErr).toBeNull();

    // 4) El estudiante ingresa con su DNI y completa sus datos
    await page.goto(`/e/${TOKEN11}`);
    await page.getByRole("link", { name: /con mi DNI/ }).click();
    await page.waitForURL(/\/e\/.+\/acceso/, { timeout: 120_000 });
    await page.getByLabel("Número de DNI *").fill(DNI_NUEVO);
    await page.getByRole("button", { name: "Validar acceso" }).click();
    await expect(page.getByText("Identidad verificada")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Prueba Acceso Demo/)).toBeVisible();
    await page
      .getByRole("button", { name: "Continuar a la encuesta" })
      .click();
    await page.waitForURL(/\/e\/.+\/datos/, { timeout: 120_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Tus datos" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(DNI_NUEVO)).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/Faltan \d+ datos? por completar\./)
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Completa lo que falta" }).click();
    await page
      .locator('label:has-text("Teléfono") + input')
      .first()
      .fill("999888777");
    await expect(page.getByText("Guardado ✓")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Listo" }).click();
    await expect(page.getByText("999888777")).toBeVisible();

    // RESP-03: el teléfono persistió en la fila del estudiante
    const { data: studRow, error: studRowErr } = await admin
      .from("estudiantes")
      .select("phone")
      .eq("id", String((nuevo as Row).id))
      .single();
    expect(studRowErr).toBeNull();
    expect(String((studRow as Row).phone)).toBe("999888777");

    await page.getByRole("link", { name: "Comenzar encuesta" }).click();
    await page.waitForURL(/\/e\/.+\/responder/, { timeout: 120_000 });
    await expect(page.getByText("Sección 1/2")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/Prueba/)).toBeVisible();
  });
});
