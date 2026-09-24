"use client";

import { use } from "react";
import Link from "next/link";
import { PreviewContent } from "@/components/encuestas/preview/PreviewContent";

export default function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Encuesta
          </p>
          <h1 className="text-xl font-semibold text-slate-900">
            Vista previa
          </h1>
        </div>
        <Link
          href={`/encuestas/${id}/constructor`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Volver al constructor
        </Link>
      </div>
      <PreviewContent surveyId={id} />
    </div>
  );
}
