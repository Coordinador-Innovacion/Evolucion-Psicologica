"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { CaseCreateForm } from "@/components/casos/CaseCreateForm";
import { PageHeader } from "@/components/ui/page-header";
import { RestrictedAccess } from "@/components/ui/feedback";

/**
 * CAS-02 — Crear Caso desde `/casos/nuevo` (selector de estudiante con búsqueda).
 * El alta definitiva ocurre en create_case / create_referral_with_case (054).
 */
export default function NuevoCasoPage() {
  const router = useRouter();
  const { profile, loading } = useUser();
  const role = profile?.role ?? null;

  if (loading) {
    return null;
  }

  if (!profile || !can(role, "casos.gestionar")) {
    return (
      <RestrictedAccess message="No tienes permiso para crear casos." />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Nuevo caso"
        subtitle="Estudiante con período activo, situación y responsable"
        breadcrumbs={[
          { label: "Casos", href: "/casos" },
          { label: "Nuevo caso" },
        ]}
      />

      <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
        <CaseCreateForm
          currentUserId={profile.user_id}
          isPsychologist={role === "psicologo"}
          onCreated={(caseId) => router.push(`/casos/${caseId}?nueva=1`)}
          onCancel={() => router.push("/casos")}
        />
      </div>
    </div>
  );
}
