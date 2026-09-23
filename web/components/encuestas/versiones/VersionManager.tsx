"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEncuestas } from "@/hooks/useEncuestas";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { SurveyVersionItem } from "@/types/encuestas";

interface Props {
  surveyId: string;
  surveyTitle: string;
}

export function VersionManager({ surveyId, surveyTitle }: Props) {
  const router = useRouter();
  const { getSurveyVersions, publishVersion, createNewVersion } =
    useEncuestas();
  const [versions, setVersions] = useState<SurveyVersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getSurveyVersions(surveyId);
        if (!cancelled) setVersions(data);
      } catch (err) {
        if (!cancelled) {
          logClientError("VersionManager.load", err);
          setError(toUserMessage(err, "Error al cargar versiones"));
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [surveyId, getSurveyVersions]);

  const handlePublish = async (versionId: string) => {
    if (
      !confirm(
        "¿Publicar esta versión? Una vez publicada, no podrá ser modificada."
      )
    ) {
      return;
    }
    setPublishing(versionId);
    setError(null);
    try {
      await publishVersion(versionId);
      const data = await getSurveyVersions(surveyId);
      setVersions(data);
    } catch (err) {
      logClientError("VersionManager.publish", err);
      setError(toUserMessage(err, "Error al publicar versión"));
    }
    setPublishing(null);
  };

  const handleCreateNewVersion = async () => {
    if (
      !confirm(
        "Crear una nueva versión borrador. Podrá editar la nueva versión sin afectar las publicadas."
      )
    ) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await createNewVersion(surveyId);
      if (result.id) {
        router.push(`/encuestas/${surveyId}/constructor`);
      }
    } catch (err) {
      logClientError("VersionManager.createNewVersion", err);
      setError(toUserMessage(err, "Error al crear nueva versión"));
    }
    setCreating(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Borrador
          </span>
        );
      case "published":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Publicada
          </span>
        );
      case "closed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Cerrada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Cargando versiones...
      </div>
    );
  }

  const hasDraft = versions.some((v) => v.status === "draft");
  const latestVersion = versions.length > 0 ? versions[0] : null;

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Versiones de &ldquo;{surveyTitle}&rdquo;
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {versions.length} {versions.length === 1 ? "versión" : "versiones"}{" "}
            registradas
          </p>
        </div>
        <div className="flex space-x-3">
          <Link
            href={`/encuestas/${surveyId}/aplicaciones`}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Aplicaciones
          </Link>
          {!hasDraft && latestVersion && latestVersion.status === "published" && (
            <button
              onClick={handleCreateNewVersion}
              disabled={creating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creando..." : "Nueva versión"}
            </button>
          )}
          <Link
            href={`/encuestas/${surveyId}/constructor`}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Volver al constructor
          </Link>
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No hay versiones registradas.</p>
          <Link
            href={`/encuestas/${surveyId}/constructor`}
            className="mt-2 text-blue-600 hover:text-blue-500 text-sm"
          >
            Ir al constructor para agregar contenido
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg divide-y">
          {versions.map((version) => (
            <div
              key={version.id}
              className="px-6 py-4 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-900">
                    Versión {version.version_number}
                  </span>
                  {getStatusBadge(version.status)}
                </div>
                <div className="mt-1 flex items-center space-x-4 text-xs text-gray-400">
                  <span>
                    Creada:{" "}
                    {new Date(version.created_at).toLocaleDateString("es-PE")}
                  </span>
                  {version.published_at && (
                    <span>
                      Publicada:{" "}
                      {new Date(version.published_at).toLocaleDateString(
                        "es-PE"
                      )}
                    </span>
                  )}
                  <span>
                    {version.application_count}{" "}
                    {version.application_count === 1
                      ? "aplicación"
                      : "aplicaciones"}
                  </span>
                  <span>
                    {version.response_count}{" "}
                    {version.response_count === 1 ? "respuesta" : "respuestas"}
                  </span>
                </div>
              </div>

              <div className="ml-4 flex items-center space-x-2">
                {version.status === "draft" && (
                  <>
                    <Link
                      href={`/encuestas/${surveyId}/constructor`}
                      className="text-xs text-blue-600 hover:text-blue-500 px-3 py-1.5 rounded border border-blue-200 hover:border-blue-300"
                    >
                      Editar
                    </Link>
                    <Link
                      href={`/encuestas/${surveyId}/preview`}
                      className="text-xs text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded border border-gray-200 hover:border-gray-300"
                    >
                      Vista previa
                    </Link>
                    <button
                      onClick={() => handlePublish(version.id)}
                      disabled={publishing === version.id}
                      className="text-xs text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded disabled:opacity-50"
                    >
                      {publishing === version.id
                        ? "Publicando..."
                        : "Publicar"}
                    </button>
                  </>
                )}
                {version.status === "published" && (
                  <Link
                    href={`/encuestas/${surveyId}/preview?version=${version.id}`}
                    className="text-xs text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded border border-gray-200 hover:border-gray-300"
                  >
                    Ver
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasDraft && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            Existe una versión borrador activa. Edítela en el constructor y
            publíquela cuando esté lista.
          </p>
        </div>
      )}
    </div>
  );
}
