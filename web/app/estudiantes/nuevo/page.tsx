"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";
import { StudentWizard } from "@/components/estudiantes/StudentWizard";
import { MinimalRegistration } from "@/components/estudiantes/MinimalRegistration";

export default function NuevoEstudiantePage() {
  return (
    <Suspense fallback={<LoadingScreen label="Cargando..." />}>
      <NuevoEstudianteInner />
    </Suspense>
  );
}

function NuevoEstudianteInner() {
  const params = useSearchParams();
  const modo = params.get("modo");
  const doc = params.get("doc");
  const completar = params.get("completar") === "1";
  const desde = params.get("desde");
  const { profile, loading } = useUser();

  if (loading) {
    return <LoadingScreen label="Cargando..." />;
  }

  if (!profile) {
    return (
      <RestrictedAccess message="Debe iniciar sesión para registrar estudiantes." />
    );
  }

  if (!can(profile.role, "estudiantes.registro")) {
    return (
      <RestrictedAccess message="Su rol no tiene permisos para registrar estudiantes." />
    );
  }

  if (modo === "minimo") {
    return <MinimalRegistration desde={desde} />;
  }

  return (
    <StudentWizard
      profile={{
        user_id: profile.user_id,
        role: profile.role,
        institution_id: profile.institution_id,
      }}
      initialDoc={doc}
      completar={completar}
      desde={desde}
    />
  );
}
