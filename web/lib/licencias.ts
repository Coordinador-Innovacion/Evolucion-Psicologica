// Helpers de estado de licencia (LIC-01/04, IE-01/03/06).
// El estado se deriva de las fechas (no hay columna status en `licencias`):
// futura / vigente / por vencer (≤30 días) / vencida — umbral idéntico al
// de get_expiring_licenses (045:824) y get_license_status (045:870).

export type EstadoLicencia =
  | "futura"
  | "vigente"
  | "por_vencer"
  | "vencida"
  | "sin_licencia";

export const HOY_ISO: string = new Date().toISOString().slice(0, 10);

export const DIAS_AVISO = 30;

export function daysUntil(fechaISO: string, hoy = HOY_ISO): number {
  return Math.ceil((Date.parse(fechaISO) - Date.parse(hoy)) / 86_400_000);
}

export function deriveLicenseEstado(
  start: string,
  end: string,
  hoy = HOY_ISO
): EstadoLicencia {
  if (start > hoy) return "futura";
  if (end < hoy) return "vencida";
  if (daysUntil(end, hoy) <= DIAS_AVISO) return "por_vencer";
  return "vigente";
}

export const ESTADO_LICENCIA: Record<
  EstadoLicencia,
  { label: string; tone: "green" | "amber" | "red" | "slate" | "indigo" }
> = {
  vigente: { label: "Vigente", tone: "green" },
  por_vencer: { label: "Por vencer", tone: "amber" },
  vencida: { label: "Vencida", tone: "red" },
  futura: { label: "Futura", tone: "slate" },
  sin_licencia: { label: "Sin licencia", tone: "indigo" },
};

export function fmtFecha(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Estado agregado de todas las licencias de una I.E. (IE-01):
 * si hay una que cubre hoy se deriva de ella; si todas terminaron
 * → vencida; si solo hay futuras → futura; sin filas → sin_licencia.
 */
export function estadoDeGrupo(
  licencias: { start_date: string; end_date: string }[]
): EstadoLicencia {
  if (licencias.length === 0) return "sin_licencia";
  const activa = licencias.find(
    (l) => l.start_date <= HOY_ISO && l.end_date >= HOY_ISO
  );
  if (activa) return deriveLicenseEstado(activa.start_date, activa.end_date);
  if (licencias.some((l) => l.end_date < HOY_ISO)) return "vencida";
  return "futura";
}

/** Suma un día (ISO) — LIC-03: renovación inicia al día siguiente del fin. */
export function nextDayISO(fechaISO: string): string {
  const d = new Date(`${fechaISO}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
