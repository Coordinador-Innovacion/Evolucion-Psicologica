"use client";

import { useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { useInstitutions } from "@/hooks/useInstitutions";
import { LicenseAlert } from "@/components/licencias/LicenseAlert";
import { ExpiringLicensesPanel } from "@/components/licencias/ExpiringLicensesPanel";
import { PromotionWizard } from "@/components/promocion/PromotionWizard";
import { Card, selectClasses } from "@/components/ui/field";
import { ErrorBanner, LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";
import { Icon, type IconName } from "@/components/ui/icons";

const COORD_ROLES = ["global", "director", "admin_ie", "coordinador"] as const;

function isCoordRole(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && (COORD_ROLES as readonly string[]).includes(role);
}

const QUICK_LINKS: { href: string; label: string; desc: string; icon: IconName }[] = [
  {
    href: "/encuestas",
    label: "Encuestas",
    desc: "Crear, versionar y aplicar encuestas institucionales",
    icon: "clipboard",
  },
  {
    href: "/casos",
    label: "Casos",
    desc: "Consulta de casos y atenciones de la institución",
    icon: "folder",
  },
  {
    href: "/analitica",
    label: "Analítica",
    desc: "Conteos operativos sin contenido clínico",
    icon: "chart",
  },
  {
    href: "/instituciones",
    label: "Instituciones",
    desc: "Crear, editar y eliminar instituciones educativas",
    icon: "building",
  },
  {
    href: "/personal",
    label: "Personal",
    desc: "Registrar personal y gestionar roles por I.E.",
    icon: "users",
  },
];

export default function CoordinadorPage() {
  const { profile, loading } = useUser();
  const [showPromotion, setShowPromotion] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");

  const isGlobalUser = profile?.role === "global";
  const { institutions, loading: institutionsLoading } = useInstitutions(
    isGlobalUser === true
  );

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile || !isCoordRole(profile.role)) {
    return (
      <RestrictedAccess message="Esta sección está disponible para roles de gestión institucional." />
    );
  }

  const isGlobal = profile.role === "global";
  const institutionId =
    profile.institution_id ??
    (isGlobal && selectedInstitutionId ? selectedInstitutionId : null);
  const quickLinks = QUICK_LINKS.filter(
    (link) => link.href !== "/instituciones" && link.href !== "/personal"
  ).concat(
    QUICK_LINKS.filter(
      (link) =>
        (link.href === "/instituciones" || link.href === "/personal") &&
        isGlobal
    )
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Coordinación</h1>
        <p className="mt-1 text-sm text-slate-500">
          Estado institucional, promoción y accesos operativos.
        </p>
      </div>

      {isGlobal && (
        <Card className="p-5">
          <label
            htmlFor="coord-institution"
            className="block text-sm font-medium text-slate-700"
          >
            Institución educativa
          </label>
          <select
            id="coord-institution"
            value={selectedInstitutionId}
            onChange={(e) => {
              setSelectedInstitutionId(e.target.value);
              setActionError(null);
              setShowPromotion(false);
            }}
            disabled={institutionsLoading}
            className={`mt-1.5 max-w-md ${selectClasses}`}
          >
            <option value="">
              {institutionsLoading
                ? "Cargando instituciones..."
                : "Seleccione una institución"}
            </option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/instituciones"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Icon name="building" className="h-3.5 w-3.5" />
              Instituciones
            </Link>
            <Link
              href="/personal"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Icon name="users" className="h-3.5 w-3.5" />
              Personal
            </Link>
          </div>

          {!institutionsLoading && institutions.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              No hay instituciones creadas.{" "}
              <Link
                href="/instituciones"
                className="text-indigo-600 hover:text-indigo-500"
              >
                Crear institución
              </Link>
            </p>
          )}
        </Card>
      )}

      {isGlobal && <ExpiringLicensesPanel />}

      {institutionId ? (
        <LicenseAlert institutionId={institutionId} />
      ) : isGlobal ? (
        <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
          Seleccione una institución para ver su licencia y usar promoción.
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
          Sin institución asignada. Algunas acciones no están disponibles.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((link, index) => {
          const tones = [
            "bg-indigo-100 text-indigo-600",
            "bg-emerald-100 text-emerald-600",
            "bg-amber-100 text-amber-600",
            "bg-sky-100 text-sky-600",
            "bg-violet-100 text-violet-600",
          ];
          return (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-start gap-4 rounded-xl border border-line bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-pop"
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  tones[index % tones.length]
                }`}
              >
                <Icon name={link.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                  {link.label}
                  <Icon
                    name="chevronRight"
                    className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                  />
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {link.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      {institutionId && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Promoción masiva
            </h2>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setShowPromotion((v) => !v);
              }}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              {showPromotion ? "Ocultar" : "Abrir"}
            </button>
          </div>

          {actionError && (
            <ErrorBanner className="mb-3">{actionError}</ErrorBanner>
          )}

          {showPromotion && (
            <PromotionWizard
              institutionId={institutionId}
              onComplete={() => {
                setShowPromotion(false);
                setActionError(null);
              }}
            />
          )}

          {!showPromotion && (
            <p className="text-xs text-slate-500">
              Wizard con origen/destino editables, previsualización,
              idempotencia y reanudación.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
