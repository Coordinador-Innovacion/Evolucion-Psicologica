"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

interface UploadResult {
  document_id: string;
  message: string;
}

interface UseDocumentUploadResult {
  uploading: boolean;
  error: string | null;
  upload: (
    studentId: string,
    file: File,
    description?: string
  ) => Promise<UploadResult | null>;
}

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/rtf",
]);

const MAX_SIZE = 50 * 1024 * 1024; // 50 MiB

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 200);
}

export function useDocumentUpload(): UseDocumentUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (
    studentId: string,
    file: File,
    description?: string
  ): Promise<UploadResult | null> => {
    setUploading(true);
    setError(null);

    try {
      // Validar tipo
      if (!ALLOWED_TYPES.has(file.type)) {
        throw new Error("Tipo de archivo no permitido");
      }

      // Validar tamaño
      if (file.size > MAX_SIZE) {
        throw new Error("El archivo excede el límite de 50 MiB");
      }

      const supabase = createClient();

      // Obtener perfil (institución + rol)
      const { data: profile } = await supabase
        .from("perfiles")
        .select("institution_id, role")
        .single();

      if (!profile) {
        throw new Error("Perfil de usuario no encontrado");
      }

      let institutionId = profile.institution_id;

      if (!institutionId) {
        // Global sin institución asignada: derivar la institución del estudiante
        if (profile.role !== "global") {
          throw new Error("Sin institución asignada");
        }
        const { data: periodo } = await supabase
          .from("periodos_escolares")
          .select("institution_id")
          .eq("student_id", studentId)
          .limit(1)
          .maybeSingle();
        institutionId = periodo?.institution_id ?? null;
      }

      if (!institutionId) {
        throw new Error("No se pudo determinar la institución del estudiante");
      }

      // Construir path: {institution_id}/{student_id}/{filename}
      // Estructura validada server-side en upload_document
      const safeFilename = sanitizeFilename(file.name);
      const storagePath = `${institutionId}/${studentId}/${safeFilename}`;

      // Subir a Storage
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Registrar metadatos en la tabla documentos
      const { data, error: rpcError } = await supabase.rpc("upload_document", {
        p_student_id: studentId,
        p_filename: file.name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
        p_storage_path: storagePath,
        p_description: description || null,
      });

      if (rpcError) throw rpcError;

      if (!data?.success) {
        // Si falla el registro, eliminar de Storage
        await supabase.storage.from("documentos").remove([storagePath]);
        throw new Error(data?.error || "Error al registrar documento");
      }

      return data;
    } catch (err) {
      logClientError("useDocumentUpload.upload", err);
      setError(toUserMessage(err, "Error al subir documento"));
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, error, upload };
}
