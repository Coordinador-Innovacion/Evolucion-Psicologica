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
const ANON_KEY = SUPA.SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = SUPA.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL_A = process.env.E2E_DIRECTOR_A ?? "director.a@e2e.test";
const EMAIL_B = process.env.E2E_DIRECTOR_B ?? "director.b@e2e.test";
const PASSWORD = process.env.E2E_DIRECTOR_PASS ?? "E2eTest2026!";

const INST_A = "c3469fe6-206d-4536-90f9-8179791235eb";
const INST_B = "bee5eed0-0000-4000-8000-00000000000b";
const CASO = "ca5e000c-0000-4000-8000-00000000000c";
const STUD_TRANSFER = "ca5e0001-0000-4000-8000-000000000001";
const STUD_2 = "ca5e0002-0000-4000-8000-000000000002";
const STUD_3 = "ca5e0003-0000-4000-8000-000000000003";
const STUD_4 = "ca5e0004-0000-4000-8000-000000000004";
const PER_TRANSFER_A = "0e5f0001-0000-4000-8000-000000000001";
const SEEDED_PERIODS = [
  "0e5f0001-0000-4000-8000-000000000001",
  "0e5f0002-0000-4000-8000-000000000002",
  "0e5f0003-0000-4000-8000-000000000003",
  "0e5f0004-0000-4000-8000-000000000004",
];
const GRADO_B_TERCERO = "bee5ee03-0000-4000-8000-000000000003";
const GRADO_4PRIM = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44";
const GRADO_6PRIM = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a46";
const NIVEL_SEC = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const GRADO_1SEC = "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a51";

const SHOT_DIR = path.join(ROOT, "docs", "capturas", "f5");

test.setTimeout(240_000);
test.use({ navigationTimeout: 90_000, actionTimeout: 45_000 });
test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/auth/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 30_000,
  });
}

