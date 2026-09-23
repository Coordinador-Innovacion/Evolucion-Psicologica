"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface WizardData {
  origin_year: number;
  destination_year: number;
  niveles: Array<{ id: string; name: string; order_number: number }>;
  grados: Array<{
    id: string;
    name: string;
    order_number: number;
    nivel_id: string;
    nivel_name: string;
  }>;
  existing_batch_id: string | null;
  existing_batch_status: string | null;
  existing_batch_counts: Record<string, number> | null;
}

interface UsePromotionWizardResult {
  data: WizardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePromotionWizard(institutionId: string | null): UsePromotionWizardResult {
  const [data, setData] = useState<WizardData | null>(null);
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
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();
        const { data: result, error: rpcError } = await supabase.rpc(
          "get_promotion_wizard",
          { p_institution_id: institutionId }
        );

        if (cancelled) return;

        if (rpcError) throw rpcError;

        if (result?.success) {
          setData(result);
        } else {
          setError(result?.error || "No se pudieron obtener datos del wizard");
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("usePromotionWizard.load", err);
          setError(toUserMessage(err, "Error al cargar wizard"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [institutionId, reloadVersion]);

  return { data, loading, error, refresh };
}
