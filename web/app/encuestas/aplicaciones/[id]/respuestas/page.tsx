"use client";

import { use } from "react";
import { ApplicationAnswers } from "@/components/encuestas/aplicaciones/ApplicationAnswers";

export default function AplicacionRespuestasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ApplicationAnswers applicationId={id} />
    </div>
  );
}
