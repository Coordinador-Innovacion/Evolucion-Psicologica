"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { useInstitutions } from "@/hooks/useInstitutions";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Stepper, type StepDef } from "@/components/ui/stepper";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import {
  ESTADO_LICENCIA,
  HOY_ISO,
  estadoDeGrupo,
  fmtFecha,
} from "@/lib/licencias";

const NIVELES_CATALOGO = ["Primaria", "Secundaria"] as const;
const GRADOS = {
  Primaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"],
  Secundaria: ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto"],
} as const;

const ESTADO_TONE: Record<string, BadgeTone> = {
  vigente: "green",
  por_vencer: "amber",
  vencida: "red",
  futura: "slate",
  sin_licencia: "indigo",
};

type LicenciaRow = {
  id: string;
  institution_id: string;
  start_date: string;
  end_date: string;
  licencia_codigos: { code: string }[] | null;
};

async function crearNiveles(
  supabase: ReturnType<typeof createClient>,
  institutionId: string,
  niveles: string[]
): Promise<string | null> {
  const orden = [...niveles].sort((a, b) =>
    a === "Primaria" ? -1 : b === "Primaria" ? 1 : 0
  );
  let order = 0;
  for (const nombre of orden) {
    order += 1;
    const { data: nivel, error } = await supabase
      .from("niveles_educativos")
      .insert({
        name: nombre,
        order_number: order,
        institution_id: institutionId,
      })
      .select("id")
      .single();
    if (error || !nivel) {
      return error?.message ?? "No se pudieron crear los niveles";
    }
    const grados = GRADOS[nombre as keyof typeof GRADOS] ?? [];
    const { error: gradosError } = await supabase.from("grados").insert(
      grados.map((g, i) => ({
        name: g,
        order_number: i + 1,
        nivel_id: nivel.id,
      }))
    );
    if (gradosError) return gradosError.message;
  }
  return null;
}

