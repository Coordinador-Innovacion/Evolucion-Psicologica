"use client";

import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { InstitutionCreateWizard } from "../page";

export default function NuevaInstitucionPage() {
  const { profile, loading } = useUser();

  if (loading) return <LoadingScreen />;

  if (!profile || profile.role !== "global") {
    return (
      <RestrictedAccess message="Solo el rol Global puede administrar instituciones." />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nueva institución"
        subtitle="Asistente de 3 pasos: datos, licencia y revisión."
        breadcrumbs={[
          { label: "Instituciones", href: "/instituciones" },
          { label: "Nueva" },
        ]}
        actions={null}
      />
      <InstitutionCreateWizard />
    </div>
  );
}
