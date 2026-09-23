"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEncuestas } from "@/hooks/useEncuestas";
import { logClientError, toUserMessage } from "@/lib/errors";

export default function EncuestasPage() {
  const router = useRouter();
  const { surveys, loading, createSurvey, copySurvey } = useEncuestas();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const id = await createSurvey(newTitle.trim(), newDesc.trim() || null);
      router.push(`/encuestas/${id}/constructor`);
    } catch (err) {
      logClientError("encuestas.create", err);
      setError(toUserMessage(err, "Error al crear encuesta"));
      setCreating(false);
    }
  };

  const handleCopy = async (sourceId: string, sourceTitle: string) => {
    const newTitle = prompt(
      `Copiar "${sourceTitle}". Nuevo título:`,
      `${sourceTitle} (copia)`
    );
    if (!newTitle) return;
    try {
      const id = await copySurvey(sourceId, newTitle);
      router.push(`/encuestas/${id}/constructor`);
    } catch (err) {
      logClientError("encuestas.copy", err);
      alert(toUserMessage(err, "Error al copiar"));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Encuestas</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona las encuestas institucionales
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Nueva encuesta
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Crear encuesta
            </h2>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Título *
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Título de la encuesta"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Descripción
                  </label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Descripción opcional"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setNewTitle("");
                    setNewDesc("");
                    setError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : surveys.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No hay encuestas creadas aún.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 text-blue-600 hover:text-blue-500 text-sm font-medium"
          >
            Crear primera encuesta
          </button>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg divide-y">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/encuestas/${survey.id}/constructor`}
                  className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                >
                  {survey.title}
                </Link>
                {survey.description && (
                  <p className="mt-1 text-sm text-gray-500 truncate">
                    {survey.description}
                  </p>
                )}
                <div className="mt-1 flex items-center space-x-4 text-xs text-gray-400">
                  <span>
                    {survey.version_count}{" "}
                    {survey.version_count === 1 ? "versión" : "versiones"}
                  </span>
                  <span>
                    {survey.published_versions}{" "}
                    {survey.published_versions === 1
                      ? "publicada"
                      : "publicadas"}
                  </span>
                  <span>
                    {new Date(survey.created_at).toLocaleDateString("es-PE")}
                  </span>
                </div>
              </div>
              <div className="ml-4 flex items-center space-x-2">
                <button
                  onClick={() => handleCopy(survey.id, survey.title)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:border-gray-300"
                >
                  Copiar
                </button>
                <Link
                  href={`/encuestas/${survey.id}/versiones`}
                  className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-200 hover:border-gray-300"
                >
                  Versiones
                </Link>
                <Link
                  href={`/encuestas/${survey.id}/constructor`}
                  className="text-xs text-blue-600 hover:text-blue-500 px-2 py-1 rounded border border-blue-200 hover:border-blue-300"
                >
                  Abrir
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
