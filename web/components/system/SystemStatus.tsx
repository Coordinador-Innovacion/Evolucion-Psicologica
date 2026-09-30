import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/app";

export function SystemStatus({
  code,
  title,
  description,
  icon,
  action,
}: {
  code: string;
  title: string;
  description: string;
  icon: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_55%)]"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-card">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
          {icon}
        </span>
        <p className="font-display text-4xl font-bold text-ink">{code}</p>
        <h1 className="mt-2 font-display text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{description}</p>
        {action && (
          <Link
            href={action.href}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong"
          >
            {action.label}
          </Link>
        )}
        <p className="mt-6 text-xs text-ink-muted">{APP_NAME}</p>
      </div>
    </div>
  );
}