async function capturar(page: Page, id: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const shot = (variant: string) =>
    page.screenshot({
      path: path.join(SHOT_DIR, `${id}-${variant}.png`),
      fullPage: true,
    });
  const setDark = (on: boolean) =>
    page.evaluate((d) => {
      document.documentElement.classList.toggle("dark", d);
    }, on);

  await setDark(false);
  await shot("escritorio-claro");
  await setDark(true);
  await shot("escritorio-oscuro");
  await setDark(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await shot("movil-claro");
  await setDark(true);
  await shot("movil-oscuro");
  await setDark(false);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
}

async function must(builder: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await builder;
  expect(error).toBeNull();
}

async function resetTransferFixtures() {
  await must(admin.from("transferencias").delete().eq("caso_id", CASO));
  await must(
    admin.from("caso_responsables_historial").delete().eq("caso_id", CASO)
  );
  await must(
    admin
      .from("periodos_escolares")
      .delete()
      .eq("student_id", STUD_TRANSFER)
      .neq("id", PER_TRANSFER_A)
  );
  await must(
    admin
      .from("periodos_escolares")
      .update({ end_date: null, motivo_retiro: null })
      .eq("id", PER_TRANSFER_A)
  );
  await must(
    admin
      .from("casos")
      .update({ current_responsible_id: null })
      .eq("id", CASO)
  );
  await must(
    admin
      .from("casos")
      .update({ estado: "cerrado" })
      .eq("id", CASO)
      .eq("estado", "en_proceso")
  );
  await must(
    admin
      .from("casos")
      .update({ estado: "inicio" })
      .eq("id", CASO)
      .eq("estado", "cerrado")
  );
}

async function resetPromoFixtures() {
  const { data: lotes, error: lotesErr } = await admin
    .from("lotes_promocion")
    .select("id")
    .eq("institution_id", INST_A)
    .eq("origin_year", 2026)
    .eq("destination_year", 2027);
  expect(lotesErr).toBeNull();
  for (const lote of (lotes ?? []) as unknown as Row[]) {
    const { data: accs } = await admin
      .from("acciones_promocion")
      .select("id")
      .eq("batch_id", String(lote.id));
    for (const acc of (accs ?? []) as unknown as Row[]) {
      await admin.from("excepciones_promocion").delete().eq("action_id", String(acc.id));
    }
    await admin.from("acciones_promocion").delete().eq("batch_id", String(lote.id));
    await admin.from("lotes_promocion").delete().eq("id", String(lote.id));
  }
  await must(
    admin
      .from("periodos_escolares")
      .delete()
      .eq("institution_id", INST_A)
      .eq("school_year", 2027)
  );
  await must(
    admin
      .from("periodos_escolares")
      .update({ end_date: null, motivo_retiro: null })
      .in("id", SEEDED_PERIODS)
  );
}

async function lastTransfer(): Promise<Row> {
  const { data, error } = await admin
    .from("transferencias")
    .select("*")
    .eq("caso_id", CASO)
    .order("created_at", { ascending: false })
    .limit(1);
  expect(error).toBeNull();
  const rows = (data ?? []) as unknown as Row[];
  const row = rows[0];
  if (!row) throw new Error("No existe transferencia para el caso E2E");
  return row;
}

async function oneRow(table: string, col: string, val: string): Promise<Row> {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .eq(col, val)
    .maybeSingle();
  expect(error).toBeNull();
  const row = (data ?? null) as Row | null;
  if (!row) throw new Error(`Fila no encontrada en ${table}: ${col}=${val}`);
  return row;
}

async function directorIdsIn(inst: string): Promise<string[]> {
  const { data, error } = await admin
    .from("perfiles")
    .select("user_id, role, created_at")
    .eq("institution_id", inst)
    .in("role", ["director", "admin_ie"]);
  expect(error).toBeNull();
  const rows = (data ?? []) as unknown as Array<{
    user_id: string;
    role: string;
    created_at: string | null;
  }>;
  rows.sort((a, b) => {
    const ra = a.role === "director" ? 0 : 1;
    const rb = b.role === "director" ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
  return rows.map((r) => r.user_id);
}

async function periodsOf(studentId: string, inst: string): Promise<Row[]> {
  const { data, error } = await admin
    .from("periodos_escolares")
    .select("*")
    .eq("student_id", studentId)
    .eq("institution_id", inst)
    .order("school_year", { ascending: true });
  expect(error).toBeNull();
  return (data ?? []) as unknown as Row[];
}

async function historyRows(): Promise<Row[]> {
  const { data, error } = await admin
    .from("caso_responsables_historial")
    .select("*")
    .eq("caso_id", CASO);
  expect(error).toBeNull();
  return (data ?? []) as unknown as Row[];
}

async function rpcAsDirectorA(
  fn: string,
  args: Record<string, unknown>
): Promise<Row> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authErr } = await client.auth.signInWithPassword({
    email: EMAIL_A,
    password: PASSWORD,
  });
  expect(authErr).toBeNull();
  const { data, error } = await client.rpc(fn, args);
  expect(error).toBeNull();
  return (data ?? {}) as Row;
}

async function crearSolicitudTransferencia(page: Page) {
  await page.goto("/transferencias/nueva");
  const wizardHeading = page.getByRole("heading", {
    name: "Nueva transferencia",
  });
  try {
    await expect(wizardHeading).toBeVisible({ timeout: 20_000 });
  } catch {
    await page.reload();
    await expect(wizardHeading).toBeVisible({ timeout: 45_000 });
  }
  await page.getByPlaceholder("Ej. 12345678").fill("33333331");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const { data: instRow } = await admin
    .from("institutions")
    .select("name")
    .eq("id", INST_A)
    .maybeSingle();
  const instName = String((instRow as Row | null)?.name ?? "");
  expect(instName).not.toBe("");
  await expect(page.getByText(instName)).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole("button", { name: /Dificultades de aprendizaje/ })
    .click();
  const selects = page.locator("select");
  await expect(selects).toHaveCount(4);
  await selects.nth(1).selectOption({ label: "Primaria" });
  await selects.nth(2).selectOption({ label: "Tercero" });
  await selects.nth(3).selectOption({ label: "A" });
  await capturar(page, "trf-02-formulario");
  await page.getByRole("button", { name: "Continuar" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Confirmar solicitud de transferencia",
  });
  await expect(dialog).toBeVisible();
  await capturar(page, "trf-02b-confirmacion");
  await dialog.getByRole("button", { name: "Confirmar solicitud" }).click();
  await expect(page.getByText("Solicitud de transferencia creada")).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForURL(/\/transferencias\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Transferencia" })).toBeVisible({
    timeout: 45_000,
  });
}

