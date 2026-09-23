"use client";

import { useLicenseStatus, type LicenseStatus } from "@/hooks/useLicenseStatus";

interface Props {
  institutionId: string | null;
}

const STYLES: Record<LicenseStatus, string> = {
  active: "",
  expiring_soon: "bg-amber-50 border border-amber-200 text-amber-800",
  expired: "bg-red-50 border border-red-200 text-red-800",
  scheduled: "bg-blue-50 border border-blue-200 text-blue-800",
  none: "bg-gray-50 border border-gray-200 text-gray-600",
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
