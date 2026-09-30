import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { SystemStatus } from "@/components/system/SystemStatus";

export const metadata: Metadata = { title: "Sin acceso" };

export default function ForbiddenPage() {
  return (
    <SystemStatus
      code="403"
      title="No tienes acceso a esta sección"
      description="Tu rol no incluye este módulo. Si crees que es un error, contacta al administrador de tu institución."
      icon={<ShieldAlert className="h-7 w-7" />}
      action={{ href: "/", label: "Volver al inicio" }}
    />
  );
}
