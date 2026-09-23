"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

export interface StudentDocument {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  description: string | null;
  uploaded_by: string;
  created_at: string;
}

interface UseStudentDocumentsResult {
  documents: StudentDocument[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  download: (documentId: string) => Promise<string | null>;
  remove: (documentId: string) => Promise<boolean>;
}

export function useStudentDocuments(studentId: string | null): UseStudentDocumentsResult {
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const refresh = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!studentId) {
        setDocuments([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc("list_student_documents", {
          p_student_id: studentId,
        });

        if (cancelled) return;

        if (rpcError) throw rpcError;

        if (data?.success) {
          setDocuments(data.documents ?? []);
        } else {
          setError(data?.error || "No se pudieron listar los documentos");
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("useStudentDocuments.list", err);
          setError(toUserMessage(err, "Error al listar documentos"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, reloadVersion]);

  const download = useCallback(async (documentId: string): Promise<string | null> => {
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("get_document_url", {
        p_document_id: documentId,
      });

      if (rpcError) throw rpcError;

      if (!data?.success) {
        setError(data?.error || "No se pudo obtener la URL");
        return null;
      }

      return data.signed_url;
    } catch (err) {
      logClientError("useStudentDocuments.download", err);
      setError(toUserMessage(err, "Error al descargar"));
      return null;
    }
  }, []);

  const remove = useCallback(async (documentId: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("delete_document", {
        p_document_id: documentId,
      });

      if (rpcError) throw rpcError;

      if (!data?.success) {
        setError(data?.error || "No se pudo eliminar");
        return false;
      }

      refresh();
      return true;
    } catch (err) {
      logClientError("useStudentDocuments.remove", err);
      setError(toUserMessage(err, "Error al eliminar"));
      return false;
    }
  }, [refresh]);

  return { documents, loading, error, refresh, download, remove };
}
