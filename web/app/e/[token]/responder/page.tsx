"use client";

import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ResponseForm } from "@/components/encuesta/ResponseForm";
import { LoadingScreen } from "@/components/ui/feedback";

function ResponderWithParams({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const respondentName = searchParams.get("name") ?? "Respondiente";
  return (
    <ResponseForm
      token={token}
      respondentName={respondentName}
      basePath="/e"
    />
  );
}

export default function EnlaceResponderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <Suspense fallback={<LoadingScreen label="Cargando encuesta..." />}>
      <ResponderWithParams token={token} />
    </Suspense>
  );
}
