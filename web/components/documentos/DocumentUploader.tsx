"use client";

import { useRef, useState } from "react";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";

interface Props {
  studentId: string;
  onUploaded?: () => void;
}

export function DocumentUploader({ studentId, onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const { uploading, error, upload } = useDocumentUpload();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await upload(studentId, file, description || undefined);
    if (result) {
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploaded?.();
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Archivo (PDF, imagen, Word, Excel, máx. 50 MiB)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt,.rtf"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
        />
      </div>
      <div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          disabled={uploading}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      {uploading && (
        <p className="text-sm text-indigo-600">Subiendo documento...</p>
      )}
      {error && (
        <p className="text-sm text-rose-600">{error}</p>
      )}
    </div>
  );
}
