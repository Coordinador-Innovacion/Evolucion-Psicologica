"use client";

import { useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { LicenseAlert } from "@/components/licencias/LicenseAlert";
import { PromotionWizard } from "@/components/promocion/PromotionWizard";

const COORD_ROLES = ["global", "director", "admin_ie", "coordinador"] as const;

function isCoordRole(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && (COORD_ROLES as readonly string[]).includes(role);
}

export default function CoordinadorPage() {
  const { profile, loading } = useUser();
  const [showPromotion, setShowPromotion] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (!profile || !isCoordRole(profile.role)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Acceso restringido
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Esta sección está disponible para roles de gestión institucional.
            </p>
            <Link
              href="/"
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const institutionId = profile.institution_id;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Inicio
              </Link>
              <span className="text-sm text-gray-300">|</span>
              <span className="text-sm font-medium text-gray-900">
                Coordinación
              </span>
            </div>
            <div className="flex items-center space-x-4 text-sm">
              <Link
                href="/encuestas"
                className="text-gray-600 hover:text-gray-900"
              >
                Encuestas
              </Link>
              <Link
                href="/casos"
                className="text-gray-600 hover:text-gray-900"
              >
                Casos
              </Link>
              <Link
                href="/analitica"
                className="text-gray-600 hover:text-gray-900"
              >
                Analítica
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Coordinación</h1>
          <p className="mt-1 text-sm text-gray-500">
            Estado institucional, promoción y accesos operativos.
          </p>
        </div>

        {institutionId ? (
          <LicenseAlert institutionId={institutionId} />
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-600">
            Sin institución asignada. Algunas acciones no están disponibles.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/encuestas"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-blue-300 transition-colors"
          >
            <div className="text-sm font-medium text-gray-900">Encuestas</div>
            <div className="mt-1 text-xs text-gray-500">
              Crear, versionar y aplicar encuestas institucionales
            </div>
          </Link>
          <Link
            href="/casos"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-blue-300 transition-colors"
          >
            <div className="text-sm font-medium text-gray-900">Casos</div>
            <div className="mt-1 text-xs text-gray-500">
              Consulta de casos y atenciones de la institución
            </div>
          </Link>
          <Link
            href="/analitica"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-blue-300 transition-colors"
          >
            <div className="text-sm font-medium text-gray-900">Analítica</div>
            <div className="mt-1 text-xs text-gray-500">
              Conteos operativos sin contenido clínico
            </div>
          </Link>
        </div>

        {institutionId && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Promoción masiva
              </h2>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setShowPromotion((v) => !v);
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showPromotion ? "Ocultar" : "Abrir"}
              </button>
            </div>

            {actionError && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                {actionError}
              </div>
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
              <p className="text-xs text-gray-500">
                Wizard con origen/destino editables, previsualización,
                idempotencia y reanudación.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
