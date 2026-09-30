"use client";

import { useEffect } from "react";
import { RotateCcw, ServerCrash } from "lucide-react";
import { APP_NAME } from "@/lib/app";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_55%)]"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
          <ServerCrash className="h-7 w-7" />
        </span>
        <p className="font-display text-4xl font-bold text-ink">500</p>
        <h1 className="mt-2 font-display text-xl font-bold text-ink">
          Algo salió mal
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Ocurrió un error inesperado. Vuelve a intentarlo; si persiste, cierra
          y abre sesión nuevamente.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong"
        >
          <RotateCcw className="h-4 w-4" />
          Reintentar
        </button>
        <p className="mt-6 text-xs text-ink-muted">{APP_NAME}</p>
      </div>
    </div>
  );
}
