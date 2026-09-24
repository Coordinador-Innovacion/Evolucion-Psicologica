"use client";

import { useState } from "react";
import { useUser } from "@/hooks/useUser";
import { useInstitutions } from "@/hooks/useInstitutions";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, Field, inputClasses } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";

export default function InstitucionesPage() {
  const { profile, loading } = useUser();
  const isGlobal = profile?.role === "global";
  const { institutions, loading: institutionsLoading, refresh } =
    useInstitutions(isGlobal === true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile || profile.role !== "global") {
    return (
      <RestrictedAccess message="Solo el rol Global puede administrar instituciones." />
    );
  }

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormCode("");
    setError(null);
    setShowForm(true);
  };

  const openEdit = (id: string, name: string, code: string) => {
    setEditingId(id);
    setFormName(name);
    setFormCode(code);
    setError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormCode("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const code = formCode.trim();
    if (!name || !code) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = editingId
        ? await supabase.rpc("update_institution", {
            p_institution_id: editingId,
            p_name: name,
            p_code: code,
          })
        : await supabase.rpc("create_institution", {
            p_name: name,
            p_code: code,
          });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(
          data?.error ||
            (editingId
              ? "Error al actualizar institución"
              : "Error al crear institución")
        );
      }
      closeForm();
      refresh();
    } catch (err) {
      logClientError("institutions.save", err);
      setError(
        toUserMessage(
          err,
          editingId ? "Error al actualizar institución" : "Error al crear institución"
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (
      !window.confirm(
        `¿Eliminar la institución "${name}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "delete_institution",
        { p_institution_id: id }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al eliminar institución");
      }
      refresh();
    } catch (err) {
      logClientError("institutions.delete", err);
      setError(toUserMessage(err, "Error al eliminar institución"));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Instituciones educativas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Crear, editar y eliminar I.E. (solo rol Global).
          </p>
        </div>
        <Button onClick={openCreate}>Nueva institución</Button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? "Editar institución" : "Crear institución"}
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <Field label="Nombre *">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className={inputClasses}
                placeholder="Nombre de la institución"
                required
                autoFocus
              />
            </Field>
            <Field label="Código *">
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                className={inputClasses}
                placeholder="Código único (ej. IE-001)"
                maxLength={50}
                required
              />
            </Field>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={closeForm}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !formName.trim() || !formCode.trim()}
            >
              {saving
                ? "Guardando..."
                : editingId
                  ? "Guardar cambios"
                  : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      {institutionsLoading ? (
        <LoadingScreen label="Cargando instituciones..." />
      ) : institutions.length === 0 ? (
        <EmptyState
          title="No hay instituciones creadas aún."
          description="Cada institución educativa necesita un nombre y un código único para el registro de usuarios."
          action={<Button onClick={openCreate}>Crear primera institución</Button>}
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {institutions.map((inst) => (
            <div
              key={inst.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="truncate">{inst.name}</span>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-mono font-medium text-slate-600">
                    {inst.code}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                  <span>
                    Registrada el{" "}
                    {new Date(inst.created_at).toLocaleDateString("es-PE")}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openEdit(inst.id, inst.name, inst.code)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleDelete(inst.id, inst.name)}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