test.describe("F5 reales — E2E-07/E2E-08 contra BD alojada", () => {
  test("TRF-02/TRF-01 · B solicita: filas pendientes y sin efecto en A", async ({
    page,
  }) => {
    await resetTransferFixtures();
    await login(page, EMAIL_B);
    await crearSolicitudTransferencia(page);

    await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();

    const transfer = await lastTransfer();
    expect(transfer.status).toBe("pending");
    expect(transfer.origin_institution_id).toBe(INST_A);
    expect(transfer.destination_institution_id).toBe(INST_B);
    expect(transfer.destination_grado_id).toBe(GRADO_B_TERCERO);
    expect(transfer.section).toBe("A");
    expect(transfer.school_year).toBe(2026);
    expect(transfer.authorized_at).toBeNull();
    expect(transfer.transferred_at).toBeNull();
    const dirBIds = await directorIdsIn(INST_B);
    expect(dirBIds).toContain(String(transfer.requested_by));

    const perA = await oneRow("periodos_escolares", "id", PER_TRANSFER_A);
    expect(perA.end_date).toBeNull();
    const caso = await oneRow("casos", "id", CASO);
    expect(caso.current_responsible_id).toBeNull();
    expect(caso.estado).toBe("inicio");
    expect(await historyRows()).toHaveLength(0);
    const perB = await periodsOf(STUD_TRANSFER, INST_B);
    expect(perB).toHaveLength(0);

    await page.goto("/transferencias");
    await expect(
      page.getByRole("heading", { name: "Transferencias" })
    ).toBeVisible({ timeout: 45_000 });
    await page.getByRole("tab", { name: /Solicitadas por/ }).click();
    const row = page
      .locator("li")
      .filter({ hasText: "Pendiente" })
      .first();
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "Ver" })).toBeVisible();
    await capturar(page, "trf-01-lista-solicitadas");
  });

  test("TRF-03 · A autoriza: cierra período en A, crea período en B y transfiere responsabilidad", async ({
    page,
  }) => {
    await login(page, EMAIL_A);
    await page.goto("/transferencias");
    await expect(
      page.getByRole("heading", { name: "Transferencias" })
    ).toBeVisible({ timeout: 45_000 });
    const row = page.locator("li").filter({ hasText: "Prueba E2E" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "Ver" }).click();
    await page.waitForURL(/\/transferencias\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Transferencia" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Prueba E2E, Alumno Transferible · DNI 33333331")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Autorizar", exact: true })
    ).toBeVisible();
    await capturar(page, "trf-03a-detalle-pendiente");

    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Autorizar transferencia" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Cierra el período escolar en A (institución origen).")
    ).toBeVisible();
    await expect(
      dialog.getByText("Crea el período escolar en B (institución destino).")
    ).toBeVisible();
    await expect(
      dialog.getByText("Transfiere la responsabilidad del caso al equipo de B.")
    ).toBeVisible();
    await expect(
      dialog.getByText("A conserva acceso de consulta al historial.")
    ).toBeVisible();
    await capturar(page, "trf-03b-dialogo-autorizar");
    await dialog.getByRole("button", { name: "Confirmar autorización" }).click();
    await expect(page.getByText("Transferencia autorizada", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Autorizada", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText("Transferencia autorizada (transfer_authorized)")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Autorizar", exact: true })
    ).toHaveCount(0);
    await capturar(page, "trf-03c-autorizada");

    const transfer = await lastTransfer();
    expect(transfer.status).toBe("approved");
    expect(transfer.authorized_at).toBeTruthy();
    expect(transfer.transferred_at).toBeTruthy();
    const dirBIds = await directorIdsIn(INST_B);
    expect(dirBIds.length).toBeGreaterThan(0);
    const dirAIds = await directorIdsIn(INST_A);
    expect(dirAIds.length).toBeGreaterThan(0);
    expect(transfer.authorized_by).toBe(dirAIds[0]);

    const perA = await oneRow("periodos_escolares", "id", PER_TRANSFER_A);
    expect(perA.end_date).toBeTruthy();
    expect(perA.motivo_retiro).toBe("transferencia_a_otra_institucion");

    const perB = await periodsOf(STUD_TRANSFER, INST_B);
    expect(perB).toHaveLength(1);
    const created = perB[0];
    if (!created) throw new Error("Sin período en B");
    expect(created.grado_id).toBe(GRADO_B_TERCERO);
    expect(created.section).toBe("A");
    expect(created.school_year).toBe(2026);
    expect(created.tipo).toBe("regular");
    expect(created.end_date).toBeNull();

    const caso = await oneRow("casos", "id", CASO);
    expect(caso.current_responsible_id).toBe(dirBIds[0]);
    expect(caso.estado).toBe("en_proceso");

    const hist = await historyRows();
    expect(hist.length).toBeGreaterThan(0);
    expect(hist.some((h) => h.responsible_id === dirBIds[0] && h.hasta === null)).toBe(
      true
    );
  });

  test("TRF-03 · A rechaza con motivo: sin efectos en la BD", async ({ page }) => {
    await resetTransferFixtures();
    await login(page, EMAIL_B);
    await crearSolicitudTransferencia(page);
    const pending = await lastTransfer();
    expect(pending.status).toBe("pending");

    await page.context().clearCookies();
    await login(page, EMAIL_A);
    await page.goto("/transferencias");
    await expect(
      page.getByRole("heading", { name: "Transferencias" })
    ).toBeVisible({ timeout: 45_000 });
    const row = page.locator("li").filter({ hasText: "Prueba E2E" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "Ver" }).click();
    await page.waitForURL(/\/transferencias\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Transferencia" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Rechazar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Rechazar solicitud" });
    await expect(dialog).toBeVisible();
    await dialog
      .getByPlaceholder("Indica el motivo del rechazo...")
      .fill("No cumple requisitos de transferencia (E2E)");
    await capturar(page, "trf-03d-dialogo-rechazar");
    await dialog.getByRole("button", { name: "Confirmar rechazo" }).click();
    await expect(page.getByText("Solicitud rechazada", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Rechazada", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/Motivo del rechazo: No cumple requisitos/)
    ).toBeVisible();
    await capturar(page, "trf-03e-rechazada");

    const transfer = await lastTransfer();
    expect(transfer.status).toBe("rejected");
    expect(transfer.reject_reason).toBe(
      "No cumple requisitos de transferencia (E2E)"
    );
    expect(transfer.rejected_at).toBeTruthy();
    expect(transfer.authorized_at).toBeNull();
    expect(transfer.transferred_at).toBeNull();

    const perA = await oneRow("periodos_escolares", "id", PER_TRANSFER_A);
    expect(perA.end_date).toBeNull();
    expect(perA.motivo_retiro).toBeNull();
    const perB = await periodsOf(STUD_TRANSFER, INST_B);
    expect(perB).toHaveLength(0);
    const caso = await oneRow("casos", "id", CASO);
    expect(caso.current_responsible_id).toBeNull();
    expect(caso.estado).toBe("inicio");
    expect(await historyRows()).toHaveLength(0);
  });

  test("PRO-01/02/03 · Preparar → revisar → ejecutar con filas verificadas", async ({
    page,
  }) => {
    await resetPromoFixtures();
    await resetTransferFixtures();

    await login(page, EMAIL_A);
    await page.goto("/promocion");
    await expect(
      page.getByRole("heading", { name: "Promoción masiva" })
    ).toBeVisible({ timeout: 45_000 });
    await page.goto("/promocion/nueva");
    await expect(
      page.getByRole("heading", { name: "Nueva promoción" })
    ).toBeVisible({ timeout: 45_000 });

    const spin = page.getByRole("spinbutton");
    await expect(spin).toHaveCount(2);
    await spin.nth(0).fill("2026");
    await spin.nth(1).fill("2027");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Preparar lote" }).click();
    await expect(page.getByRole("heading", { name: "3 · Revisar" })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByText("Conteos por grado")).toBeVisible();
    const previewVals = page.locator("p.text-lg.font-bold");
    await expect(previewVals).toHaveCount(4);
    await expect(previewVals.nth(0)).toHaveText("4");
    await expect(previewVals.nth(1)).toHaveText("3");
    await expect(previewVals.nth(2)).toHaveText("1");
    await expect(previewVals.nth(3)).toHaveText("0");
    await expect(page.getByText("Primaria Sexto → Secundaria Primero")).toBeVisible();
    await expect(page.getByText("Secundaria Quinto → Egreso")).toBeVisible();
    await expect(page.getByText("Cambio de nivel")).toBeVisible();

    await page.getByRole("button", { name: "Cargar pendientes" }).click();
    await expect(
      page.getByText("No hay acciones pendientes para excepcionar.")
    ).toBeVisible({ timeout: 15_000 });
    await capturar(page, "pro-02-revisar");

    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: "4 · Ejecutar" })).toBeVisible();
    await page.getByPlaceholder("PROMOVER").fill("PROMOVER");
    await capturar(page, "pro-02b-ejecutar");
    await page.getByRole("button", { name: "Ejecutar promoción" }).click();
    await expect(page.getByText("Promoción ejecutada")).toBeVisible({
      timeout: 30_000,
    });
    const execVals = page.locator("p.text-lg.font-bold");
    await expect(execVals).toHaveCount(4);
    await expect(execVals.nth(0)).toHaveText("3");
    await expect(execVals.nth(1)).toHaveText("4");
    await expect(execVals.nth(2)).toHaveText("1");
    await expect(execVals.nth(3)).toHaveText("0");
    await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Ver detalle del lote" }).click();
    await expect(
      page.getByRole("heading", { name: "Detalle de promoción" })
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Completado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ejecutar lote" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reanudar" })).toHaveCount(0);
    const detailVals = page.locator("p.text-2xl.font-bold");
    await expect(detailVals).toHaveCount(4);
    await expect(detailVals.nth(0)).toHaveText("4");
    await expect(detailVals.nth(1)).toHaveText("3");
    await expect(detailVals.nth(2)).toHaveText("1");
    await expect(detailVals.nth(3)).toHaveText("0");

    await expect(page.getByRole("tab", { name: /Acciones\s*4/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Excepciones\s*0/ })).toBeVisible();
    const egresoRow = page.locator("li").filter({ hasText: "Alumno Egreso Sec" });
    await expect(egresoRow).toHaveCount(1);
    await expect(egresoRow.getByText(/Final: Egreso/)).toBeVisible();
    const sextoRow = page.locator("li").filter({ hasText: "Alumno Sexto" });
    await expect(sextoRow).toHaveCount(1);
    await expect(sextoRow.getByText(/Final: Promovido/)).toBeVisible();
    await capturar(page, "pro-03-detalle");

    await page.getByRole("tab", { name: /Excepciones/ }).click();
    await expect(page.getByText("Sin excepciones")).toBeVisible();
    await page.getByRole("tab", { name: /L[íi]nea de tiempo/ }).click();
    await expect(page.getByText("Lote preparado (promotion_prepared)")).toBeVisible();
    await expect(
      page.getByText("Lote completado (promotion_executed)")
    ).toBeVisible();

    const batchId = page.url().split("/").pop();
    if (!batchId) throw new Error("Sin batchId en la URL");
    const lote = await oneRow("lotes_promocion", "id", batchId);
    expect(lote.status).toBe("COMPLETED");
    expect(lote.institution_id).toBe(INST_A);
    expect(lote.origin_year).toBe(2026);
    expect(lote.destination_year).toBe(2027);
    expect(lote.completed_at).toBeTruthy();
    const counts = lote.counts as Row;
    expect(counts.total).toBe(4);
    expect(counts.processed).toBe(3);
    expect(counts.egreso).toBe(1);
    expect(counts.errors).toBe(0);

    const { data: accData, error: accErr } = await admin
      .from("acciones_promocion")
      .select("*")
      .eq("batch_id", batchId);
    expect(accErr).toBeNull();
    const acciones = (accData ?? []) as unknown as Row[];
    expect(acciones).toHaveLength(4);
    expect(
      acciones.filter((a) => a.status === "processed")
    ).toHaveLength(4);
    const acc4 = acciones.find((a) => a.student_id === STUD_4);
    expect(acc4?.automatic_result).toBe("egreso");
    expect(acc4?.final_result).toBe("egreso");

    const p2026t = await oneRow("periodos_escolares", "id", SEEDED_PERIODS[0]);
    expect(p2026t.end_date).toBeTruthy();
    expect(p2026t.motivo_retiro).toBe("promocion");
    const p2026s = await oneRow("periodos_escolares", "id", SEEDED_PERIODS[3]);
    expect(p2026s.end_date).toBeTruthy();
    expect(p2026s.motivo_retiro).toBe("egreso");

    const { data: p2027data, error: p2027err } = await admin
      .from("periodos_escolares")
      .select("*")
      .eq("institution_id", INST_A)
      .eq("school_year", 2027);
    expect(p2027err).toBeNull();
    const p2027 = (p2027data ?? []) as unknown as Row[];
    expect(p2027).toHaveLength(3);
    const byStudent = new Map(p2027.map((p) => [String(p.student_id), p]));
    expect(byStudent.get(STUD_TRANSFER)?.grado_id).toBe(GRADO_4PRIM);
    expect(byStudent.get(STUD_2)?.grado_id).toBe(GRADO_6PRIM);
    expect(byStudent.get(STUD_3)?.grado_id).toBe(GRADO_1SEC);
    expect(byStudent.get(STUD_3)?.nivel_id).toBe(NIVEL_SEC);
    expect(byStudent.has(STUD_4)).toBe(false);
    for (const p of p2027) {
      expect(p.end_date).toBeNull();
      expect(p.tipo).toBe("regular");
      expect(p.section).toBe("A");
    }

    const idem = await rpcAsDirectorA("execute_promotion", {
      p_institution_id: INST_A,
      p_origin_year: 2026,
      p_destination_year: 2027,
      p_idempotency_key: String(lote.idempotency_key),
    });
    expect(idem.success).toBe(true);
    expect(idem.idempotent).toBe(true);
    expect(idem.batch_id).toBe(batchId);
    expect(idem.status).toBe("COMPLETED");
    const { data: p2027check, error: p2027checkErr } = await admin
      .from("periodos_escolares")
      .select("id")
      .eq("institution_id", INST_A)
      .eq("school_year", 2027);
    expect(p2027checkErr).toBeNull();
    expect((p2027check ?? []) as unknown as Row[]).toHaveLength(3);

    await page.goto("/promocion");
    await expect(
      page.getByRole("heading", { name: "Promoción masiva" })
    ).toBeVisible({ timeout: 45_000 });
    const loteRow = page
      .locator("li")
      .filter({ hasText: /2026\s*→\s*2027/ })
      .first();
    await expect(loteRow).toBeVisible();
    await expect(loteRow.getByText("Completado", { exact: true })).toBeVisible();
    await expect(
      loteRow.getByText(/4 estudiantes · 3 promovidos · 1 egreso/)
    ).toBeVisible();
    await capturar(page, "pro-01-lista");

    await admin
      .from("lotes_promocion")
      .update({ status: "INTERRUPTED" })
      .eq("id", batchId);
    await page.goto(`/promocion/${batchId}`);
    await expect(
      page.getByRole("heading", { name: "Detalle de promoción" })
    ).toBeVisible({ timeout: 45_000 });
    const reanudar = page.getByRole("button", { name: "Reanudar" });
    await expect(reanudar).toBeVisible();
    await reanudar.click();
    await expect(
      page.getByText("No hay acciones pendientes para reanudar")
    ).toBeVisible({ timeout: 15_000 });
    await capturar(page, "pro-03b-reanudar-limitacion");

    await admin
      .from("lotes_promocion")
      .update({ status: "COMPLETED" })
      .eq("id", batchId);
    await page.goto(`/promocion/${batchId}`);
    await expect(
      page.getByRole("heading", { name: "Detalle de promoción" })
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Completado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reanudar" })).toHaveCount(0);
  });
});
