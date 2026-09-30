"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Field, inputClasses } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { LicenseFormModal } from "@/components/licencias/LicenseFormModal";
import {
  ESTADO_LICENCIA,
  HOY_ISO,
  daysUntil,
  estadoDeGrupo,
  fmtFecha,
  nextDayISO,
} from "@/lib/licencias";
import { ROLE_LABELS } from "@/components/layout/nav";
import type { Tables } from "@/types/supabase";

type Institution = Tables<"institutions">;

type LicenciaRow = {
  id: string;
  start_date: string;
  end_date: string;
  created_at: string;
  licencia_codigos: { code: string }[] | null;
};

type NivelRow = {
  id: string;
  name: string;
  order_number: number;
  grados: { name: string; order_number: number }[] | null;
};

type StaffRow = {
  user_id: string;
  full_name: string;
  document_number: string;
  role: string;
  institution_id: string | null;
  email: string | null;
  activo: boolean;
  created_at: string;
};

type EstudianteRow = {
  student_id: string;
  section: string;
  grados: {
    name: string;
    niveles_educativos: { name: string } | null;
  } | null;
  estudiantes: {
    first_names: string;
    last_names: string;
    document_number: string;
  } | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  vigente: "green",
  por_vencer: "amber",
  vencida: "red",
  futura: "slate",
  sin_licencia: "indigo",
};

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "datos", label: "Datos" },
  { id: "licencias", label: "Licencias" },
  { id: "usuarios", label: "Usuarios" },
  { id: "niveles", label: "Niveles" },
  { id: "estudiantes", label: "Estudiantes" },
  { id: "promocion", label: "Promoción" },
];

