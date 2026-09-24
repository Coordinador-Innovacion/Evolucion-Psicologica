import type { ReactNode } from "react";

const TONES = {
  indigo: "bg-indigo-100 text-indigo-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  rose: "bg-rose-100 text-rose-600",
  sky: "bg-sky-100 text-sky-600",
  violet: "bg-violet-100 text-violet-600",
} as const;

export type StatTone = keyof typeof TONES;

export function StatCard({
  icon,
  value,
  label,
  hint,
  tone = "indigo",
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
          {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </div>
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}
