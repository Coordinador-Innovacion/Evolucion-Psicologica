"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEncuestas } from "@/hooks/useEncuestas";
import { useUser } from "@/hooks/useUser";
import { useInstitutions } from "@/hooks/useInstitutions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button, buttonClass } from "@/components/ui/button";
import {
  Card,
  Field,
  inputClasses,
  selectClasses,
} from "@/components/ui/field";
import { ErrorBanner, LoadingScreen } from "@/components/ui/feedback";
import { CopySurveyDialog } from "@/components/encuestas/CopySurveyDialog";

type Mode = "choose" | "cero" | "copiar";

export default function NuevaEncuestaPage() {
  const router = useRouter();
  const { profile } = useUser();
  const { surveys, loading, createSurvey, copySurvey } = useEncuestas();
  const [mode, setMode] = useState<Mode>("choose");

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newInstitutionId, setNewInstitutionId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copyTargetId, setCopyTargetId] = useState<string | null>(null);
  const [copySourceTitle, setCopySourceTitle] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const isGlobal = profile?.role === "global";
  const { institutions, loading: institutionsLoading } = useInstitutions(
    isGlobal === true
  );
  const needsInstitution = isGlobal === true;
  const createDisabled =
    creating || !newTitle.trim() || (needsInstitution && !newInstitutionId);

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
      logClientError("encuestas.nueva.create", err);
      setError(toUserMessage(err, "Error al crear encuesta"));
      setCreating(false);
    }
  };

  const handleCopy = async (newTitleValue: string) => {
    if (!copyTargetId) return;
    setCopying(true);
    setCopyError(null);
    try {
      const id = await copySurvey(copyTargetId, newTitleValue);
      setCopyTargetId(null);
      router.push(`/encuestas/${id}/constructor`);
    } catch (err) {
      logClientError("encuestas.nueva.copy", err);
      setCopyError(toUserMessage(err, "Error al copiar"));
      setCopyTargetId(null);
    }
    setCopying(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Encuestas
          </p>
          <h1 className="text-xl font-semibold text-slate-900">
            Nueva encuesta
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Elige cómo quieres comenzar.
          </p>
        </div>
        <Link
          href="/encuestas"
          className={buttonClass("secondary", "md")}
        >
          Volver a encuestas
        </Link>
      </div>

      {mode === "choose" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-base font-semibold text-slate-900">
              Desde cero
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Crea una encuesta nueva con su primera versión en borrador.
            </p>
            <Button
              className="mt-4 w-full"
              onClick={() => setMode("cero")}
            >
              Crear desde cero
            </Button>
          </Card>
          <Card className="p-6">
            <h2 className="text-base font-semibold text-slate-900">
              Copiar una existente
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Parte de una encuesta ya creada. La copia es independiente.
            </p>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => setMode("copiar")}
            >
              Copiar existente
            </Button>
          </Card>
        </div>
      )}

      {mode === "cero" && (
        <Card className="p-6">
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
                </Field>
              )}
              {error && <ErrorBanner>{error}</ErrorBanner>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setMode("choose");
                  setError(null);
                }}
              >
                Volver
              </Button>
              <Button type="submit" disabled={createDisabled}>
                {creating ? "Creando..." : "Crear encuesta"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {mode === "copiar" && (
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMode("choose");
              setCopyError(null);
            }}
          >
            ← Volver
          </Button>
          {loading ? (
            <LoadingScreen label="Cargando encuestas..." />
          ) : surveys.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-500">
              No hay encuestas disponibles para copiar.
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {surveys.map((survey) => (
                <div
                  key={survey.id}
                  className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {survey.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {survey.version_count}{" "}
                      {survey.version_count === 1 ? "versión" : "versiones"} ·{" "}
                      {survey.application_count ?? 0}{" "}
                      {(survey.application_count ?? 0) === 1
                        ? "aplicación"
                        : "aplicaciones"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setCopyTargetId(survey.id);
                      setCopySourceTitle(survey.title);
                      setCopyError(null);
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              ))}
            </Card>
          )}
          {copyError && <ErrorBanner>{copyError}</ErrorBanner>}
          <CopySurveyDialog
            open={copyTargetId !== null}
            sourceTitle={copySourceTitle}
            copying={copying}
            onClose={() => {
              setCopyTargetId(null);
              setCopyError(null);
            }}
            onCopy={handleCopy}
          />
        </div>
      )}
    </div>
  );
}
