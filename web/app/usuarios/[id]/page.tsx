"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Field, selectClasses } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { ROLE_LABELS } from "@/components/layout/nav";
import { fmtFecha } from "@/lib/licencias";
import type { Tables } from "@/types/supabase";

type Institution = Tables<"institutions">;

type UsuarioRow = {
  user_id: string;
  full_name: string;
  document_number: string;
  role: string;
  institution_id: string | null;
  institution_name: string | null;
  email: string | null;
  activo: boolean;
  created_at: string;
};

const ROLES_A_MODIFICAR = [
  "director",
  "admin_ie",
  "coordinador",
  "psicologo",
  "docente",
];

export default function UsuarioDetallePage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const { profile, loading } = useUser();

  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [reload, setReload] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);

  const [nuevoRol, setNuevoRol] = useState("");
  const [nuevaInst, setNuevaInst] = useState("");
  const [busy, setBusy] = useState<"rol" | "inst" | "estado" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isGlobal = profile?.role === "global";
  const allowed = !!profile && can(profile.role, "usuarios.gestionar");
  const esMismo = profile?.user_id === userId;

  const refresh = useCallback(() => setReload((v) => v + 1), []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    let raf = 0;

    raf = requestAnimationFrame(async () => {
      try {
        const supabase = createClient();
        const [users, inst] = await Promise.all([
          supabase.rpc("list_users"),
          isGlobal
            ? supabase
                .from("institutions")
                .select("*")
                .order("name", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (cancelled) return;

        let encontrado: UsuarioRow | undefined;
        if (!users.error && users.data?.success) {
          encontrado = ((users.data.data ?? []) as UsuarioRow[]).find(
            (u) => u.user_id === userId
          );
        }
        if (!encontrado) {
          const { data: propio } = await supabase
            .from("perfiles")
            .select(
              "user_id, full_name, document_number, role, institution_id, activo, created_at"
            )
            .eq("user_id", userId)
            .maybeSingle();
          if (propio && propio.user_id === userId) {
            const { data: instPropia } = propio.institution_id
              ? await supabase
                  .from("institutions")
                  .select("name")
                  .eq("id", propio.institution_id)
                  .maybeSingle()
              : { data: null };
            encontrado = {
              ...(propio as { created_at: string } & typeof propio),
              institution_name: instPropia?.name ?? null,
              email: null,
            } as UsuarioRow;
          }
        }
        if (cancelled) return;

        if (!encontrado) {
          setNotFound(true);
        } else {
          setUsuario(encontrado);
          setNuevoRol(encontrado.role);
          setNuevaInst(encontrado.institution_id ?? "");
          setPageError(null);
        }
        setInstitutions((inst.data ?? []) as Institution[]);
      } catch (err) {
        if (!cancelled) {
          logClientError("user.detail", err);
          setPageError(toUserMessage(err, "No se pudo cargar el usuario"));
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [allowed, isGlobal, userId, reload]);

  if (loading) return <LoadingScreen />;

  if (!profile || !allowed) {
    return (
      <RestrictedAccess message="Tu rol no puede gestionar usuarios." />
    );
  }

  if (loadingData && !notFound && !pageError) return <LoadingScreen />;

  if (notFound || !usuario) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Usuario"
          breadcrumbs={[
            { label: "Usuarios", href: "/usuarios" },
            { label: "No encontrado" },
          ]}
        />
        <EmptyState
          title="Usuario no encontrado"
          description="No tienes visibilidad sobre este perfil o el identificador no existe."
          action={
            <Link href="/usuarios" className={buttonClass("ghost")}>
              Volver a Usuarios
            </Link>
          }
        />
      </div>
    );
  }

  const rolGlobal = usuario.role === "global";
  const puedeCambiarRol = isGlobal && !rolGlobal && !esMismo;
  const puedeCambiarInst = isGlobal && !esMismo;
  const puedeCambiarEstado = !esMismo && !rolGlobal;

  const guardarRol = async () => {
    if (!puedeCambiarRol || nuevoRol === usuario.role) return;
    setBusy("rol");
    setFormError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "admin_update_staff_role",
        { p_user_id: usuario.user_id, p_new_role: nuevoRol }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al actualizar el rol");
      }
      toast.success("Rol actualizado");
      refresh();
    } catch (err) {
      logClientError("user.role", err);
      setFormError(toUserMessage(err, "Error al actualizar el rol"));
    } finally {
      setBusy(null);
    }
  };

  const guardarInstitucion = async () => {
    if (!puedeCambiarInst || nuevaInst === (usuario.institution_id ?? ""))
      return;
    setBusy("inst");
    setFormError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "admin_update_staff",
        {
          p_user_id: usuario.user_id,
          p_institution_id: nuevaInst || null,
        }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al actualizar la institución");
      }
      toast.success("Institución actualizada");
      refresh();
    } catch (err) {
      logClientError("user.institution", err);
      setFormError(toUserMessage(err, "Error al actualizar la institución"));
    } finally {
      setBusy(null);
    }
  };

  const alternarEstado = async () => {
    if (!puedeCambiarEstado) return;
    setBusy("estado");
    setFormError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "admin_update_staff",
        { p_user_id: usuario.user_id, p_activo: !usuario.activo }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al cambiar el estado");
      }
      toast.success(
        usuario.activo ? "Usuario desactivado" : "Usuario activado"
      );
      refresh();
    } catch (err) {
      logClientError("user.toggle", err);
      setFormError(toUserMessage(err, "Error al cambiar el estado"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={usuario.full_name}
        subtitle={`Documento ${usuario.document_number}${
          usuario.email ? ` · ${usuario.email}` : ""
        }`}
        breadcrumbs={[
          { label: "Usuarios", href: "/usuarios" },
          { label: usuario.full_name },
        ]}
        actions={
          <Link href="/usuarios" className={buttonClass("ghost")}>
            Volver
          </Link>
        }
      />

      {pageError && <ErrorBanner>{pageError}</ErrorBanner>}
      {formError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
        </p>
      )}

      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        No existe «crear usuario con contraseña»: los docentes se incorporan con
        el registro público usando el código modular de su I.E. Aquí se les
        eleva el rol.
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Datos
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-muted">Nombre completo</dt>
            <dd className="font-medium text-ink">{usuario.full_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Documento</dt>
            <dd className="font-medium text-ink">{usuario.document_number}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Correo</dt>
            <dd className="font-medium text-ink">{usuario.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Institución</dt>
            <dd className="font-medium text-ink">
              {usuario.institution_name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Rol actual</dt>
            <dd className="mt-1">
              <Badge tone={rolGlobal ? "indigo" : "slate"}>
                {ROLE_LABELS[usuario.role] ?? usuario.role}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Estado</dt>
            <dd className="mt-1">
              <Badge tone={usuario.activo ? "green" : "red"}>
                {usuario.activo ? "Activo" : "Desactivado"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Registro</dt>
            <dd className="text-ink">{fmtFecha(usuario.created_at)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Rol
          </h2>
          {!isGlobal && (
            <span className="text-xs text-ink-muted">
              Solo Global modifica roles
            </span>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {ROLES_A_MODIFICAR.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="rol"
                value={r}
                checked={nuevoRol === r}
                onChange={() => setNuevoRol(r)}
                disabled={!puedeCambiarRol}
                className="accent-slate-700"
              />
              <span className="text-ink">{ROLE_LABELS[r] ?? r}</span>
            </label>
          ))}
          {rolGlobal && (
            <p className="text-xs text-ink-muted">
              El perfil Global no se puede modificar.
            </p>
          )}
          {esMismo && (
            <p className="text-xs text-ink-muted">
              No puedes modificar tu propia ficha.
            </p>
          )}
        </div>
        <div className="mt-4">
          <Button
            size="sm"
            onClick={guardarRol}
            disabled={!puedeCambiarRol || nuevoRol === usuario.role || !!busy}
          >
            {busy === "rol" ? "Guardando..." : "Guardar rol"}
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Institución educativa
            </h2>
            {!isGlobal && (
              <span className="text-xs text-ink-muted">Solo Global</span>
            )}
          </div>
          <div className="mt-3">
            <Field label="I.E.">
              <select
                value={nuevaInst}
                onChange={(e) => setNuevaInst(e.target.value)}
                className={selectClasses}
                disabled={!puedeCambiarInst}
              >
                <option value="">Sin institución</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} ({inst.code})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <Button
              size="sm"
              onClick={guardarInstitucion}
              disabled={
                !puedeCambiarInst ||
                nuevaInst === (usuario.institution_id ?? "") ||
                !!busy
              }
            >
              {busy === "inst" ? "Guardando..." : "Guardar institución"}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Acceso
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            {usuario.activo
              ? "El usuario tiene acceso a la plataforma."
              : "El usuario está desactivado: sus sesiones no podrán iniciar."}
          </p>
          <div className="mt-4">
            <Button
              size="sm"
              variant={usuario.activo ? "danger" : "primary"}
              onClick={alternarEstado}
              disabled={!puedeCambiarEstado || !!busy}
            >
              {busy === "estado"
                ? "Aplicando..."
                : usuario.activo
                  ? "Desactivar usuario"
                  : "Activar usuario"}
            </Button>
          </div>
          {!puedeCambiarEstado && (
            <p className="mt-2 text-xs text-ink-muted">
              {esMismo
                ? "No puedes desactivar tu propia cuenta."
                : "Los perfiles Global no se desactivan."}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
