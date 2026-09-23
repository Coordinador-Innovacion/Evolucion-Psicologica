"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface AttentionEditState {
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  remainingMinutes: number;
}

export function useAttentionEdit() {
  const [state, setState] = useState<AttentionEditState>({
    loading: false,
    error: null,
    canEdit: true,
    remainingMinutes: 30,
  });

  const checkEditWindow = useCallback((createdAt: string): boolean => {
    const created = new Date(createdAt);
    const now = new Date();
    const elapsedMs = now.getTime() - created.getTime();
    const elapsedMinutes = elapsedMs / (1000 * 60);
    const remaining = Math.max(0, 30 - elapsedMinutes);

    setState((s) => ({
      ...s,
      canEdit: remaining > 0,
      remainingMinutes: Math.round(remaining * 10) / 10,
    }));

    return remaining > 0;
  }, []);

  const updateAttention = useCallback(
    async (
      attentionId: string,
      fields: {
        motivo?: string;
        que_se_hizo?: string;
        observaciones?: string;
        compromisos?: string;
        proxima_atencion?: string;
      }
    ): Promise<boolean> => {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("update_attention", {
          p_attention_id: attentionId,
          p_motivo: fields.motivo ?? null,
          p_que_se_hizo: fields.que_se_hizo ?? null,
          p_observaciones: fields.observaciones ?? null,
          p_compromisos: fields.compromisos ?? null,
          p_proxima_atencion: fields.proxima_atencion ?? null,
        });

        if (error) throw error;

        if (!data?.success) {
          setState((s) => ({
            ...s,
            loading: false,
            error: data?.error || "Error al actualizar atención",
          }));
          return false;
        }

        setState((s) => ({ ...s, loading: false, error: null }));
        return true;
      } catch (err) {
        logClientError("useAttentionEdit.update", err);
        setState((s) => ({ ...s, loading: false, error: toUserMessage(err, "Error al actualizar atención") }));
        return false;
      }
    },
    []
  );

  return {
    ...state,
    checkEditWindow,
    updateAttention,
  };
}
