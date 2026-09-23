"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

export type LicenseStatus = "active" | "expiring_soon" | "expired" | "scheduled" | "none";

interface LicenseInfo {
  has_license: boolean;
  status: LicenseStatus;
  license_id?: string;
  start_date?: string;
  end_date?: string;
  days_remaining?: number;
  message: string;
}

interface UseLicenseStatusResult {
  license: LicenseInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLicenseStatus(institutionId: string | null): UseLicenseStatusResult {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const refresh = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!institutionId) {
        setLicense(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc("get_license_status", {
          p_institution_id: institutionId,
        });

        if (cancelled) return;

        if (rpcError) throw rpcError;

        if (data?.success) {
          setLicense({
            has_license: data.has_license,
            status: data.status,
            license_id: data.license_id,
            start_date: data.start_date,
            end_date: data.end_date,
            days_remaining: data.days_remaining,
            message: data.message,
          });
        } else {
          setError("No se pudo obtener el estado de licencia");
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("useLicenseStatus.load", err);
          setError(toUserMessage(err, "Error al consultar licencia"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [institutionId, reloadVersion]);

  return { license, loading, error, refresh };
}
