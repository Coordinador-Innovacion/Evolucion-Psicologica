import type { IconName } from "@/components/ui/icons";
import { can, type Capability } from "@/lib/permissions";

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
  capability?: Capability;
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
    capability: "encuestas.gestionar",
  },
  {
    href: "/casos",
    label: "Casos",
    icon: "folder",
    description: "Seguimiento de casos y atenciones",
    capability: "casos.consultar",
  },
  {
    href: "/atenciones",
    label: "Atenciones",
    icon: "pulse",
    description: "Registro y consulta de atenciones psicológicas",
    capability: "atenciones.consultar",
  },
  {
    href: "/derivaciones",
    label: "Derivaciones",
    icon: "branch",
    description: "Derivaciones recibidas y su vínculo con casos",
    capability: "derivaciones.consultar",
  },
  {
    href: "/estudiantes",
    label: "Estudiantes",
    icon: "cap",
    description: "Ficha, registro y seguimiento de estudiantes",
    capability: "estudiantes.consultar",
  },
  {
    href: "/academico/niveles",
    label: "Académico",
    icon: "calendar",
    description: "Niveles, grados, secciones y asignación docente",
    capability: "academico.gestionar",
  },
  {
    href: "/coordinador",
    label: "Coordinación",
    icon: "compass",
    description: "Promoción, licencias y herramientas de coordinación",
    roles: COORD_ROLES,
  },
  {
    href: "/transferencias",
    label: "Transferencias",
    icon: "branch",
    description: "Solicitudes de transferencia entre instituciones",
    capability: "transferencias.consultar",
  },
  {
    href: "/promocion",
    label: "Promoción",
    icon: "cap",
    description: "Lotes de promoción de fin de año",
    capability: "promocion.gestionar",
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
    href: "/licencias",
    label: "Licencias",
    icon: "key",
    description: "Registro, renovación y vigencia de licencias",
    capability: "licencias.gestionar",
  },
  {
    href: "/usuarios",
    label: "Usuarios",
    icon: "users",
    description: "Listado y gestión de usuarios por institución",
    capability: "usuarios.listar",
  },
  {
    href: "/mi-institucion",
    label: "Mi institución",
    icon: "building",
    description: "Datos, niveles y licencia de tu institución",
    roles: ["director", "admin_ie"],
  },
  {
    href: "/personal",
    label: "Personal",
    icon: "users",
    description: "Alta de personal y gestión de roles",
    roles: ["global"],
  },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: "settings",
    description: "Perfil, seguridad y apariencia",
    capability: "configuracion.ver",
  },
];

export function canSeeNavItem(
  item: NavItem,
  role: string | null | undefined
): boolean {
  if (item.roles && !item.roles.includes(role ?? "")) return false;
  if (item.capability && !can(role, item.capability)) return false;
  if (!item.roles && !item.capability) return true;
  if (!role) return false;
  if (item.roles) return item.roles.includes(role);
  return true;
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
