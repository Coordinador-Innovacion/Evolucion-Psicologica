import type { IconName } from "@/components/ui/icons";

export const COORD_ROLES = [
  "global",
  "director",
  "admin_ie",
  "coordinador",
] as const;

export const OPS_ROLES = [
  "global",
  "director",
  "admin_ie",
  "coordinador",
  "psicologo",
  "docente",
] as const;

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  description: string;
  roles?: readonly string[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Inicio",
    icon: "home",
    description: "Resumen y acceso rápido a los módulos",
  },
  {
    href: "/encuestas",
    label: "Encuestas",
    icon: "clipboard",
    description: "Constructor, versiones y aplicaciones de encuestas",
  },
  {
    href: "/casos",
    label: "Casos",
    icon: "folder",
    description: "Seguimiento de casos y atenciones",
  },
  {
    href: "/estudiantes/registro",
    label: "Estudiantes",
    icon: "cap",
    description: "Registro de estudiantes",
    roles: ["psicologo", "global"],
  },
  {
    href: "/coordinador",
    label: "Coordinación",
    icon: "compass",
    description: "Promoción, licencias y herramientas de coordinación",
    roles: COORD_ROLES,
  },
  {
    href: "/analitica",
    label: "Analítica",
    icon: "chart",
    description: "Indicadores y métricas institucionales",
    roles: OPS_ROLES,
  },
  {
    href: "/instituciones",
    label: "Instituciones",
    icon: "building",
    description: "Gestión de instituciones educativas",
    roles: ["global"],
  },
  {
    href: "/personal",
    label: "Personal",
    icon: "users",
    description: "Alta de personal y gestión de roles",
    roles: ["global"],
  },
];

export function canSeeNavItem(
  item: NavItem,
  role: string | null | undefined
): boolean {
  if (!item.roles) return true;
  if (role === null || role === undefined) return false;
  return item.roles.includes(role);
}

export function pageTitleFor(pathname: string): string {
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) =>
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
  if (match) return match.label;
  const segment = pathname.split("/").filter(Boolean).pop() ?? "";
  return segment
    ? segment.charAt(0).toUpperCase() + segment.slice(1)
    : "Evolución Psicológica";
}

export const ROLE_LABELS: Record<string, string> = {
  global: "Global",
  director: "Director",
  admin_ie: "Admin I.E.",
  coordinador: "Coordinador",
  psicologo: "Psicólogo",
  docente: "Docente",
};
