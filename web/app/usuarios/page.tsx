"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { ROLE_LABELS } from "@/components/layout/nav";
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

const ROL_TONE: Record<string, BadgeTone> = {
  global: "indigo",
  director: "blue",
  admin_ie: "slate",
  coordinador: "blue",
  psicologo: "green",
  docente: "amber",
  estudiante: "slate",
  apoderado: "slate",
};

const ROLE_OPTIONS = [
  "global",
  "director",
  "admin_ie",
  "coordinador",
  "psicologo",
  "docente",
  "estudiante",
  "apoderado",
];

export default function UsuariosPage() {
  const { profile, loading } = useUser();
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [rolFilter, setRolFilter] = useState("todos");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [instFilter, setInstFilter] = useState("todas");

  const isGlobal = profile?.role === "global";
  const allowed = !!profile && can(profile.role, "usuarios.listar");

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
        if (users.error) throw users.error;
        if (!users.data?.success) {
          throw new Error(users.data?.error || "No se pudo listar el personal");
        }
        setUsuarios((users.data.data ?? []) as UsuarioRow[]);
        setInstitutions((inst.data ?? []) as Institution[]);
        setPageError(null);
      } catch (err) {
        if (!cancelled) {
          logClientError("users.list", err);
          setPageError(toUserMessage(err, "No se pudieron cargar los usuarios"));
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [allowed, isGlobal]);

  if (loading) return <LoadingScreen />;

  if (!profile || !allowed) {
    return (
      <RestrictedAccess message="Tu rol no puede consultar la lista de usuarios." />
    );
  }

  if (loadingData && !pageError) return <LoadingScreen />;

  const query = q.trim().toLowerCase();
  const filtrados = usuarios.filter((u) => {
    if (rolFilter !== "todos" && u.role !== rolFilter) return false;
    if (estadoFilter === "activos" && !u.activo) return false;
    if (estadoFilter === "desactivados" && u.activo) return false;
    if (isGlobal && instFilter !== "todas" && u.institution_id !== instFilter)
      return false;
    if (!query) return true;
    return (
      u.full_name.toLowerCase().includes(query) ||
      u.document_number.toLowerCase().includes(query) ||
      (u.email ?? "").toLowerCase().includes(query)
    );
  });

  const activos = usuarios.filter((u) => u.activo).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle={`${usuarios.length} usuario(s) · ${activos} activo(s) · Ámbito ${
          isGlobal ? "Global" : "de tu institución"
        }`}
      />

      {pageError && <ErrorBanner>{pageError}</ErrorBanner>}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Buscar">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, documento o correo"
              className={inputClasses}
            />
          </Field>
          <Field label="Rol">
            <select
              value={rolFilter}
              onChange={(e) => setRolFilter(e.target.value)}
              className={selectClasses}
            >
              <option value="todos">Todos</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] ?? r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className={selectClasses}
            >
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="desactivados">Desactivados</option>
            </select>
          </Field>
          {isGlobal && (
            <Field label="Institución">
              <select
                value={instFilter}
                onChange={(e) => setInstFilter(e.target.value)}
                className={selectClasses}
              >
                <option value="todas">Todas</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Card>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        No existe «crear usuario con contraseña»: los docentes se incorporan con
        el registro público usando el código modular de su I.E. Aquí se les
        eleva el rol y se activan o desactivan.
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          title="Sin usuarios"
          description="Ajusta los filtros o espera a que se incorpore personal con el código modular."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Institución</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtrados.map((u) => (
                <tr key={u.user_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink">
                    {u.full_name}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {u.document_number}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{u.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={ROL_TONE[u.role] ?? "slate"}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {u.institution_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.activo ? "green" : "red"}>
                      {u.activo ? "Activo" : "Desactivado"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/usuarios/${u.user_id}`}
                      className={buttonClass("ghost", "sm")}
                    >
                      Ver ficha
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-ink-muted">
        El ámbito Global consulta todo el personal; el Director solo su
        institución.
      </p>
    </div>
  );
}
