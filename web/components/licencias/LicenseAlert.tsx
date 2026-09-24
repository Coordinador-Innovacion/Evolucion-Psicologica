"use client";

import { useLicenseStatus, type LicenseStatus } from "@/hooks/useLicenseStatus";

interface Props {
  institutionId: string | null;
}

const STYLES: Record<LicenseStatus, string> = {
  active: "",
  expiring_soon: "bg-amber-50 border border-amber-200 text-amber-800",
  expired: "bg-rose-50 border border-rose-200 text-rose-800",
  scheduled: "bg-indigo-50 border border-indigo-200 text-indigo-800",
  none: "bg-slate-50 border border-slate-200 text-slate-600",
};

const ICONS: Record<LicenseStatus, string> = {
  active: "",
  expiring_soon: "\u26a0",
  expired: "\u2716",
  scheduled: "\u23f3",
  none: "\u2014",
};

export function LicenseAlert({ institutionId }: Props) {
  const { license, loading } = useLicenseStatus(institutionId);

  if (loading || !license || license.status === "active") {
    return null;
  }

  return (
    <div className={`rounded-md p-3 text-sm ${STYLES[license.status]}`}>
      <span className="mr-2">{ICONS[license.status]}</span>
      {license.message}
    </div>
  );
}
