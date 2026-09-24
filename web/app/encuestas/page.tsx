"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEncuestas } from "@/hooks/useEncuestas";
import { useUser } from "@/hooks/useUser";
import { useInstitutions } from "@/hooks/useInstitutions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/ui/feedback";

export default function EncuestasPage() {
  const router = useRouter();
  const { profile } = useUser();
  const { surveys, loading, createSurvey, copySurvey } = useEncuestas();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newInstitutionId, setNewInstitutionId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGlobal = profile?.role === "global";
  const { institutions, loading: institutionsLoading } = useInstitutions(
    isGlobal === true
  );
  const needsInstitution = isGlobal === true;
  const createDisabled =
    creating || !newTitle.trim() || (needsInstitution && !newInstitutionId);

  const closeCreate = () => {
    setShowCreate(false);
    setNewTitle("");
    setNewDesc("");
    setNewInstitutionId("");
    setError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createDisabled) return;
    setCreating(true);
    setError(null);
    try {
      const id = await createSurvey(
        newTitle.trim(),
        newDesc.trim() || null,
        newInstitutionId || undefined
      );
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Encuestas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestiona las encuestas institucionales
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Nueva encuesta</Button>
      </div>

      <Modal open={showCreate} onClose={closeCreate} title="Crear encuesta">
        <form onSubmit={handleCreate}>
          <div className="space-y-4">
            <Field label="Título *">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className={inputClasses}
                placeholder="Título de la encuesta"
                required
                autoFocus
              />
            </Field>
            <Field label="Descripción">
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className={inputClasses}
                rows={3}
                placeholder="Descripción opcional"
              />
            </Field>
            {needsInstitution && (
              <Field label="Institución educativa *">
                <select
                  value={newInstitutionId}
                  onChange={(e) => setNewInstitutionId(e.target.value)}
                  className={selectClasses}
                  required
                >
                  <option value="">
                    {institutionsLoading
                      ? "Cargando instituciones..."
                      : "Seleccione una institución"}
                  </option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
                {!institutionsLoading && institutions.length === 0 && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    No hay instituciones creadas.{" "}
                    <Link
                      href="/instituciones"
                      className="text-indigo-600 hover:text-indigo-500"
                    >
                      Crear institución
                    </Link>
                  </p>
                )}
              </Field>
            )}
            {error && <ErrorBanner>{error}</ErrorBanner>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={closeCreate}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createDisabled}>
              {creating ? "Creando..." : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <LoadingScreen label="Cargando encuestas..." />
      ) : surveys.length === 0 ? (
        <EmptyState
          title="No hay encuestas creadas aún."
          description="Crea una encuesta institucional para comenzar a recopilar información."
          action={<Button onClick={() => setShowCreate(true)}>Crear primera encuesta</Button>}
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/encuestas/${survey.id}/constructor`}
                  className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-600"
                >
                  {survey.title}
                </Link>
                {survey.description && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {survey.description}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  {survey.institution_name && (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 font-medium text-indigo-700">
                      {survey.institution_name}
                    </span>
                  )}
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
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy(survey.id, survey.title)}
                >
                  Copiar
                </Button>
                <Link
                  href={`/encuestas/${survey.id}/versiones`}
                  className={buttonClass("secondary", "sm")}
                >
                  Versiones
                </Link>
                <Link
                  href={`/encuestas/${survey.id}/constructor`}
                  className={buttonClass("primary", "sm")}
                >
                  Abrir
                </Link>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
