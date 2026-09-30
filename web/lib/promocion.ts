import type { Json, PromocionLoteStatus } from "@/types/supabase";
import type { StatusTone } from "@/components/ui/status-pill";

export const LOTE_LABELS: Record<string, string> = {
  PREPARED: "Preparado",
  RUNNING: "En ejecución",
  COMPLETED: "Completado",
  COMPLETED_WITH_EXCEPTIONS: "Completado con excepciones",
  INTERRUPTED: "Interrumpido",
  FAILED: "Fallido",
};

export const LOTE_TONES: Record<string, StatusTone> = {
  PREPARED: "blue",
  RUNNING: "amber",
  COMPLETED: "green",
  COMPLETED_WITH_EXCEPTIONS: "teal",
  INTERRUPTED: "amber",
  FAILED: "rose",
};

/** Estados recuperables: el lote puede reanudarse o ejecutarse. */
export const RECUPERABLES: PromocionLoteStatus[] = [
  "PREPARED",
  "RUNNING",
  "INTERRUPTED",
  "FAILED",
];

export function readCounts(counts: Json): {
  total?: number;
  promoted?: number;
  egreso?: number;
  retired?: number;
} {
  if (counts && typeof counts === "object" && !Array.isArray(counts)) {
    const obj = counts as Record<string, unknown>;
    const promoted =
      typeof obj.promoted === "number"
        ? obj.promoted
        : typeof obj.processed === "number"
          ? obj.processed
          : undefined;
    return {
      total: typeof obj.total === "number" ? obj.total : undefined,
      promoted,
      egreso: typeof obj.egreso === "number" ? obj.egreso : undefined,
      retired: typeof obj.retired === "number" ? obj.retired : undefined,
    };
  }
  return {};
}
