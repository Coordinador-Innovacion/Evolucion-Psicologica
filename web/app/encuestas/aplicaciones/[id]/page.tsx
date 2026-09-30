"use client";

import { use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationDetail } from "@/components/encuestas/aplicaciones/ApplicationDetail";
import { LoadingScreen } from "@/components/ui/feedback";

function DetailWithParams({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const openLinks = searchParams.get("links") === "1";
  return <ApplicationDetail applicationId={id} openLinks={openLinks} />;
}

export default function AplicacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense fallback={<LoadingScreen label="Cargando aplicación..." />}>
        <DetailWithParams id={id} />
      </Suspense>
    </div>
  );
}
