import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

/**
 * F6 — ENC-01..08, APL-01..06, RESP-01..07 (§5.13, §5.14, §5.15).
 * Verificación estática: migraciones 057/058, seed F6, fuentes de las
 * pantallas y permisos. No sustituye el e2e con filas reales — E2E-09/10/11.
 */

const ROOT = path.resolve(__dirname, "../../..");
const WEB = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}
function web(rel: string): string {
  return readFileSync(path.join(WEB, rel), "utf8");
}

const sql057 = read("supabase/migrations/057_f6_survey_batch_and_respondent.sql");
const sql058 = read("supabase/migrations/058_f6_respondent_experience.sql");
const sql053 = read("supabase/migrations/053_f2_student_registration_and_academic.sql");
const seedF6 = read("supabase/seed_f6_e2e.sql");

const encList = web("app/encuestas/page.tsx");
const encNueva = web("app/encuestas/nueva/page.tsx");
const encDetail = web("app/encuestas/[id]/page.tsx");
const constructorContent = web("components/encuestas/constructor/ConstructorContent.tsx");
const questionEditor = web("components/encuestas/constructor/QuestionEditor.tsx");
const typeSelector = web("components/encuestas/constructor/QuestionTypeSelector.tsx");
const publishDialog = web("components/encuestas/versiones/PublishVersionDialog.tsx");
const copyDialog = web("components/encuestas/CopySurveyDialog.tsx");

const applicationsList = web("components/encuestas/aplicaciones/ApplicationsList.tsx");
const wizard = web("components/encuestas/aplicaciones/ApplicationWizard.tsx");
const applicationDetail = web("components/encuestas/aplicaciones/ApplicationDetail.tsx");
const applicationAnswers = web("components/encuestas/aplicaciones/ApplicationAnswers.tsx");

const eLanding = web("app/e/[token]/page.tsx");
const eAcceso = web("app/e/[token]/acceso/page.tsx");
const eDatos = web("app/e/[token]/datos/page.tsx");
const eResponder = web("app/e/[token]/responder/page.tsx");
const responseForm = web("components/encuesta/ResponseForm.tsx");
const dniForm = web("components/encuesta/DniAccessForm.tsx");
const permissions = web("lib/permissions.ts");

