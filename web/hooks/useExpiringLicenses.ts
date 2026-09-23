"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface ExpiringLicense {
  license_id: string;
  institution_id: string;
  institution_name: string;
  end_date: string;
  days_remaining: number;
  message: string;
}

interface UseExpiringLicensesResult {
  licenses: ExpiringLicense[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useExpiringLicenses(): UseExpiringLicensesResult {
  const [licenses, setLicenses] = useState<ExpiringLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const refresh = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc("get_expiring_licenses");

        if (cancelled) return;

        if (rpcError) throw rpcError;

        if (data?.success) {
          setLicenses(data.data ?? []);
        } else {
          setError("No se pudieron obtener las licencias próximas a vencer");
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("useExpiringLicenses.load", err);
          setError(toUserMessage(err, "Error al consultar licencias"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadVersion]);

  return { licenses, loading, error, refresh };
}
