"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { useInstitutions } from "@/hooks/useInstitutions";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";

const STAFF_ROLES = [
  { value: "director", label: "Director" },
  { value: "admin_ie", label: "Admin I.E." },
  { value: "coordinador", label: "Coordinador" },
  { value: "psicologo", label: "Psicólogo" },
  { value: "docente", label: "Docente" },
] as const;

const ROLE_LABELS: Record<string, string> = {
  global: "Global",
  director: "Director",
  admin_ie: "Admin I.E.",
  coordinador: "Coordinador",
  psicologo: "Psicólogo",
  docente: "Docente",
};

interface StaffRow {
  user_id: string;
  full_name: string;
  document_number: string;
  role: string;
  institution_id: string | null;
  institution_name: string | null;
  email: string | null;
  created_at: string;
}

export default function PersonalPage() {
  const { profile, loading } = useUser();
  const isGlobal = profile?.role === "global";
  const { institutions, loading: institutionsLoading } = useInstitutions(
    isGlobal === true
  );

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDoc, setNewDoc] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newInstId, setNewInstId] = useState("");
  const [newRole, setNewRole] = useState("");
  const [saving, setSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);
  const [editRole, setEditRole] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const refresh = useCallback(() => {
    setReload((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!isGlobal) return;
    let cancelled = false;

    (async () => {
      setStaffLoading(true);
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc("get_staff_list");
        if (!cancelled) {
          if (rpcError || !data?.success) {
            setStaff([]);
            setError(
              !rpcError && data?.error
                ? data.error
                : "No se pudo obtener el personal"
            );
          } else {
            setStaff((data.data as StaffRow[]) ?? []);
            setError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStaff([]);
          logClientError("personal.list", err);
          setError(toUserMessage(err, "No se pudo obtener el personal"));
        }
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isGlobal, reload]);

  const openCreate = () => {
    setNewName("");
    setNewDoc("");
    setNewEmail("");
    setNewPassword("");
    setNewInstId("");
    setNewRole("");
    setError(null);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setNewPassword("");
    setError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newName.trim() ||
      !newDoc.trim() ||
      !newEmail.trim() ||
      newPassword.length < 8 ||
      !newInstId ||
      !newRole
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("admin_create_staff", {
        p_institution_id: newInstId,
        p_role: newRole,
        p_full_name: newName.trim(),
        p_document_number: newDoc.trim(),
        p_email: newEmail.trim(),
        p_password: newPassword,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al registrar personal");
      }
      closeCreate();
      refresh();
    } catch (err) {
      logClientError("personal.create", err);
      setError(toUserMessage(err, "Error al registrar personal"));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row: StaffRow) => {
    setEditTarget(row);
    setEditRole(row.role);
    setError(null);
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditRole("");
    setError(null);
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editRole) return;
    setSavingRole(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("admin_update_staff_role", {
        p_user_id: editTarget.user_id,
        p_new_role: editRole,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al actualizar el rol");
      }
      closeEdit();
      refresh();
    } catch (err) {
      logClientError("personal.update_role", err);
      setError(toUserMessage(err, "Error al actualizar el rol"));
    } finally {
      setSavingRole(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile || profile.role !== "global") {
    return (
      <RestrictedAccess message="Solo el rol Global puede administrar el personal." />
    );
  }

  const createDisabled =
    saving ||
    !newName.trim() ||
    !newDoc.trim() ||
    !newEmail.trim() ||
    newPassword.length < 8 ||
    !newInstId ||
    !newRole;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Personal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Registrar personal y gestionar sus roles (solo rol Global).
          </p>
        </div>
        <Button onClick={openCreate}>Registrar personal</Button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Modal
        open={showCreate}
        onClose={closeCreate}
        title="Registrar personal"
      >
        <form onSubmit={handleCreate}>
          <div className="space-y-4">
            <Field label="Nombre completo *">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={inputClasses}
                maxLength={255}
                required
                autoFocus
              />
            </Field>
            <Field label="Número de documento *">
              <input
                type="text"
                value={newDoc}
                onChange={(e) => setNewDoc(e.target.value)}
                className={inputClasses}
                maxLength={50}
                required
              />
            </Field>
            <Field label="Correo electrónico *">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={inputClasses}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Contraseña inicial *" hint="Mínimo 8 caracteres">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClasses}
                minLength={8}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                required
              />
            </Field>
            <Field label="Institución educativa *">
              <select
                value={newInstId}
                onChange={(e) => setNewInstId(e.target.value)}
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
            <Field label="Rol *">
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className={selectClasses}
                required
              >
                <option value="">Seleccione un rol</option>
                {STAFF_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={closeCreate}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createDisabled}>
              {saving ? "Registrando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editTarget !== null}
        onClose={closeEdit}
        title="Cambiar rol"
      >
        <form onSubmit={handleUpdateRole}>
          <div className="space-y-4">
            <div className="space-y-1 rounded-xl border border-line bg-slate-50 p-4 text-sm text-slate-700">
              <div>
                <span className="text-slate-500">Nombre:</span>{" "}
                {editTarget?.full_name}
              </div>
              <div>
                <span className="text-slate-500">Documento:</span>{" "}
                {editTarget?.document_number}
              </div>
              <div>
                <span className="text-slate-500">Correo:</span>{" "}
                {editTarget?.email || "—"}
              </div>
              <div>
                <span className="text-slate-500">I.E.:</span>{" "}
                {editTarget?.institution_name || "—"}
              </div>
            </div>
            <Field label="Rol" hint="La I.E. no se modifica desde esta pantalla.">
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className={selectClasses}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={closeEdit}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={savingRole || editRole === editTarget?.role}
            >
              {savingRole ? "Guardando..." : "Guardar rol"}
            </Button>
          </div>
        </form>
      </Modal>

      {staffLoading ? (
        <LoadingScreen label="Cargando personal..." />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No hay personal registrado aún."
          description="Registra al primer usuario con su institución educativa y rol."
          action={
            <Button variant="secondary" onClick={openCreate}>
              Registrar primer usuario
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {staff.map((row) => (
            <div
              key={row.user_id}
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="truncate">{row.full_name || "—"}</span>
                  <Badge tone={row.role === "global" ? "indigo" : "slate"}>
                    {ROLE_LABELS[row.role] || row.role}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-slate-500">
                  <span>{row.document_number}</span>
                  <span>{row.email || "—"}</span>
                  <span>{row.institution_name || "Sin I.E."}</span>
                </div>
              </div>
              {row.role !== "global" && (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className={buttonClass("secondary", "sm")}
                  >
                    Cambiar rol
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
