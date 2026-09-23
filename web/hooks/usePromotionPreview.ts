"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface StudentPreview {
  student_id: string;
  first_names: string;
  last_names: string;
  document_number: string;
  current_grado: string;
  current_nivel: string;
  section: string;
  is_egreso: boolean;
  next_grado_id: string | null;
  next_grado_name: string | null;
  next_nivel_id: string | null;
  next_nivel_name: string | null;
}

interface PreviewResult {
  origin_year: number;
  destination_year: number;
  total_students: number;
  promoted: number;
  egreso: number;
  retired: number;
  students: StudentPreview[];
}

interface UsePromotionPreviewResult {
  preview: PreviewResult | null;
  loading: boolean;
  error: string | null;
  fetchPreview: (institutionId: string, originYear: number, destinationYear: number) => Promise<void>;
}

export function usePromotionPreview(): UsePromotionPreviewResult {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async (
    institutionId: string,
    originYear: number,
    destinationYear: number
  ) => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("preview_promotion", {
        p_institution_id: institutionId,
        p_origin_year: originYear,
        p_destination_year: destinationYear,
      });

      if (rpcError) throw rpcError;

      if (data?.success) {
        setPreview(data);
      } else {
        setError(data?.error || "No se pudo generar el preview");
      }
    } catch (err) {
      logClientError("usePromotionPreview.fetch", err);
      setError(toUserMessage(err, "Error al generar preview"));
    } finally {
      setLoading(false);
    }
  }, []);

  return { preview, loading, error, fetchPreview };
}
