"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

function useCountUp(target: number, duration = 700): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (reduced) {
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, reduced]);

  return value;
}

const TONES = {
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  blue: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
} as const;

export type KpiTone = keyof typeof TONES;

export function KpiCard({
  label,
  value,
  icon,
  tone = "violet",
  hint,
  loading = false,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  tone?: KpiTone;
  hint?: string;
  loading?: boolean;
}) {
  const counted = useCountUp(value);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-500/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-muted">
            {label}
          </p>
          {loading ? (
            <div className="shimmer mt-3 h-8 w-16 rounded-lg" />
          ) : (
            <p className="mt-2 font-display text-3xl font-bold text-ink">
              {counted}
            </p>
          )}
          {hint && (
            <p className="mt-1 truncate text-xs text-ink-muted">{hint}</p>
          )}
        </div>
        {icon && (
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
