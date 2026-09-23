"use client";

import { use } from "react";
import { redirect } from "next/navigation";

export default function SurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  redirect(`/encuestas/${id}/constructor`);
}
