import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { SystemStatus } from "@/components/system/SystemStatus";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function Route404Page() {
  return (
    <SystemStatus
      code="404"
      title="Página no encontrada"
      description="La ruta que buscas no existe o fue movida."
      icon={<SearchX className="h-7 w-7" />}
      action={{ href: "/", label: "Volver al inicio" }}
    />
  );
}
