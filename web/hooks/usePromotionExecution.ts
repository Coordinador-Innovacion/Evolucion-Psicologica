"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface ExecutionResult {
  batch_id: string;
  status: string;
  total: number;
  processed: number;
  egreso: number;
  errors: number;
  already_processed: number;
  idempotent?: boolean;
}

interface PrepareResult {
  batch_id: string;
  status: string;
  total_students?: number;
  promoted?: number;
  egreso?: number;
  retired?: number;
  idempotent?: boolean;
}

interface UsePromotionExecutionResult {
  result: ExecutionResult | null;
  loading: boolean;
  error: string | null;
  prepare: (
    institutionId: string,
    originYear: number,
    destinationYear: number,
    idempotencyKey: string
  ) => Promise<PrepareResult | null>;
  execute: (
    institutionId: string,
    originYear: number,
    destinationYear: number,
    idempotencyKey: string
  ) => Promise<ExecutionResult | null>;
}

export function usePromotionExecution(): UsePromotionExecutionResult {
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback(async (
    institutionId: string,
    originYear: number,
    destinationYear: number,
    idempotencyKey: string
  ): Promise<PrepareResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("prepare_promotion", {
        p_institution_id: institutionId,
        p_origin_year: originYear,
        p_destination_year: destinationYear,
        p_idempotency_key: idempotencyKey,
      });

      if (rpcError) throw rpcError;

      if (data?.success) {
        return data;
      }
      setError(data?.error || "Error al preparar promoción");
      return null;
    } catch (err) {
      logClientError("usePromotionExecution.prepare", err);
      setError(toUserMessage(err, "Error al preparar promoción"));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const execute = useCallback(async (
    institutionId: string,
    originYear: number,
    destinationYear: number,
    idempotencyKey: string
  ): Promise<ExecutionResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("execute_promotion", {
        p_institution_id: institutionId,
        p_origin_year: originYear,
        p_destination_year: destinationYear,
        p_idempotency_key: idempotencyKey,
      });

      if (rpcError) throw rpcError;

      if (data?.success) {
        setResult(data);
        return data;
      } else {
        setError(data?.error || "Error al ejecutar promoción");
        return null;
      }
    } catch (err) {
      logClientError("usePromotionExecution.execute", err);
      setError(toUserMessage(err, "Error al ejecutar promoción"));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, prepare, execute };
}
