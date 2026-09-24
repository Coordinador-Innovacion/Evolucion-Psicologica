"use client";

import { useExpiringLicenses } from "@/hooks/useExpiringLicenses";

export function ExpiringLicensesPanel() {
  const { licenses, loading, error } = useExpiringLicenses();

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <p className="text-sm text-slate-500">Cargando licencias...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <p className="text-sm text-rose-600">{error}</p>
      </div>
    );
  }

  if (licenses.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        Licencias con alerta ({licenses.length})
      </h3>
      <div className="space-y-2">
        {licenses.map((lic) => (
          <div
            key={lic.license_id}
            className={`p-3 rounded-md text-sm ${
              lic.days_remaining < 0
                ? "bg-rose-50 border border-rose-200 text-rose-800"
                : "bg-amber-50 border border-amber-200 text-amber-800"
            }`}
          >
            <div className="font-medium">{lic.institution_name}</div>
            <div className="mt-1">{lic.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
