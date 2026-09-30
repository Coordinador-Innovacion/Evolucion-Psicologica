"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApplicationWizard } from "@/components/encuestas/aplicaciones/ApplicationWizard";
import { buttonClass } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/feedback";

function WizardSearchParams() {
  const searchParams = useSearchParams();
  const survey = searchParams.get("survey") ?? undefined;
  return <ApplicationWizard initialSurveyId={survey} />;
}

export default function NuevaAplicacionPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            <Link href="/encuestas/aplicaciones" className="hover:text-slate-600">
              Aplicaciones
            </Link>{" "}
            / Nueva
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            Nueva aplicación
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Crea una aplicación por respondiente con enlace propio.
          </p>
        </div>
        <Link
          href="/encuestas/aplicaciones"
          className={buttonClass("secondary", "md")}
        >
          Volver
        </Link>
      </div>

      <Suspense fallback={<LoadingScreen label="Cargando..." />}>
        <WizardSearchParams />
      </Suspense>
    </div>
  );
}
