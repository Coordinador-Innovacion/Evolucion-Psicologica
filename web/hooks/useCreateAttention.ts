"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface AttentionInput {
  motivo: string;
  queSeHizo: string;
  observaciones?: string;
  compromisos?: string;
  proximaAtencion?: string;
  origen?: string;
}

interface CreateAttentionState {
  loading: boolean;
  error: string | null;
}

export function useCreateAttention() {
  const [state, setState] = useState<CreateAttentionState>({
    loading: false,
    error: null,
  });

  const createAttention = useCallback(
    async (
      caseId: string,
      input: AttentionInput
    ): Promise<{ ok: boolean; licenseWarning?: string } | null> => {
      setState({ loading: true, error: null });

      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("create_attention", {
          p_caso_id: caseId,
          p_motivo: input.motivo,
          p_que_se_hizo: input.queSeHizo,
          p_observaciones: input.observaciones || null,
          p_compromisos: input.compromisos || null,
          p_proxima_atencion: input.proximaAtencion
            ? new Date(input.proximaAtencion).toISOString()
            : null,
          p_origen: input.origen || null,
        });

        if (error) throw error;

        if (!data?.success) {
          setState({ loading: false, error: data?.error || "Error al crear atención" });
          return null;
        }

        setState({ loading: false, error: null });
        return {
          ok: true,
          licenseWarning: data?.license_warning || undefined,
        };
      } catch (err) {
        logClientError("useCreateAttention.create", err);
        setState({ loading: false, error: toUserMessage(err, "Error al crear atención") });
        return null;
      }
    },
    []
  );

  return {
    ...state,
    createAttention,
  };
}