const NUEVE_TIPOS = [
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

describe("F6 — migración 058: experiencia del respondiente", () => {
  it("expone códigos de estado para RESP-01 (inválido / no abierta / vencida)", () => {
    expect(sql058).toContain("'code', 'invalid_token'");
    expect(sql058).toContain("'code', 'not_open'");
    expect(sql058).toContain("'code', 'window_closed'");
    expect(sql058).toContain("'code', 'unavailable'");
    expect(sql058).toContain("'code', 'unpublished'");
    expect(sql058).toContain("La aplicación aún no está disponible");
  });

  it("permite ver la estructura cuando la aplicación ya completó (RESP-05)", () => {
    expect(sql058).toContain("IF v_application.status <> 'completed' THEN");
    expect(sql058).toContain("'completed', v_application.status = 'completed'");
  });

  it("recalcula el avance vivo (respondidas / totales) al guardar (RESP-04)", () => {
    expect(sql058).toContain("v_progress INT");
    expect(sql058).toContain("SET progress = v_progress");
    expect(sql058).toContain("'progress', v_progress");
  });

  it("activa aplicaciones programadas y finaliza con progreso 100", () => {
    expect(sql058).toContain("IF v_application.status = 'scheduled' THEN");
    expect(sql058).toContain("SET status = 'completed', progress = 100");
  });

  it("usa SECURITY DEFINER con search_path restringido", () => {
    const definers = sql058.match(/SECURITY DEFINER/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(4);
    expect(sql058).toContain("SET search_path = public, pg_temp");
  });

  it("completa el perfil del respondiente y lo pasa a activo (RESP-03)", () => {
    expect(sql057).toContain("complete_respondent_profile");
    expect(sql058).toContain("FUNCTION complete_respondent_profile");
    expect(sql058).toContain("'scheduled'");
    expect(sql058).toContain(
      "Este respondiente no tiene datos adicionales que completar"
    );
  });

  it("057 aporta intentos DNI, aplicación por lote y visor de respuestas", () => {
    expect(sql057).toContain("validate_survey_access");
    expect(sql057).toContain(
      "No encontramos un registro con este DNI para esta encuesta. Consulta con tu I.E."
    );
    expect(sql057).toContain("bulk_create_survey_applications");
    expect(sql057).toContain("get_survey_versions");
    expect(sql057).toContain("'in_use', EXISTS");
    expect(sql053).toContain("list_institution_docentes");
    expect(sql057).toContain("get_application_answers");
  });
});

describe("F6 — seed de pruebas (E2E-09/10/11)", () => {
  it("crea la encuesta con los 9 tipos y ambas presentaciones", () => {
    for (const tipo of NUEVE_TIPOS) {
      expect(seedF6).toContain(`'${tipo}'`);
    }
    expect(seedF6).toContain('"mode":"visual"');
    expect(seedF6).toContain('"mode":"normal"');
    expect(seedF6).toContain('"style":"stars"');
  });

  it("publica la V1 en uso con aplicaciones y tokens fijos", () => {
    expect(seedF6).toContain("f6e50002-0000-4000-8000-000000000002");
    expect(seedF6).toContain("'published'");
    expect(seedF6).toContain("f6seedtokenopen0001");
    expect(seedF6).toContain("'expired'");
    expect(seedF6).toContain("'scheduled'");
    expect(seedF6).toContain("'completed'");
    expect(seedF6).toContain("ON CONFLICT (id) DO NOTHING");
  });
});

describe("F6/ENC — motor de encuestas (§5.13)", () => {
  it("ENC-01: biblioteca con tabs Encuestas/Aplicaciones y botón Nueva encuesta", () => {
    expect(encList).toContain('id: "encuestas", label: "Encuestas"');
    expect(encList).toContain('id: "aplicaciones"');
    expect(encList).toContain('label: "Aplicaciones"');
    expect(encList).toContain("Nueva encuesta");
    expect(encList).toContain("/encuestas/nueva");
    expect(encList).toContain("vigente");
    expect(encList).toContain("aplicación");
  });

  it("ENC-02: elección desde cero o copiar una existente", () => {
    expect(encNueva).toContain("Desde cero");
    expect(encNueva).toContain("Copiar una existente");
    expect(encNueva).toContain("Crear desde cero");
    expect(encNueva).toContain("Elige cómo quieres comenzar.");
  });

  it("ENC-03: resumen con versiones, aplicaciones y gate de nueva versión", () => {
    expect(encDetail).toContain("Versiones");
    expect(encDetail).toContain("Nueva versión");
    expect(encDetail).toContain("en uso");
    expect(encDetail).toContain("Nueva aplicación");
    expect(encDetail).toContain("Copiar encuesta");
  });

  it("ENC-04: constructor con los 9 tipos, propiedades y presentaciones", () => {
    for (const tipo of NUEVE_TIPOS) {
      expect(typeSelector).toContain(`"${tipo}"`);
    }
    expect(constructorContent).toContain("+ Agregar sección");
    expect(constructorContent).toContain("Autoguardado ✓");
    expect(constructorContent).toContain("Vista previa");
    expect(constructorContent).toContain("Publicar");
    expect(questionEditor).toContain("Presentación");
    expect(questionEditor).toContain("Visual (tarjetas con icono)");
    expect(questionEditor).toContain("Estrellas");
    expect(questionEditor).toContain("Normal (radios)");
    expect(questionEditor).toContain("Obligatoria");
  });

  it("ENC-04: versión publicada en uso queda en modo solo lectura", () => {
    expect(constructorContent).toContain(
      "Esta versión ya fue utilizada y es inmutable."
    );
    expect(constructorContent).toContain("Crear nueva versión");
    expect(constructorContent).toContain("readOnly = !isDraft");
  });

  it("ENC-06: diálogo de publicación con lista de validaciones e inmutabilidad", () => {
    expect(publishDialog).toContain("Revisa las validaciones antes de publicar:");
    expect(publishDialog).toContain("Al menos una sección");
    expect(publishDialog).toContain("Al menos una pregunta");
    expect(publishDialog).toContain("Cada pregunta con enunciado");
    expect(publishDialog).toContain("Opciones válidas donde el tipo lo requiere");
    expect(publishDialog).toContain("Escalas coherentes (mínimo < máximo)");
    expect(publishDialog).toContain(
      "Una vez publicada, la versión queda inmutable"
    );
    expect(publishDialog).toContain("Publicar versión");
  });

  it("ENC-08: copia independiente con nombre nuevo", () => {
    expect(copyDialog).toContain("Copiar encuesta");
    expect(copyDialog).toContain(
      "La copia es completamente independiente; los cambios no afectan a la"
    );
    expect(encList).toContain("CopySurveyDialog");
    expect(encList).not.toContain("window.prompt");
  });
});

describe("F6/APL — aplicaciones (§5.14)", () => {
  it("APL-01: lista con filtros y estados programada/abierta/vencida/cerrada", () => {
    expect(applicationsList).toContain('value="programada"');
    expect(applicationsList).toContain('value="abierta"');
    expect(applicationsList).toContain('value="vencida"');
    expect(applicationsList).toContain('value="cerrada"');
    expect(applicationsList).toContain("Avance promedio");
    expect(applicationsList).toContain("Año escolar");
    expect(applicationsList).toContain("applicationUiState");
  });

  it("APL-02: wizard de 5 pasos con aviso de aplicación independiente", () => {
    expect(wizard).toContain('label: "Encuesta y versión"');
    expect(wizard).toContain('label: "Año escolar"');
    expect(wizard).toContain('label: "Respondientes"');
    expect(wizard).toContain('label: "Ventana"');
    expect(wizard).toContain('label: "Revisión"');
    expect(wizard).toContain("Se creará una nueva aplicación");
    expect(wizard).toContain("Horario de Lima (GMT-5)");
    expect(wizard).toContain("bulkCreateApplications");
    expect(wizard).toContain("list_institution_docentes");
  });

  it("APL-03: detalle con anillo de avance, participantes y acciones", () => {
    expect(applicationDetail).toContain("Avance de la aplicación");
    expect(applicationDetail).toContain("avance promedio");
    expect(applicationDetail).toContain("Participantes");
    expect(applicationDetail).toContain("Ampliar plazo");
    expect(applicationDetail).toContain("Copiar enlace");
    expect(applicationDetail).toContain("Ver respuestas");
    expect(applicationDetail).toContain("(esta aplicación)");
  });

  it("APL-04: ampliar plazo conserva aplicación, enlace y avance", () => {
    expect(applicationDetail).toContain(
      "Se mantiene la misma aplicación, el mismo enlace y el avance"
    );
    expect(applicationDetail).toContain("No se crea una aplicación nueva.");
    expect(applicationDetail).toContain("extendApplication");
  });

  it("APL-05: enlaces propios, copiar todos y CSV", () => {
    expect(applicationDetail).toContain("Enlaces de acceso");
    expect(applicationDetail).toContain("Copiar todos");
    expect(applicationDetail).toContain("Descargar lista (CSV)");
    expect(applicationDetail).toContain("`/e/${token}`");
    expect(applicationDetail).toContain("Cada participante tiene un enlace propio");
  });

  it("APL-06: visor de respuestas por respondiente con agregados", () => {
    expect(applicationAnswers).toContain("Finalizadas");
    expect(applicationAnswers).toContain("En progreso");
    expect(applicationAnswers).toContain("Sin iniciar");
    expect(applicationAnswers).toContain("get_application_answers");
  });
});

describe("F6/RESP — experiencia pública /e (§5.15)", () => {
  it("ruta pública /e/[token] declarada como prefijo público", () => {
    expect(permissions).toContain('"/e/"');
    expect(eLanding.length).toBeGreaterThan(0);
    expect(eAcceso).toContain("DniAccessForm");
    expect(eAcceso).toContain('basePath="/e"');
    expect(eDatos).toContain("Completa lo que falta");
    expect(eResponder).toContain('basePath="/e"');
  });

  it("RESP-01: estados terminales con fechas de apertura/cierre", () => {
    expect(eLanding).toContain("Enlace no válido");
    expect(eLanding).toContain("La encuesta aún no está disponible");
    expect(eLanding).toContain("El plazo de la encuesta terminó");
    expect(eLanding).toContain("Abre el");
    expect(eLanding).toContain("Cerró el");
    expect(eLanding).toContain("Consulta con tu I.E.");
    expect(eLanding).toContain("¡Gracias por participar!");
    expect(eLanding).toContain("Continuar con mi DNI");
  });

  it("RESP-02: DNI con mensaje genérico y validación en servidor", () => {
    expect(dniForm).toContain('id="dni"');
    expect(dniForm).toContain('inputMode="numeric"');
    expect(dniForm).toContain("validate_survey_access");
    expect(dniForm).toContain("basePath");
    expect(dniForm).toContain("No se pudo validar el acceso");
  });

  it("RESP-03: muestra datos en lectura y autoguardado al completar", () => {
    expect(eDatos).toContain("Información registrada");
    expect(eDatos).toContain("Completa lo que falta");
    expect(eDatos).toContain("Guardado ✓");
    expect(eDatos).toContain("Padre, madre o apoderado");
    expect(eDatos).toContain("complete_respondent_profile");
  });

  it("RESP-04: autoguardado con indicador, navegación y validación", () => {
    expect(responseForm).toContain("Guardando...");
    expect(responseForm).toContain("Guardado ✓");
    expect(responseForm).toContain("sin guardar");
    expect(responseForm).toContain("← Anterior");
    expect(responseForm).toContain("Continuar →");
    expect(responseForm).toContain("Finalizar encuesta");
    expect(responseForm).toContain("pregunta obligatoria");
    expect(responseForm).toContain("windowClosed");
    expect(responseForm).toContain("Reintentar");
    expect(web("hooks/useSurveyResponse.ts")).toContain("}, 800)");
  });

  it("RESP-05/06/07: finalización, reanudación y plazo en vivo", () => {
    expect(responseForm).toContain("¿Finalizar encuesta?");
    expect(responseForm).toContain("Sí, finalizar");
    expect(responseForm).toContain("¡Gracias por participar!");
    expect(responseForm).toContain("El plazo terminó; tu avance quedó guardado.");
    expect(responseForm).toContain("Volver al inicio");
    expect(web("hooks/useSurveyResponse.ts")).toContain("resumeIndex");
    expect(web("hooks/useSurveyResponse.ts")).toContain("flushPending");
    expect(web("hooks/useSurveyResponse.ts")).toContain("retryPending");
    expect(web("hooks/useSurveyResponse.ts")).toContain('addEventListener("online"');
  });
});

describe("F6 — permisos alineados con el server (E2E-12 afín)", () => {
  it("docente no gestiona encuestas ni aplicaciones", () => {
    expect(can("docente", "encuestas.gestionar")).toBe(false);
    expect(can("docente", "encuestas.aplicaciones")).toBe(false);
    expect(can("docente", "encuestas.respuestas")).toBe(false);
  });

  it("psicólogo sí gestiona encuestas y puede registrar estudiantes", () => {
    expect(can("psicologo", "encuestas.gestionar")).toBe(true);
    expect(can("psicologo", "encuestas.aplicaciones")).toBe(true);
    expect(can("psicologo", "estudiantes.registro")).toBe(true);
  });

  it("no hay bloque de roles en la ruta de encuestas", () => {
    const nav = web("components/layout/nav.ts");
    const bloque = nav.slice(nav.indexOf("/encuestas"));
    const hasta = bloque.indexOf("}");
    expect(bloque.slice(0, hasta)).not.toContain("roles:");
  });
});
