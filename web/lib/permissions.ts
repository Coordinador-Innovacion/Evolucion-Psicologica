export type Role =
  | "global"
  | "director"
  | "admin_ie"
  | "coordinador"
  | "psicologo"
  | "docente";

export const ROLES: readonly Role[] = [
  "global",
  "director",
  "admin_ie",
  "coordinador",
  "psicologo",
  "docente",
];

export type Capability =
  | "dashboard.view"
  | "configuracion.ver"
  | "estudiantes.consultar"
  | "estudiantes.registro"
  | "estudiantes.editar"
  | "estudiantes.familia"
  | "estudiantes.periodos"
  | "estudiantes.documentos.ver"
  | "estudiantes.documentos.gestionar"
  | "casos.consultar"
  | "casos.gestionar"
  | "atenciones.consultar"
  | "atenciones.registrar"
  | "atenciones.editar"
  | "derivaciones.consultar"
  | "derivaciones.crear"
  | "necesidades.consultar"
  | "necesidades.gestionar"
  | "necesidades.orientacion"
  | "encuestas.gestionar"
  | "encuestas.aplicaciones"
  | "encuestas.respuestas"
  | "instituciones.listar"
  | "instituciones.gestionar"
  | "instituciones.eliminar"
  | "instituciones.propia"
  | "licencias.gestionar"
  | "licencias.consultar"
  | "usuarios.listar"
  | "usuarios.gestionar"
  | "academico.gestionar"
  | "promocion.gestionar"
  | "transferencias.consultar"
  | "transferencias.solicitar"
  | "transferencias.autorizar"
  | "auditoria.consultar"
  | "analitica.ver";

export const CAPABILITIES: Record<Capability, readonly Role[]> = {
  "dashboard.view": ROLES,
  "configuracion.ver": ROLES,
  "estudiantes.consultar": ROLES,
  "estudiantes.registro": ["global", "director", "admin_ie", "coordinador", "psicologo"],
  "estudiantes.editar": ["global", "director", "admin_ie", "coordinador"],
  "estudiantes.familia": ["global", "director", "admin_ie", "coordinador"],
  "estudiantes.periodos": ["global", "director", "admin_ie", "coordinador"],
  "estudiantes.documentos.ver": ["global", "director", "admin_ie", "coordinador", "psicologo"],
  "estudiantes.documentos.gestionar": ["global", "director", "admin_ie", "coordinador", "psicologo"],
  "casos.consultar": ROLES,
  "casos.gestionar": ["global", "psicologo", "director", "admin_ie", "coordinador"],
  "atenciones.consultar": ROLES,
  "atenciones.registrar": ["global", "psicologo", "director", "admin_ie", "coordinador"],
  "atenciones.editar": ["global", "psicologo", "director", "admin_ie", "coordinador"],
  "derivaciones.consultar": ROLES,
  "derivaciones.crear": ["global", "psicologo", "director", "admin_ie", "coordinador"],
  "necesidades.consultar": ["global", "psicologo"],
  "necesidades.gestionar": ["global", "psicologo"],
  "necesidades.orientacion": ["global", "psicologo", "docente"],
  "encuestas.gestionar": ["global", "director", "admin_ie", "coordinador", "psicologo"],
  "encuestas.aplicaciones": ["global", "director", "admin_ie", "coordinador", "psicologo"],
  "encuestas.respuestas": ["global", "director", "admin_ie", "coordinador", "psicologo"],
  "instituciones.listar": ["global"],
  "instituciones.gestionar": ["global"],
  "instituciones.eliminar": ["global"],
  "instituciones.propia": ["global", "director", "admin_ie"],
  "licencias.gestionar": ["global"],
  "licencias.consultar": ROLES,
  "usuarios.listar": ["global", "director"],
  "usuarios.gestionar": ["global", "director"],
  "academico.gestionar": ["global", "director", "admin_ie"],
  "promocion.gestionar": ["global", "director", "admin_ie", "coordinador"],
  "transferencias.consultar": ROLES,
  "transferencias.solicitar": ["global", "director", "admin_ie"],
  "transferencias.autorizar": ["global", "director", "admin_ie"],
  "auditoria.consultar": ["global"],
  "analitica.ver": ["global", "director", "admin_ie", "coordinador", "psicologo"],
};

export function can(
  role: string | null | undefined,
  capability: Capability
): boolean {
  if (!role) return false;
  return CAPABILITIES[capability].includes(role as Role);
}

export function canAll(
  role: string | null | undefined,
  capabilities: readonly Capability[]
): boolean {
  return capabilities.every((capability) => can(role, capability));
}

export function canAny(
  role: string | null | undefined,
  capabilities: readonly Capability[]
): boolean {
  return capabilities.some((capability) => can(role, capability));
}

export type RouteRule = {
  path: string;
  capability?: Capability;
  roles?: readonly Role[];
};

export const ROUTES: readonly RouteRule[] = [
  { path: "/", capability: "dashboard.view" },
  { path: "/estudiantes", capability: "estudiantes.consultar" },
  { path: "/estudiantes/nuevo", capability: "estudiantes.registro" },
  { path: "/estudiantes/registro", capability: "estudiantes.registro" },
  { path: "/academico", capability: "academico.gestionar" },
  { path: "/casos", capability: "casos.consultar" },
  { path: "/casos/nuevo", capability: "casos.gestionar" },
  { path: "/atenciones", capability: "atenciones.consultar" },
  { path: "/derivaciones", capability: "derivaciones.consultar" },
  { path: "/derivaciones/nueva", capability: "derivaciones.crear" },
  { path: "/necesidades-especiales", capability: "necesidades.consultar" },
  { path: "/transferencias", capability: "transferencias.consultar" },
  { path: "/transferencias/nueva", capability: "transferencias.solicitar" },
  { path: "/transferencias/[id]", capability: "transferencias.consultar" },
  { path: "/instituciones", capability: "instituciones.listar" },
  { path: "/mi-institucion", capability: "instituciones.propia" },
  { path: "/licencias", capability: "licencias.gestionar" },
  { path: "/usuarios", capability: "usuarios.listar" },
  { path: "/personal", capability: "usuarios.gestionar" },
  { path: "/encuestas", capability: "encuestas.gestionar" },
  { path: "/promocion", capability: "promocion.gestionar" },
  { path: "/coordinador", roles: ["global", "director", "admin_ie", "coordinador"] },
  { path: "/auditoria", capability: "auditoria.consultar" },
  { path: "/analitica", capability: "analitica.ver" },
  { path: "/notificaciones", roles: ROLES },
  { path: "/configuracion", roles: ROLES },
];

export const PUBLIC_PREFIXES: readonly string[] = [
  "/auth/",
  "/encuesta/",
  "/e/",
  "/403",
  "/404",
  "/500",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function canAccessPath(
  role: string | null | undefined,
  pathname: string
): boolean {
  if (isPublicPath(pathname)) return true;
  const match = [...ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((rule) =>
      rule.path === "/"
        ? pathname === "/"
        : pathname === rule.path || pathname.startsWith(`${rule.path}/`)
    );
  if (!match) return role !== null && role !== undefined;
  if (match.capability) return can(role, match.capability);
  if (match.roles) return role !== null && match.roles.includes(role as Role);
  return true;
}
