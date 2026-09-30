import type { ReactNode } from "react";

const TONES = {
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  blue: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
} as const;

export type StatusTone = keyof typeof TONES;

export function StatusPill({
  tone = "slate",
  children,
  dot = true,
}: {
  tone?: StatusTone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

export const CASO_TONES: Record<string, StatusTone> = {
  inicio: "blue",
  en_proceso: "amber",
  cerrado: "green",
  suspendido: "slate",
};

export const APLICACION_TONES: Record<string, StatusTone> = {
  borrador: "slate",
  abierta: "blue",
  cerrada: "green",
  vencida: "rose",
};

export const TRANSFERENCIA_TONES: Record<string, StatusTone> = {
  pendiente: "amber",
  aprobada: "green",
  rechazada: "rose",
};
