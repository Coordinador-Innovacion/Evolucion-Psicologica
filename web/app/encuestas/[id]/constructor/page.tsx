"use client";

import { use } from "react";
import { ConstructorContent } from "@/components/encuestas/constructor/ConstructorContent";

export default function ConstructorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ConstructorContent surveyId={id} />;
}
