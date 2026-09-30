"use client";

export type StepDef = {
  id: number;
  label: string;
};

/**
 * Stepper lateral (desktop) / horizontal (móvil) para el wizard EST-02.
 */
export function Stepper({
  steps,
  active,
  completed,
  onJump,
  canJump,
}: {
  steps: StepDef[];
  active: number;
  completed: Set<number>;
  onJump: (id: number) => void;
  canJump: (id: number) => boolean;
}) {
  return (
    <nav
      aria-label="Pasos del registro"
      className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {steps.map((step, index) => {
        const isActive = step.id === active;
        const isDone = completed.has(step.id);
        const jumpable = canJump(step.id);
        return (
          <button
            key={step.id}
            type="button"
            disabled={!jumpable}
            aria-current={isActive ? "step" : undefined}
            onClick={() => jumpable && onJump(step.id)}
            className={`flex min-w-max items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition lg:w-full ${
              isActive
                ? "border-primary bg-primary-soft text-primary"
                : jumpable
                  ? "border-line bg-white text-ink-muted hover:border-primary/40 hover:text-primary"
                  : "border-line bg-white text-ink-muted/60"
            }`}
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                isActive
                  ? "bg-primary text-white"
                  : isDone
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {isDone && !isActive ? "✓" : index + 1}
            </span>
            <span className="font-medium">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
