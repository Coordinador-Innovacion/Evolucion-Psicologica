"use client";

import { use } from "react";
import { ConstructorContent } from "@/components/encuestas/constructor/ConstructorContent";

export default function EditarVersionPage({
  params,
}: {
  params: Promise<{ id: string; v: string }>;
}) {
  const { id, v } = use(params);
  return <ConstructorContent surveyId={id} versionId={v} />;
}
