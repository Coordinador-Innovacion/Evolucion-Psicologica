import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB = path.resolve(__dirname, "../..");

function web(rel: string): string {
  return readFileSync(path.join(WEB, rel), "utf8");
}

describe("T69 — shell global de la interfaz", () => {
  it("el layout raíz envuelve todas las pantallas en AppShell", () => {
    const layout = web("app/layout.tsx");
    expect(layout).toContain("<AppShell>");
    expect(layout).toContain("{children}");
  });

  it("AppShell deja planas las rutas de auth y de encuesta pública", () => {
    const shell = web("components/layout/AppShell.tsx");
    expect(shell).toContain('"/auth/"');
    expect(shell).toContain('"/encuesta/"');
    expect(shell).toContain("PLAIN_PREFIXES");
  });

  it("AppShell ofrece salida de sesión desde el sidebar", () => {
    const shell = web("components/layout/AppShell.tsx");
    expect(shell).toContain("signOut");
  });

  it("el layout de encuestas ya no duplica navegación", () => {
    const layout = web("app/encuestas/layout.tsx");
    expect(layout).not.toContain("<nav");
    expect(layout).toContain("{children}");
  });

  it("las subrutas de encuesta no declaran su propia navegación", () => {
    for (const rel of [
      "app/encuestas/[id]/preview/page.tsx",
      "app/encuestas/[id]/versiones/page.tsx",
      "app/encuestas/[id]/aplicaciones/page.tsx",
      "app/casos/page.tsx",
      "app/casos/[id]/page.tsx",
      "app/analitica/page.tsx",
      "app/estudiantes/registro/page.tsx",
    ]) {
      expect(web(rel), rel).not.toContain("<nav");
    }
  });
});

describe("T69 — visibilidad de módulos por rol (visual)", () => {
  const nav = web("components/layout/nav.ts");

  it("Instituciones y Personal solo se muestran a Global", () => {
    const instituciones = nav.match(
      /href: "\/instituciones",[\s\S]*?roles: \[([^\]]*)\]/
    );
    const personal = nav.match(/href: "\/personal",[\s\S]*?roles: \[([^\]]*)\]/);
    expect(instituciones?.[1]).toContain('"global"');
    expect(instituciones?.[1]).not.toContain('"coordinador"');
    expect(personal?.[1]).toContain('"global"');
    expect(personal?.[1]).not.toContain('"coordinador"');
  });

  it("Analítica usa el conjunto de roles operativos", () => {
    const analitica = nav.match(/href: "\/analitica",[\s\S]*?roles: (\w+)/);
    expect(analitica?.[1]).toBe("OPS_ROLES");
    expect(nav).toContain('const OPS_ROLES = [');
    expect(nav).toContain('"docente"');
  });

  it("Encuestas y Casos están visibles para todos los roles autenticados", () => {
    const block = (href: string) =>
      nav.match(new RegExp(`href: "${href}",((?:(?!href:)[\\s\\S])*)`))?.[1] ??
      "";
    expect(block("/encuestas")).not.toContain("roles:");
    expect(block("/casos")).not.toContain("roles:");
  });

  it("canSeeNavItem oculta ítems cuando el rol no está en la lista", () => {
    expect(nav).toContain("export function canSeeNavItem");
    expect(nav).toContain("return item.roles.includes(role);");
  });
});

describe("T69 — sistema visual", () => {
  const css = web("app/globals.css");

  it("define la paleta base del rediseño", () => {
    expect(css).toContain("--color-canvas:");
    expect(css).toContain("--color-primary:");
    expect(css).toContain("--color-line:");
    expect(css).toContain("--color-sidebar:");
    expect(css).toContain("--shadow-card:");
    expect(css).toContain("--shadow-pop:");
  });

  it("la marca primaria es índigo (sin azules genéricos)", () => {
    expect(css).toContain("--color-primary: #4f46e5");
    expect(css).not.toContain("#3b82f6");
  });

  it("los componentes base existen como módulos reutilizables", () => {
    for (const rel of [
      "components/ui/button.tsx",
      "components/ui/field.tsx",
      "components/ui/badge.tsx",
      "components/ui/modal.tsx",
      "components/ui/feedback.tsx",
      "components/ui/stat-card.tsx",
      "components/ui/icons.tsx",
      "components/layout/AppShell.tsx",
      "components/layout/nav.ts",
    ]) {
      expect(web(rel), rel).toBeTruthy();
    }
  });

  it("no quedan clases azules genéricas en la interfaz", () => {
    const hits: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          scan(full);
        } else if (full.endsWith(".tsx")) {
          const src = readFileSync(full, "utf8");
          if (/bg-blue-|text-blue-|border-blue-/.test(src)) hits.push(full);
        }
      }
    };
    scan(path.join(WEB, "app"));
    scan(path.join(WEB, "components"));
    expect(hits).toEqual([]);
  });

  it("las páginas de autenticación comparten la identidad de marca", () => {
    const authLayout = web("app/auth/layout.tsx");
    expect(authLayout).toContain("Evolución Psicológica");
    expect(authLayout).toContain("radial-gradient");
    expect(authLayout).toContain("from-indigo-500");
  });

  it("la portada pública muestra la marca y el acceso", () => {
    const landing = web("app/page.tsx");
    expect(landing).toContain("Evolución Psicológica");
    expect(landing).toContain('href="/auth/login"');
    expect(landing).toContain("radial-gradient");
  });
});

describe("T69 — funcionalidad preservada tras el rediseño", () => {
  it("el acceso público a encuesta conserva la validación por DNI", () => {
    const dni = web("components/encuesta/DniAccessForm.tsx");
    expect(dni).toContain("validate_survey_access");
    expect(dni).toContain("p_token: token");
    expect(dni).toContain("p_dni: dni.trim()");
  });

  it("el registro de estudiantes conserva su búsqueda y alta", () => {
    const page = web("app/estudiantes/registro/page.tsx");
    expect(page).toContain('from("estudiantes")');
    expect(page).toContain("Registro mínimo de estudiante");
    expect(page).toContain("document_number: dni.trim()");
    expect(page).toContain("Solo el Psicólogo puede registrar estudiantes.");
  });

  it("la analítica conserva su gate por roles operativos", () => {
    const page = web("app/analitica/page.tsx");
    expect(page).toContain("OPS_ROLES");
    expect(page).toContain('countRows("casos"');
    expect(page).toContain("La analítica operativa está disponible para roles del sistema.");
  });

  it("los casos conservan sus estados y acciones", () => {
    const page = web("app/casos/page.tsx");
    expect(page).toContain('from("casos")');
    expect(page).toContain("CaseStatusBadge");
    const detail = web("app/casos/[id]/page.tsx");
    expect(detail).toContain("CaseActions");
    expect(detail).toContain("NewAttentionForm");
    expect(detail).toContain("canManage");
  });

  it("el flujo de encuesta pública conserva su progreso y guardado", () => {
    const form = web("components/encuesta/ResponseForm.tsx");
    expect(form).toContain("useSurveyResponse");
    expect(form).toContain("autosave");
    expect(form).toContain("completeSurvey");
    expect(form).toContain("areRequiredAnswered");
  });
});
