"use client";

import { useUser } from "@/hooks/useUser";
import {
  useStudentDocuments,
  type StudentDocument,
} from "@/hooks/useStudentDocuments";
import { DocumentUploader } from "./DocumentUploader";
import { DocumentList } from "./DocumentList";

/** Roles con acceso a documentos (mismo conjunto que upload_document en servidor). */
export const DOCUMENT_ROLES = [
  "global",
  "director",
  "admin_ie",
  "coordinador",
  "psicologo",
] as const;

interface Props {
  studentId: string;
}

export function canAccessDocuments(role: string | null | undefined): boolean {
  return (
    role !== null &&
    role !== undefined &&
    (DOCUMENT_ROLES as readonly string[]).includes(role)
  );
}

export function StudentDocumentsPanel({ studentId }: Props) {
  const { profile, loading: profileLoading } = useUser();
  const authorized = canAccessDocuments(profile?.role);
  const {
    documents,
    loading,
    error,
    refresh,
    download,
    remove,
  } = useStudentDocuments(authorized ? studentId : null);

  if (profileLoading) {
    return <p className="text-sm text-slate-500">Cargando documentos...</p>;
  }

  if (!authorized) {
    return (
      <p className="text-sm text-slate-500">
        Su rol no tiene acceso a los documentos del estudiante.
      </p>
    );
  }

  const handleDownload = async (doc: StudentDocument) => {
    const url = await download(doc.id);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleRemove = async (doc: StudentDocument) => {
    if (confirm(`Eliminar el documento "${doc.filename}"?`)) {
      await remove(doc.id);
    }
  };

  const isGlobal = profile?.role === "global";

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">
          Adjuntar documento
        </h3>
        <DocumentUploader studentId={studentId} onUploaded={refresh} />
      </div>

      <DocumentList
        documents={documents}
        loading={loading}
        error={error}
        canDelete={isGlobal}
        onDownload={handleDownload}
        onRemove={handleRemove}
      />

      {!isGlobal && (
        <p className="text-xs text-slate-400">
          La eliminación de documentos corresponde al rol Global.
        </p>
      )}
    </div>
  );
}
