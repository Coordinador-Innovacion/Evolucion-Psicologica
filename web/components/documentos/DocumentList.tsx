"use client";

import type { StudentDocument } from "@/hooks/useStudentDocuments";

interface Props {
  documents: StudentDocument[];
  loading: boolean;
  error: string | null;
  canDelete: boolean;
  onDownload: (doc: StudentDocument) => void;
  onRemove: (doc: StudentDocument) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "\ud83d\uddbc";
  if (mimeType === "application/pdf") return "\ud83d\udcc4";
  if (mimeType.includes("word") || mimeType.includes("document")) return "\ud83d\udcc3";
  if (mimeType.includes("excel") || mimeType.includes("sheet")) return "\ud83d\udcca";
  return "\ud83d\udcc1";
}

export function DocumentList({
  documents,
  loading,
  error,
  canDelete,
  onDownload,
  onRemove,
}: Props) {
  if (loading) {
    return <p className="text-sm text-slate-500">Cargando documentos...</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  if (documents.length === 0) {
    return <p className="text-sm text-slate-500">No hay documentos adjuntos.</p>;
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between p-3 bg-slate-50 rounded-md border border-slate-200"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg">{getFileIcon(doc.mime_type)}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {doc.filename}
              </p>
              <p className="text-xs text-slate-500">
                {formatSize(doc.size_bytes)} &middot;{" "}
                {new Date(doc.created_at).toLocaleDateString("es-PE")}
                {doc.description && ` \u2014 ${doc.description}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onDownload(doc)}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Descargar
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => onRemove(doc)}
                className="text-sm text-rose-600 hover:text-rose-800"
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