export function InstitutionCreateWizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [niveles, setNiveles] = useState<string[]>([...NIVELES_CATALOGO]);
  const [conLicencia, setConLicencia] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    id: string;
    sinLicencia: boolean;
    aviso?: string;
  } | null>(null);

  const steps: StepDef[] = [
    { id: 0, label: "Datos de la I.E." },
    { id: 1, label: "Licencia" },
    { id: 2, label: "Revisión" },
  ];

  const stepValid = (id: number): boolean => {
    if (id === 0) return !!name.trim() && !!code.trim() && niveles.length > 0;
    if (id === 1) {
      if (!conLicencia) return true;
      return !!start && !!end && end > start && codes.length > 0;
    }
    return true;
  };

  const completed = new Set(
    steps.filter((s) => s.id !== step && stepValid(s.id)).map((s) => s.id)
  );

  const canJump = (id: number): boolean => {
    for (let i = 0; i < id; i++) {
      if (!stepValid(i)) return false;
    }
    return true;
  };

  const toggleNivel = (nivel: string) => {
    setNiveles((prev) =>
      prev.includes(nivel)
        ? prev.filter((n) => n !== nivel)
        : [...prev, nivel]
    );
  };

  const addCode = () => {
    const value = codeInput.trim();
    if (!value) return;
    setCodes((prev) =>
      prev.includes(value) ? prev : [...prev, value]
    );
    setCodeInput("");
  };

  const reset = () => {
    setStep(0);
    setName("");
    setCode("");
    setNiveles([...NIVELES_CATALOGO]);
    setConLicencia(true);
    setStart("");
    setEnd("");
    setCodes([]);
    setCodeInput("");
    setError(null);
    setCreated(null);
  };

  const handleCreate = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      if (conLicencia) {
        const { data, error: rpcError } = await supabase.rpc(
          "create_institution_with_license",
          {
            p_name: name.trim(),
            p_code: code.trim(),
            p_niveles: niveles,
            p_start_date: start,
            p_end_date: end,
            p_codes: codes,
          }
        );
        if (rpcError) throw rpcError;
        if (!data?.success) {
          throw new Error(data?.error || "Error al crear la institución");
        }
        setCreated({
          id: data.institution_id as string,
          sinLicencia: false,
        });
      } else {
        const { data, error: rpcError } = await supabase.rpc("create_institution", {
          p_name: name.trim(),
          p_code: code.trim(),
        });
        if (rpcError) throw rpcError;
        if (!data?.success) {
          throw new Error(data?.error || "Error al crear la institución");
        }
        const instId = data.institution_id as string;
        const nivelError = await crearNiveles(supabase, instId, niveles);
        setCreated({
          id: instId,
          sinLicencia: true,
          aviso: nivelError
            ? `La institución se creó pero no se pudieron configurar los niveles (${nivelError}). Ajusta los niveles desde el detalle.`
            : undefined,
        });
      }
    } catch (err) {
      logClientError("institution.create", err);
      setError(
        toUserMessage(err, "Error al crear la institución")
      );
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">
          Institución creada
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {created.sinLicencia
            ? "Se creó sin licencia: hasta registrar una licencia, las nuevas atenciones estarán bloqueadas."
            : "Institución y licencia creadas en una sola transacción."}
        </p>
        {created.aviso && (
          <p className="mt-2 text-sm text-amber-700">{created.aviso}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/instituciones/${created.id}`}
            className={buttonClass()}
          >
            Ver institución
          </Link>
          <button
            type="button"
            onClick={reset}
            className={buttonClass("secondary")}
          >
            Crear otra
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[220px_1fr]">
      <Stepper
        steps={steps}
        active={step}
        completed={completed}
        onJump={setStep}
        canJump={canJump}
      />

      <Card className="p-6">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        {step === 0 && (
          <div className="space-y-4">
            <Field label="Nombre de la institución *">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClasses}
                placeholder="Nombre completo"
                autoFocus
              />
            </Field>
            <Field
              label="Código modular *"
              hint="Identificador único (ej. IE-001). Los docentes lo usan para registrarse."
            >
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={inputClasses}
                placeholder="IE-001"
                maxLength={50}
              />
            </Field>
            <Field label="Niveles habilitados *">
              <div className="flex flex-wrap gap-2">
                {NIVELES_CATALOGO.map((nivel) => {
                  const active = niveles.includes(nivel);
                  return (
                    <button
                      key={nivel}
                      type="button"
                      onClick={() => toggleNivel(nivel)}
                      aria-pressed={active}
                      className={
                        active
                          ? "rounded-lg border border-primary bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary"
                          : "rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink-muted hover:border-primary/40"
                      }
                    >
                      {nivel}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-ink-muted">
                {niveles.includes("Primaria")
                  ? "Primaria: 1.º–6.º. "
                  : ""}
                {niveles.includes("Secundaria")
                  ? "Secundaria: 1.º–5.º."
                  : ""}
              </p>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-line bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-ink">
                Registrar licencia ahora
              </span>
              <input
                type="checkbox"
                checked={conLicencia}
                onChange={(e) => setConLicencia(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
            </label>

            {!conLicencia ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Crearás la institución <strong>sin licencia</strong>: hasta
                registrar una licencia, las nuevas atenciones estarán
                bloqueadas. Podrás registrarla después desde Licencias.
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Fecha de inicio *">
                    <input
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Fecha de fin *">
                    <input
                      type="date"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      min={start || undefined}
                      className={inputClasses}
                    />
                  </Field>
                </div>
                {start && end && end <= start && (
                  <p className="text-sm text-rose-600">
                    La fecha de fin debe ser posterior a la fecha de inicio.
                  </p>
                )}
                <Field
                  label="Códigos de licencia *"
                  hint="Uno o varios códigos/serie. Se validan como únicos en el servidor."
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCode();
                        }
                      }}
                      className={inputClasses}
                      placeholder="SERIE-2026-001"
                      maxLength={100}
                    />
                    <Button variant="secondary" onClick={addCode}>
                      Agregar
                    </Button>
                  </div>
                </Field>
                {codes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {codes.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-mono text-slate-700"
                      >
                        {c}
                        <button
                          type="button"
                          aria-label={`Quitar ${c}`}
                          onClick={() =>
                            setCodes((prev) => prev.filter((x) => x !== c))
                          }
                          className="text-slate-400 hover:text-slate-700"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-ink">
              Revisa antes de crear
            </h2>
            <dl className="divide-y divide-line rounded-xl border border-line">
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-ink-muted">Nombre</dt>
                <dd className="font-medium text-ink">{name}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-ink-muted">Código modular</dt>
                <dd className="font-mono font-medium text-ink">{code}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-ink-muted">Niveles</dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {niveles.map((n) => (
                    <Badge key={n} tone="slate">
                      {n}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-ink-muted">Licencia</dt>
                <dd className="text-right font-medium text-ink">
                  {conLicencia ? (
                    <>
                      {fmtFecha(start)} → {fmtFecha(end)}
                      <span className="ml-2 text-xs font-normal text-ink-muted">
                        {codes.length} código(s)
                      </span>
                    </>
                  ) : (
                    <span className="text-amber-700">Sin licencia</span>
                  )}
                </dd>
              </div>
            </dl>
            {!conLicencia && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                hasta registrar una licencia, las nuevas atenciones estarán
                bloqueadas.
              </div>
            )}
            <p className="text-xs text-ink-muted">
              {conLicencia
                ? "La institución, los niveles y la licencia se crean en una sola transacción."
                : "La institución y sus niveles se crean en el mismo paso; la licencia quedará pendiente."}
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
          >
            Anterior
          </Button>
          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!stepValid(step)}
            >
              Siguiente
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={saving}>
              {saving
                ? "Creando..."
                : conLicencia
                  ? "Crear institución con licencia"
                  : "Crear sin licencia"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function InstitucionesPage() {
  const { profile, loading } = useUser();
  const isGlobal = profile?.role === "global";
  const { institutions, loading: institutionsLoading, refresh } =
    useInstitutions(isGlobal === true);

  const [nivelesMap, setNivelesMap] = useState<Record<string, string[]>>({});
  const [licenciasMap, setLicenciasMap] = useState<
    Record<string, LicenciaRow[]>
  >({});
  const [usuariosMap, setUsuariosMap] = useState<Record<string, number>>({});
  const [estudiantesMap, setEstudiantesMap] = useState<Record<string, number>>(
    {}
  );

  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<{
    id: string;
    name: string;
    code: string;
  } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!isGlobal || institutions.length === 0) return;
    let cancelled = false;
    let raf = 0;

    raf = requestAnimationFrame(async () => {
      if (institutions.length === 0) return;
      try {
        const supabase = createClient();
        const ids = institutions.map((i) => i.id);
        const [niv, lic, per, perAct] = await Promise.all([
          supabase
            .from("niveles_educativos")
            .select("institution_id, name, order_number")
            .in("institution_id", ids)
            .order("order_number"),
          supabase
            .from("licencias")
            .select(
              "id, institution_id, start_date, end_date, licencia_codigos(code)"
            )
            .in("institution_id", ids),
          supabase
            .from("perfiles")
            .select("institution_id")
            .in("institution_id", ids),
          supabase
            .from("periodos_escolares")
            .select("institution_id, student_id")
            .in("institution_id", ids)
            .is("end_date", null)
            .limit(10_000),
        ]);
        if (cancelled) return;

        const niveles: Record<string, string[]> = {};
        for (const row of (niv.data ?? []) as {
          institution_id: string;
          name: string;
        }[]) {
          (niveles[row.institution_id] ??= []).push(row.name);
        }
        const licencias: Record<string, LicenciaRow[]> = {};
        for (const row of (lic.data ?? []) as LicenciaRow[]) {
          (licencias[row.institution_id] ??= []).push(row);
        }
        const usuarios: Record<string, number> = {};
        for (const row of (per.data ?? []) as { institution_id: string }[]) {
          if (row.institution_id) {
            usuarios[row.institution_id] = (usuarios[row.institution_id] ?? 0) + 1;
          }
        }
        const estudiantes: Record<string, Set<string>> = {};
        for (const row of (perAct.data ?? []) as {
          institution_id: string;
          student_id: string;
        }[]) {
          (estudiantes[row.institution_id] ??= new Set()).add(row.student_id);
        }
        setNivelesMap(niveles);
        setLicenciasMap(licencias);
        setUsuariosMap(usuarios);
        setEstudiantesMap(
          Object.fromEntries(
            Object.entries(estudiantes).map(([k, v]) => [k, v.size])
          )
        );
      } catch {
        if (!cancelled) {
          setNivelesMap({});
          setLicenciasMap({});
          setUsuariosMap({});
          setEstudiantesMap({});
        }
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [isGlobal, institutions]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile || profile.role !== "global") {
    return (
      <RestrictedAccess message="Solo el rol Global puede administrar instituciones." />
    );
  }

  const openEdit = (id: string, name: string, code: string) => {
    setEditingId(id);
    setFormName(name);
    setFormCode(code);
    setEditError(null);
  };

  const closeEdit = () => {
    setEditingId(null);
    setFormName("");
    setFormCode("");
    setEditError(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const code = formCode.trim();
    if (!editingId || !name || !code) return;
    setSaving(true);
    setEditError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("update_institution", {
        p_institution_id: editingId,
        p_name: name,
        p_code: code,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al actualizar institución");
      }
      closeEdit();
      refresh();
    } catch (err) {
      logClientError("institutions.update", err);
      setEditError(toUserMessage(err, "Error al actualizar institución"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleting || confirmCode.trim().toUpperCase() !== deleting.code) {
      setDeleteError("El código modular no coincide.");
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "delete_institution",
        { p_institution_id: deleting.id }
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
      setDeleting(null);
      setConfirmCode("");
      refresh();
    } catch (err) {
      logClientError("institutions.delete", err);
      setDeleteError(toUserMessage(err, "Error al eliminar institución"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const filtro = q.trim().toLowerCase();
  const rows = institutions
    .filter((inst) => {
      if (filtro) {
        const hay =
          inst.name.toLowerCase().includes(filtro) ||
          inst.code.toLowerCase().includes(filtro);
        if (!hay) return false;
      }
      if (estadoFilter !== "todos") {
        const estado = estadoDeGrupo(licenciasMap[inst.id] ?? []);
        if (estado !== estadoFilter) return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Instituciones educativas"
        subtitle="Código modular, niveles, licencia, usuarios y estudiantes activos (solo rol Global)."
        actions={
          <Link
            href="/instituciones/nueva"
            className={buttonClass()}
          >
            Nueva institución
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className={`${inputClasses} w-full sm:w-72`}
          aria-label="Buscar instituciones"
        />
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className={`${selectClasses} w-auto`}
          aria-label="Filtrar por estado de licencia"
        >
          <option value="todos">Toda licencia</option>
          <option value="vigente">Vigente</option>
          <option value="por_vencer">Por vencer</option>
          <option value="vencida">Vencida</option>
          <option value="futura">Futura</option>
          <option value="sin_licencia">Sin licencia</option>
        </select>
      </div>

      {editError && <ErrorBanner>{editError}</ErrorBanner>}

      <Modal
        open={editingId !== null}
        onClose={closeEdit}
        title="Editar institución"
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
            <Button variant="secondary" onClick={closeEdit}>
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
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          setConfirmCode("");
          setDeleteError(null);
        }}
        title="Eliminar institución"
      >
        <form onSubmit={handleDelete}>
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Estás por eliminar <strong>{deleting?.name}</strong>. Escribe su
              código modular <span className="font-mono">{deleting?.code}</span>{" "}
              para confirmar. Esta acción no se puede deshacer.
            </p>
            <Field label="Código modular">
              <input
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                className={inputClasses}
                placeholder={deleting?.code}
                autoFocus
              />
            </Field>
            {deleteError && (
              <p className="text-sm text-rose-600">{deleteError}</p>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleting(null);
                setConfirmCode("");
                setDeleteError(null);
              }}
            >
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

      {institutionsLoading ? (
        <LoadingScreen label="Cargando instituciones..." />
      ) : institutions.length === 0 ? (
        <EmptyState
          title="No hay instituciones creadas aún."
          description="Cada institución educativa necesita un nombre y un código único para el registro de usuarios."
          action={
            <Link
              href="/instituciones/nueva"
              className={buttonClass()}
            >
              Crear primera institución
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Ninguna institución coincide con el filtro."
          description="Ajusta la búsqueda o el estado de licencia."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Institución</th>
                <th className="px-4 py-3 font-medium">Niveles</th>
                <th className="px-4 py-3 font-medium">Licencia</th>
                <th className="px-4 py-3 font-medium">Usuarios</th>
                <th className="px-4 py-3 font-medium">Est. activos</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((inst) => {
                const lics = licenciasMap[inst.id] ?? [];
                const estado = estadoDeGrupo(lics);
                const estadoInfo = ESTADO_LICENCIA[estado];
                const actual = lics.find(
                  (l) => l.start_date <= HOY_ISO && l.end_date >= HOY_ISO
                );
                return (
                  <tr key={inst.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-ink">
                      {inst.code}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/instituciones/${inst.id}`}
                        className="font-medium text-ink hover:text-primary"
                      >
                        {inst.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(nivelesMap[inst.id] ?? []).map((n) => (
                          <Badge key={n} tone="slate">
                            {n}
                          </Badge>
                        ))}
                        {(nivelesMap[inst.id] ?? []).length === 0 && (
                          <span className="text-xs text-ink-muted">
                            Sin niveles
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ESTADO_TONE[estado] ?? "slate"}>
                        {estadoInfo.label}
                      </Badge>
                      {actual && (
                        <span className="ml-2 text-xs text-ink-muted">
                          hasta {fmtFecha(actual.end_date)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {usuariosMap[inst.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {estudiantesMap[inst.id] ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/instituciones/${inst.id}`}
                          className={buttonClass("ghost", "sm")}
                        >
                          Ver
                        </Link>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            openEdit(inst.id, inst.name, inst.code)
                          }
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setDeleting({
                              id: inst.id,
                              name: inst.name,
                              code: inst.code,
                            });
                            setConfirmCode("");
                            setDeleteError(null);
                          }}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
