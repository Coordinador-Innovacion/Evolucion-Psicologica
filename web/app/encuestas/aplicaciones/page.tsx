"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApplicationsList } from "@/components/encuestas/aplicaciones/ApplicationsList";
import { Tabs } from "@/components/ui/tabs";
import { buttonClass } from "@/components/ui/button";

export default function AplicacionesIndexPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Encuestas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestiona las encuestas institucionales
          </p>
        </div>
        <Link href="/encuestas/aplicaciones/nueva" className={buttonClass()}>
          Nueva aplicación
        </Link>
      </div>

      <Tabs
        tabs={[
          { id: "encuestas", label: "Encuestas" },
          { id: "aplicaciones", label: "Aplicaciones" },
        ]}
        active="aplicaciones"
        onChange={(id) => {
          if (id === "encuestas") router.push("/encuestas");
        }}
      />

      <ApplicationsList />
    </div>
  );
}
