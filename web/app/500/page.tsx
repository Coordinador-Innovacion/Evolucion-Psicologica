import type { Metadata } from "next";
import { ServerCrash } from "lucide-react";
import { SystemStatus } from "@/components/system/SystemStatus";

export const metadata: Metadata = { title: "Error del servidor" };

export default function ServerErrorPage() {
  return (
    <SystemStatus
      code="500"
      title="Algo salió mal"
      description="Ocurrió un error inesperado en el servidor. Intenta de nuevo en unos segundos."
      icon={<ServerCrash className="h-7 w-7" />}
      action={{ href: "/", label: "Reintentar desde el inicio" }}
    />
  );
}
