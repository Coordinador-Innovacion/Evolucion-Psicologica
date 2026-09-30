"use client";

import { Suspense } from "react";
import { ConfiguracionContent } from "@/components/configuracion/ConfiguracionTabs";

export default function ConfiguracionSeguridadPage() {
  return (
    <Suspense>
      <ConfiguracionContent initialTab="seguridad" />
    </Suspense>
  );
}
