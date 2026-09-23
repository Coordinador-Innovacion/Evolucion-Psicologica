export type PeriodPreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "custom";

export interface DateRange {
  start: string;
  end: string;
}

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  this_month: "Este mes",
  last_month: "Mes anterior",
  last_3_months: "Últimos 3 meses",
  this_year: "Este año",
  custom: "Personalizado",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function endOfLocalDay(d: Date): string {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

function startOfLocalDay(d: Date): string {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/**
 * Resuelve el rango de fechas de un filtro de analítica.
 * `now` permite inyección para tests deterministas.
 */
export function resolvePeriodRange(
  preset: PeriodPreset,
  customFrom?: string | null,
  customTo?: string | null,
  now: Date = new Date()
): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case "this_month": {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { start: toDateOnly(start), end: toDateOnly(end) };
    }
    case "last_month": {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: toDateOnly(start), end: toDateOnly(end) };
    }
    case "last_3_months": {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m + 1, 0);
      return { start: toDateOnly(start), end: toDateOnly(end) };
    }
    case "this_year": {
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    case "custom": {
      const from = customFrom?.trim() || toDateOnly(now);
      const to = customTo?.trim() || toDateOnly(now);
      if (from > to) {
        return { start: to, end: from };
      }
      return { start: from, end: to };
    }
  }
}

/**
 * Convierte un rango de fechas (YYYY-MM-DD) a límites ISO para columnas timestamptz.
 * Inclusivo: inicio del día `start` hasta fin del día `end`.
 */
export function rangeToIsoBounds(range: DateRange): {
  startIso: string;
  endIso: string;
} {
  const [sy, sm, sd] = range.start.split("-").map(Number);
  const [ey, em, ed] = range.end.split("-").map(Number);
  return {
    startIso: startOfLocalDay(new Date(sy, sm - 1, sd)),
    endIso: endOfLocalDay(new Date(ey, em - 1, ed)),
  };
}

export function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
