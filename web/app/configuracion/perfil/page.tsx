"use client";

import { Suspense } from "react";
import { ConfiguracionContent } from "@/components/configuracion/ConfiguracionTabs";

export default function ConfiguracionPerfilPage() {
  return (
    <Suspense>
      <ConfiguracionContent initialTab="perfil" />
    </Suspense>
  );
}
