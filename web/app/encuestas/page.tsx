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
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/ui/feedback";
import { ApplicationsList } from "@/components/encuestas/aplicaciones/ApplicationsList";
import { CopySurveyDialog } from "@/components/encuestas/CopySurveyDialog";

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
  const [tab, setTab] = useState("encuestas");
  const [copyTarget, setCopyTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

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

  const handleCopy = async (newTitle: string) => {
    if (!copyTarget) return;
    setCopying(true);
    setCopyError(null);
    try {
      const id = await copySurvey(copyTarget.id, newTitle);
      setCopyTarget(null);
      router.push(`/encuestas/${id}/constructor`);
    } catch (err) {
      logClientError("encuestas.copy", err);
      setCopyError(toUserMessage(err, "Error al copiar"));
    }
    setCopying(false);
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
        <Link href="/encuestas/nueva" className={buttonClass()}>
          Nueva encuesta
        </Link>
      </div>

      <Tabs
        tabs={[
          { id: "encuestas", label: "Encuestas", count: surveys.length },
          {
            id: "aplicaciones",
            label: "Aplicaciones",
            count: surveys.reduce(
              (acc, s) => acc + (s.application_count ?? 0),
              0
            ),
          },
        ]}
        active={tab}
        onChange={setTab}
      />

      <CopySurveyDialog
        open={copyTarget !== null}
        sourceTitle={copyTarget?.title ?? ""}
        copying={copying}
        onClose={() => {
          setCopyTarget(null);
          setCopyError(null);
        }}
        onCopy={handleCopy}
      />
      {copyTarget && copyError && <ErrorBanner>{copyError}</ErrorBanner>}

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

      {tab === "aplicaciones" ? (
        <ApplicationsList />
      ) : loading ? (
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
                  href={`/encuestas/${survey.id}`}
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
                  {survey.current_version_number != null && (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                      V{survey.current_version_number} vigente
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
                    {survey.application_count ?? 0}{" "}
                    {(survey.application_count ?? 0) === 1
                      ? "aplicación"
                      : "aplicaciones"}
                  </span>
                  {survey.last_application_at && (
                    <span>
                      Última aplicación:{" "}
                      {new Date(survey.last_application_at).toLocaleDateString(
                        "es-PE"
                      )}
                    </span>
                  )}
                  <span>
                    {new Date(survey.created_at).toLocaleDateString("es-PE")}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setCopyTarget({ id: survey.id, title: survey.title })
                  }
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
                  href={`/encuestas/${survey.id}`}
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