export default function InstitucionDetallePage() {
  const params = useParams<{ id: string }>();
  const institutionId = params.id;
  const router = useRouter();
  const { profile, loading } = useUser();

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [niveles, setNiveles] = useState<NivelRow[]>([]);
  const [licencias, setLicencias] = useState<LicenciaRow[]>([]);
  const [usuarios, setUsuarios] = useState<StaffRow[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteRow[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [reload, setReload] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);

  const [tab, setTab] = useState("resumen");

  const [editOpen, setEditOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [licenseOpen, setLicenseOpen] = useState(false);
  const [licenseDefaultStart, setLicenseDefaultStart] = useState<string>();
  const [structBusy, setStructBusy] = useState(false);

  const refresh = useCallback(() => setReload((v) => v + 1), []);

  useEffect(() => {
    if (!profile || profile.role !== "global") return;
    let cancelled = false;
    let raf = 0;

    raf = requestAnimationFrame(async () => {
      try {
        const supabase = createClient();
        const [inst, niv, lic, per, usersData] = await Promise.all([
          supabase
            .from("institutions")
            .select("*")
            .eq("id", institutionId)
            .maybeSingle(),
          supabase
            .from("niveles_educativos")
            .select("id, name, order_number, grados(name, order_number)")
            .eq("institution_id", institutionId)
            .order("order_number"),
          supabase
            .from("licencias")
            .select(
              "id, start_date, end_date, created_at, licencia_codigos(code)"
            )
            .eq("institution_id", institutionId)
            .order("end_date", { ascending: false }),
          supabase
            .from("periodos_escolares")
            .select(
              "student_id, section, grados(name, niveles_educativos(name)), estudiantes(first_names, last_names, document_number)"
            )
            .eq("institution_id", institutionId)
            .is("end_date", null)
            .limit(5_000),
          supabase.rpc("list_users"),
        ]);
        if (cancelled) return;

        if (inst.error) throw inst.error;
        if (!inst.data) {
          setNotFound(true);
          setLoadingData(false);
          return;
        }
        setInstitution(inst.data as Institution);
        setNiveles((niv.data ?? []) as unknown as NivelRow[]);
        setLicencias((lic.data ?? []) as LicenciaRow[]);
        setEstudiantes(
          (per.data ?? []) as unknown as EstudianteRow[]
        );
        if (!usersData.error && usersData.data?.success) {
          setUsuarios(
            ((usersData.data.data ?? []) as StaffRow[]).filter(
              (u) => u.institution_id === institutionId
            )
          );
        }
        setPageError(null);
      } catch (err) {
        if (!cancelled) {
          logClientError("institution.detail", err);
          setPageError(toUserMessage(err, "No se pudo cargar la institución"));
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [profile, institutionId, reload]);

  if (loading) return <LoadingScreen />;

  if (!profile || profile.role !== "global") {
    return (
      <RestrictedAccess message="Solo el rol Global puede administrar instituciones." />
    );
  }

  if (loadingData && !notFound) return <LoadingScreen />;

  if (notFound || !institution) {
    return (
      <RestrictedAccess message="No se pudo encontrar la institución solicitada." />
    );
  }

  const estado = estadoDeGrupo(licencias);
  const estadoInfo = ESTADO_LICENCIA[estado];
  const activa = licencias.find(
    (l) => l.start_date <= HOY_ISO && l.end_date >= HOY_ISO
  );
  const diasRestantes = activa ? daysUntil(activa.end_date) : null;
  const usuariosActivos = usuarios.filter((u) => u.activo).length;

  const openEdit = () => {
    setFormName(institution.name);
    setFormCode(institution.code);
    setEditError(null);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const code = formCode.trim();
    if (!name || !code) return;
    setSaving(true);
    setEditError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "update_institution",
        {
          p_institution_id: institution.id,
          p_name: name,
          p_code: code,
        }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al actualizar institución");
      }
      toast.success("Institución actualizada");
      setEditOpen(false);
      refresh();
    } catch (err) {
      logClientError("institution.update", err);
      setEditError(toUserMessage(err, "Error al actualizar institución"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmCode.trim().toUpperCase() !== institution.code) {
      setDeleteError("El código modular no coincide.");
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "delete_institution",
        { p_institution_id: institution.id }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        const serverMsg = data?.error || "Error al eliminar institución";
        throw new Error(
          serverMsg.includes("histórico de períodos")
            ? "No se puede eliminar: tiene períodos históricos."
            : serverMsg
        );
      }
      toast.success("Institución eliminada");
      router.push("/instituciones");
    } catch (err) {
      logClientError("institution.delete", err);
      setDeleteError(toUserMessage(err, "Error al eliminar institución"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleCreateStructure = async () => {
    setStructBusy(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "create_academic_structure",
        { p_institution_id: institution.id }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al crear la estructura");
      }
      toast.success("Estructura académica creada");
      refresh();
    } catch (err) {
      logClientError("institution.structure", err);
      setPageError(toUserMessage(err, "Error al crear la estructura"));
    } finally {
      setStructBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={institution.name}
        subtitle={`Código modular ${institution.code} · Registrada el ${fmtFecha(institution.created_at)}`}
        breadcrumbs={[
          { label: "Instituciones", href: "/instituciones" },
          { label: institution.name },
        ]}
        actions={
          <>
            <Button variant="secondary" onClick={openEdit}>
              Editar datos
            </Button>
            <Link
              href="/licencias"
              className={buttonClass("ghost")}
            >
              Ir a licencias
            </Link>
          </>
        }
      />

      {pageError && <ErrorBanner>{pageError}</ErrorBanner>}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "resumen" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5 md:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Licencia
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Badge tone={ESTADO_TONE[estado] ?? "slate"}>
                {estadoInfo.label}
              </Badge>
              {activa ? (
                <span className="text-sm text-ink">
                  {fmtFecha(activa.start_date)} → {fmtFecha(activa.end_date)}
                  {diasRestantes !== null && (
                    <span className="ml-2 text-ink-muted">
                      ({diasRestantes} día(s) restantes)
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-sm text-ink-muted">
                  Sin licencia activa.
                </span>
              )}
            </div>
            <div className="mt-4">
              <Button
                size="sm"
                onClick={() => {
                  setLicenseDefaultStart(undefined);
                  setLicenseOpen(true);
                }}
              >
                Registrar licencia
              </Button>
            </div>
          </Card>
          <div className="grid gap-4">
            <Card className="p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Usuarios
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {usuariosActivos}
              </p>
              <p className="text-xs text-ink-muted">activos</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Estudiantes activos
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {new Set(estudiantes.map((e) => e.student_id)).size}
              </p>
            </Card>
          </div>
        </div>
      )}

      {tab === "datos" && (
        <div className="space-y-6">
          <Card className="p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">
                  Nombre
                </dt>
                <dd className="mt-1 font-medium text-ink">
                  {institution.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">
                  Código modular
                </dt>
                <dd className="mt-1 font-mono font-medium text-ink">
                  {institution.code}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">
                  Registrada
                </dt>
                <dd className="mt-1 text-ink">
                  {fmtFecha(institution.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">
                  Última actualización
                </dt>
                <dd className="mt-1 text-ink">
                  {fmtFecha(institution.updated_at)}
                </dd>
              </div>
            </dl>
            <div className="mt-5">
              <Button variant="secondary" onClick={openEdit}>
                Editar datos
              </Button>
            </div>
          </Card>

          <Card className="border border-rose-200 p-6">
            <h2 className="text-base font-semibold text-rose-700">
              Zona de riesgo
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Eliminar la institución es irreversible. Si tiene histórico de
              períodos escolares, el servidor bloquea la eliminación.
            </p>
            <div className="mt-4">
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmCode("");
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
              >
                Eliminar institución
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "licencias" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setLicenseDefaultStart(undefined);
                setLicenseOpen(true);
              }}
            >
              Registrar licencia
            </Button>
          </div>
          {licencias.length === 0 ? (
            <EmptyState
              title="Sin licencias registradas"
              description="Hasta registrar una licencia, las nuevas atenciones estarán bloqueadas."
            />
          ) : (
            <Card className="divide-y divide-line">
              {licencias.map((lic) => {
                const estadoLic = estadoDeGrupo([lic]);
                const info = ESTADO_LICENCIA[estadoLic];
                return (
                  <div
                    key={lic.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={ESTADO_TONE[estadoLic] ?? "slate"}>
                          {info.label}
                        </Badge>
                        <span className="text-sm font-medium text-ink">
                          {fmtFecha(lic.start_date)} → {fmtFecha(lic.end_date)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(lic.licencia_codigos ?? []).map((c) => (
                          <span
                            key={c.code}
                            className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-700"
                          >
                            {c.code}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setLicenseDefaultStart(nextDayISO(lic.end_date));
                        setLicenseOpen(true);
                      }}
                    >
                      Renovar
                    </Button>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {tab === "usuarios" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Personal vinculado a esta institución. El rol se eleva desde
            Usuarios; el alta de docentes ocurre con el registro público y el
            código modular.
          </p>
          {usuarios.length === 0 ? (
            <EmptyState title="Sin usuarios en esta institución" />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Rol</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {usuarios.map((u) => (
                    <tr key={u.user_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-ink">
                        {u.full_name}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {u.document_number}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="slate">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
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
        </div>
      )}

      {tab === "niveles" && (
        <div className="space-y-4">
          {niveles.length === 0 ? (
            <EmptyState
              title="Sin niveles configurados"
              description="La estructura base crea Primaria (1.º–6.º) y Secundaria (1.º–5.º)."
              action={
                <Button onClick={handleCreateStructure} disabled={structBusy}>
                  {structBusy ? "Creando..." : "Crear estructura académica"}
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {niveles.map((nivel) => (
                <Card key={nivel.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-ink">{nivel.name}</h3>
                    <Badge tone="indigo">
                      {(nivel.grados ?? []).length} grados
                    </Badge>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {(nivel.grados ?? [])
                      .sort((a, b) => a.order_number - b.order_number)
                      .map((g, i) => (
                        <li
                          key={`${nivel.id}-${g.name}`}
                          className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                        >
                          {i + 1}.º {g.name}
                        </li>
                      ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "estudiantes" && (
        <div className="space-y-4">
          {estudiantes.length === 0 ? (
            <EmptyState
              title="Sin estudiantes activos"
              description="Aparecerán aquí los estudiantes con un período vigente en esta I.E."
            />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3 font-medium">Estudiante</th>
                    <th className="px-4 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Nivel y grado</th>
                    <th className="px-4 py-3 font-medium">Sección</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {estudiantes.map((e) => (
                    <tr key={e.student_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-ink">
                        {e.estudiantes
                          ? `${e.estudiantes.last_names}, ${e.estudiantes.first_names}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {e.estudiantes?.document_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {e.grados?.niveles_educativos?.name ?? "—"} ·{" "}
                        {e.grados?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-ink">{e.section}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/estudiantes/${e.student_id}`}
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
        </div>
      )}

      {tab === "promocion" && (
        <EmptyState
          title="Promoción masiva"
          description="Las promociones (preparar → revisar → ejecutar) se gestionan desde Coordinación."
          action={
            <Link href="/coordinador" className={buttonClass()}>
              Ir a Coordinación
            </Link>
          }
        />
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar datos de la I.E."
      >
        <form onSubmit={handleEdit}>
          <div className="space-y-4">
            <Field label="Nombre *">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className={inputClasses}
                required
                autoFocus
              />
            </Field>
            <Field label="Código modular *">
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                className={inputClasses}
                maxLength={50}
                required
              />
            </Field>
            {editError && <p className="text-sm text-rose-600">{editError}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !formName.trim() || !formCode.trim()}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar institución"
      >
        <form onSubmit={handleDelete}>
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Escribe el código modular{" "}
              <span className="font-mono">{institution.code}</span> para
              confirmar. Esta acción no se puede deshacer.
            </p>
            <Field label="Código modular">
              <input
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                className={inputClasses}
                placeholder={institution.code}
                autoFocus
              />
            </Field>
            {deleteError && (
              <p className="text-sm text-rose-600">{deleteError}</p>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={deleteBusy || confirmCode.trim().length === 0}
            >
              {deleteBusy ? "Eliminando..." : "Eliminar"}
            </Button>
          </div>
        </form>
      </Modal>

      <LicenseFormModal
        key={licenseDefaultStart ?? "nueva-licencia"}
        open={licenseOpen}
        onClose={() => setLicenseOpen(false)}
        onSaved={refresh}
        institutions={[]}
        institutionId={institution.id}
        defaultStart={licenseDefaultStart}
      />
    </div>
  );
}
