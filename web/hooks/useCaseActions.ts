"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface CaseState {
  loading: boolean;
  error: string | null;
}

export function useCaseActions() {
  const [state, setState] = useState<CaseState>({
    loading: false,
    error: null,
  });

  const closeCase = useCallback(
    async (caseId: string, reason: string): Promise<boolean> => {
      setState({ loading: true, error: null });

      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("close_case", {
          p_case_id: caseId,
          p_close_reason: reason,
        });

        if (error) throw error;

        if (!data?.success) {
          setState({ loading: false, error: data?.error || "Error al cerrar caso" });
          return false;
        }

        setState({ loading: false, error: null });
        return true;
      } catch (err) {
        logClientError("useCaseActions.closeCase", err);
        setState({ loading: false, error: toUserMessage(err, "Error al cerrar caso") });
        return false;
      }
    },
    []
  );

  const reopenCase = useCallback(
    async (caseId: string, reason: string): Promise<boolean> => {
      setState({ loading: true, error: null });

      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("reopen_case", {
          p_case_id: caseId,
          p_reopen_reason: reason,
        });

        if (error) throw error;

        if (!data?.success) {
          setState({ loading: false, error: data?.error || "Error al reabrir caso" });
          return false;
        }

        setState({ loading: false, error: null });
        return true;
      } catch (err) {
        logClientError("useCaseActions.reopenCase", err);
        setState({ loading: false, error: toUserMessage(err, "Error al reabrir caso") });
        return false;
      }
    },
    []
  );

  return {
    ...state,
    closeCase,
    reopenCase,
  };
}
