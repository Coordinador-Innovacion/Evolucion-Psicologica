"use client";

import { Suspense } from "react";
import { ConfiguracionContent } from "@/components/configuracion/ConfiguracionTabs";

export default function ConfiguracionPage() {
  return (
    <Suspense>
      <ConfiguracionContent />
    </Suspense>
  );
}
