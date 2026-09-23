"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEncuestas } from "@/hooks/useEncuestas";
import { logClientError, toUserMessage } from "@/lib/errors";
import type {
  SurveyApplicationItem,
  SurveyVersionItem,
} from "@/types/encuestas";
import { APPLICATION_STATUS_LABELS } from "@/types/encuestas";

interface Props {
  surveyId: string;
  surveyTitle: string;
}

export function ApplicationManager({ surveyId, surveyTitle }: Props) {
  const {
    getSurveyVersions,
    getApplicationsBySurvey,
    createApplication,
    extendApplication,
  } = useEncuestas();

  const [versions, setVersions] = useState<SurveyVersionItem[]>([]);
  const [applications, setApplications] = useState<SurveyApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [startedAt, setStartedAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [creating, setCreating] = useState(false);

  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [newEndsAt, setNewEndsAt] = useState("");
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [v, a] = await Promise.all([
          getSurveyVersions(surveyId),
          getApplicationsBySurvey(surveyId),
        ]);
        if (!cancelled) {
          setVersions(v);
          setApplications(a);
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("ApplicationManager.load", err);
          setError(toUserMessage(err, "Error al cargar datos"));
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [surveyId, getSurveyVersions, getApplicationsBySurvey]);

  const publishedVersions = versions.filter((v) => v.status === "published");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVersionId || !startedAt || !endsAt) return;
    setCreating(true);
    setError(null);
    try {
      await createApplication({
        version_id: selectedVersionId,
        year,
        started_at: new Date(startedAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
      });
      const a = await getApplicationsBySurvey(surveyId);
      setApplications(a);
      setShowCreate(false);
      setSelectedVersionId("");
      setStartedAt("");
      setEndsAt("");
    } catch (err) {
      logClientError("ApplicationManager.create", err);
      setError(toUserMessage(err, "Error al crear aplicación"));
    }
    setCreating(false);
  };

  const handleExtend = async (appId: string) => {
    if (!newEndsAt) return;
    setExtending(true);
    setError(null);
    try {
      await extendApplication(appId, new Date(newEndsAt).toISOString());
      const a = await getApplicationsBySurvey(surveyId);
      setApplications(a);
      setExtendingId(null);
      setNewEndsAt("");
    } catch (err) {
      logClientError("ApplicationManager.extend", err);
      setError(toUserMessage(err, "Error al ampliar plazo"));
    }
    setExtending(false);
  };

  const getStatusBadge = (status: string) => {
    const base = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case "scheduled":
        return <span className={`${base} bg-blue-100 text-blue-800`}>{APPLICATION_STATUS_LABELS[status]}</span>;
      case "active":
        return <span className={`${base} bg-green-100 text-green-800`}>{APPLICATION_STATUS_LABELS[status]}</span>;
      case "extended":
        return <span className={`${base} bg-yellow-100 text-yellow-800`}>{APPLICATION_STATUS_LABELS[status]}</span>;
      case "completed":
        return <span className={`${base} bg-gray-100 text-gray-800`}>{APPLICATION_STATUS_LABELS[status]}</span>;
      case "expired":
        return <span className={`${base} bg-red-100 text-red-800`}>{APPLICATION_STATUS_LABELS[status]}</span>;
      default:
        return <span className={`${base} bg-gray-100 text-gray-600`}>{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Cargando aplicaciones...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Aplicaciones de &ldquo;{surveyTitle}&rdquo;
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {applications.length}{" "}
            {applications.length === 1 ? "aplicación" : "aplicaciones"}{" "}
            registradas
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowCreate(true)}
            disabled={publishedVersions.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              publishedVersions.length === 0
                ? "No hay versiones publicadas disponibles"
                : ""
            }
          >
            Nueva aplicación
          </button>
          <Link
            href={`/encuestas/${surveyId}/versiones`}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Volver a versiones
          </Link>
        </div>
      </div>

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

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Crear aplicación
            </h3>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Versión publicada *
                  </label>
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Seleccionar versión...</option>
                    {publishedVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Versión {v.version_number} — Publicada{" "}
                        {v.published_at
                          ? new Date(v.published_at).toLocaleDateString("es-PE")
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Año escolar *
                  </label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value))}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Fecha/hora inicio *
                    </label>
                    <input
                      type="datetime-local"
                      value={startedAt}
                      onChange={(e) => setStartedAt(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Fecha/hora fin *
                    </label>
                    <input
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                {startedAt && endsAt && new Date(startedAt) >= new Date(endsAt) && (
                  <p className="text-sm text-red-600">
                    La fecha de inicio debe ser anterior a la fecha de fin.
                  </p>
                )}
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setSelectedVersionId("");
                    setStartedAt("");
                    setEndsAt("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    creating ||
                    !selectedVersionId ||
                    !startedAt ||
                    !endsAt ||
                    new Date(startedAt) >= new Date(endsAt)
                  }
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "Creando..." : "Crear aplicación"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {extendingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Ampliar plazo
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              La nueva fecha de fin debe ser posterior a la fecha actual de fin.
              El avance guardado se conserva.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nueva fecha/hora fin *
              </label>
              <input
                type="datetime-local"
                value={newEndsAt}
                onChange={(e) => setNewEndsAt(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setExtendingId(null);
                  setNewEndsAt("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleExtend(extendingId)}
                disabled={extending || !newEndsAt}
                className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 border border-transparent rounded-md hover:bg-yellow-700 disabled:opacity-50"
              >
                {extending ? "Ampliando..." : "Ampliar plazo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {applications.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">
            No hay aplicaciones creadas para esta encuesta.
          </p>
          {publishedVersions.length === 0 && (
            <p className="mt-2 text-sm text-gray-400">
              Necesita al menos una versión publicada para crear aplicaciones.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg divide-y">
          {applications.map((app) => {
            const version = versions.find((v) => v.id === app.version_id);
            return (
              <div
                key={app.id}
                className="px-6 py-4 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-900">
                      Versión {version?.version_number ?? "?"}
                    </span>
                    {getStatusBadge(app.status)}
                    <span className="text-xs text-gray-400">
                      {app.progress}% avance
                    </span>
                  </div>
                  <div className="mt-1 flex items-center space-x-4 text-xs text-gray-400">
                    <span>Año: {app.year}</span>
                    <span>
                      Inicio:{" "}
                      {new Date(app.started_at).toLocaleString("es-PE")}
                    </span>
                    <span>
                      Fin: {new Date(app.ends_at).toLocaleString("es-PE")}
                    </span>
                    {app.extended_at && (
                      <span className="text-yellow-600">
                        Ampliada:{" "}
                        {new Date(app.extended_at).toLocaleString("es-PE")}
                      </span>
                    )}
                    <span>
                      Creada:{" "}
                      {new Date(app.created_at).toLocaleDateString("es-PE")}
                    </span>
                  </div>
                </div>

                <div className="ml-4 flex items-center space-x-2">
                  {(app.status === "active" ||
                    app.status === "extended" ||
                    app.status === "expired") && (
                    <button
                      onClick={() => {
                        setExtendingId(app.id);
                        const nextDay = new Date(app.ends_at);
                        nextDay.setDate(nextDay.getDate() + 7);
                        setNewEndsAt(
                          nextDay.toISOString().slice(0, 16)
                        );
                      }}
                      className="text-xs text-yellow-700 hover:text-yellow-800 px-3 py-1.5 rounded border border-yellow-200 hover:border-yellow-300"
                    >
                      Ampliar plazo
                    </button>
                  )}
                  {app.access_token && (
                    <span
                      className="text-xs text-gray-400 font-mono"
                      title="Token de acceso"
                    >
                      {app.access_token.slice(0, 8)}...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
