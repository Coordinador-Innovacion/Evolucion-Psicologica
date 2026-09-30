"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";

export function LicenseBanner({
  institutionId,
}: {
  institutionId: string | null;
}) {
  const { license, loading } = useLicenseStatus(institutionId);
  const [dismissed, setDismissed] = useState(false);

  if (loading || !institutionId || !license) return null;

  if (license.status === "expired") {
    return (
      <div
        role="alert"
        className="flex items-center justify-center gap-2 bg-rose-600 px-4 py-1.5 text-center text-xs font-semibold text-white"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Licencia vencida: las nuevas atenciones psicológicas están bloqueadas
      </div>
    );
  }

  if (license.status === "expiring_soon" && !dismissed) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-amber-950"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Tu licencia vence en {license.days_remaining ?? "?"} días
        <button
          type="button"
          aria-label="Ocultar aviso de licencia"
          onClick={() => setDismissed(true)}
          className="ml-2 rounded p-0.5 transition hover:bg-amber-600/30"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
