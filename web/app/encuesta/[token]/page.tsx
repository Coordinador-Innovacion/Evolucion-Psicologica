"use client";

import { use } from "react";
import { DniAccessForm } from "@/components/encuesta/DniAccessForm";
import { Icon } from "@/components/ui/icons";

export default function TokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_55%)]"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-950/30">
            <Icon name="pulse" className="h-8 w-8" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Evolución Psicológica
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Encuesta institucional
          </p>
        </div>

        <DniAccessForm token={token} />
      </div>
    </div>
  );
}
