"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { StatusPill, CASO_TONES } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/feedback";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { StudentDocumentsPanel } from "@/components/documentos/StudentDocumentsPanel";
import { type ActivePeriod, type PeriodAction } from "./PeriodActions";

// ============================================================
// Tipos compartidos de la ficha (EST-04)
// ============================================================
export type PeriodItem = {
  id: string;
  institution_id: string | null;
  institution_name: string | null;
  school_year: number;
  nivel_name: string;
  grado_name: string;
  section: string;
  start_date: string;
  end_date: string | null;
  tipo: string;
  motivo_retiro: string | null;
  is_active: boolean;
  created_at: string;
};

export type FamilyMember = {
  id: string;
  type: string;
  full_name: string;
  document_type: string;
  document_number: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
};

export type CasoItem = {
  id: string;
  situation: string;
  estado: string;
  opened_at: string;
  closed_at: string | null;
  close_reason: string | null;
};

export type ReferralItem = {
  id: string;
  derivation_date: string;
  motivo: string;
  resumen: string | null;
  caso_id: string | null;
  derivador_nombre: string;
  derivador_cargo: string | null;
};

export type NeedItem = {
  id?: string;
  student_id?: string;
  condition_type?: string | null;
  clinical_description?: string | null;
  teacher_orientation?: string | null;
  certifying_entity?: string | null;
  certification_date?: string | null;
};

export type SurveyApp = {
  id: string;
  status: string;
  year: number;
  section_name: string | null;
  started_at: string;
  ends_at: string;
  extended_at: string | null;
  progress: number | null;
  version_id: {
    version_number: number;
    encuestas: { title: string } | null;
  } | null;
};

export type HistoryEvent = {
  date: string;
  kind: string;
  label: string;
  detail?: string;
};

const APP_TONES: Record<string, BadgeTone> = {
  scheduled: "slate",
  active: "green",
  extended: "indigo",
  completed: "indigo",
  closed: "slate",
  expired: "red",
};

const APP_LABELS: Record<string, string> = {
  scheduled: "programada",
  active: "activa",
  extended: "ampliada",
  completed: "completada",
  closed: "cerrada",
  expired: "vencida",
};

const TIPO_TONES: Record<string, BadgeTone> = {
  regular: "green",
  retiro: "amber",
  retorno: "indigo",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function edadDe(birthDate: string | null): string {
  if (!birthDate) return "—";
  const years = Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  );
  return `${years} años`;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

// ============================================================
// Resumen (tab 1)
// ============================================================
export function SummaryTab({
  student,
  activePeriod,
  periods,
  casos,
  derivaciones,
  aplicaciones,
  necesidades,
  atencionesCount,
}: {
  student: {
    first_names: string;
    last_names: string;
    document_type: string;
    document_number: string;
    birth_date: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    district: string | null;
  };
  activePeriod: PeriodItem | null;
  periods: PeriodItem[];
  casos: CasoItem[];
  derivaciones: ReferralItem[];
  aplicaciones: SurveyApp[];
  necesidades: NeedItem[];
  atencionesCount: number;
}) {
  const abiertos = casos.filter((c) => c.estado !== "cerrado").length;
  const edad = edadDe(student.birth_date);

  const stats = [
    { label: "Período activo", value: activePeriod ? 1 : 0 },
    { label: "Casos abiertos", value: abiertos },
    { label: "Atenciones", value: atencionesCount },
    { label: "Aplicaciones", value: aplicaciones.length },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-line bg-white p-4 shadow-card"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {stat.label}
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-ink">{stat.value}</p>
          </div>
        ))}
      </div>

      <Section title="Datos generales">
        <dl className="grid gap-x-8 gap-y-2 rounded-2xl border border-line bg-white p-5 text-sm shadow-card sm:grid-cols-2">
          <div className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-ink-muted">Documento</dt>
            <dd className="font-medium text-ink">
              {student.document_type} {student.document_number}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-ink-muted">Edad</dt>
            <dd className="font-medium text-ink">{edad}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-ink-muted">Fecha de nacimiento</dt>
            <dd className="font-medium text-ink">{fmtDate(student.birth_date)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-ink-muted">Teléfono</dt>
            <dd className="font-medium text-ink">{student.phone ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-ink-muted">Correo</dt>
            <dd className="min-w-0 truncate font-medium text-ink">
              {student.email ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-ink-muted">Domicilio</dt>
            <dd className="min-w-0 truncate font-medium text-ink">
              {student.address ?? "—"}
              {student.district ? ` (${student.district})` : ""}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-ink-muted">Período vigente</dt>
            <dd className="text-right font-medium text-ink">
              {activePeriod
                ? `${activePeriod.nivel_name} · ${activePeriod.grado_name} · ${activePeriod.section} (${activePeriod.school_year})`
                : "Sin período activo"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-ink-muted">Institución</dt>
            <dd className="text-right font-medium text-ink">
              {activePeriod?.institution_name ?? "—"}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Actividad">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <h3 className="text-sm font-semibold text-ink">Períodos</h3>
            <p className="mt-1 text-xs text-ink-muted">
              {periods.length} registrado(s) ·{" "}
              {periods.filter((p) => p.is_active).length} activo(s)
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <h3 className="text-sm font-semibold text-ink">Derivaciones</h3>
            <p className="mt-1 text-xs text-ink-muted">{derivaciones.length} registrada(s)</p>
          </div>
          <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <h3 className="text-sm font-semibold text-ink">Necesidad especial</h3>
            <p className="mt-1 text-xs text-ink-muted">
              {necesidades.length > 0
                ? `${necesidades.length} condición(es) registrada(s)`
                : "Sin registro"}
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ============================================================
// Datos (tab 2) + acción Editar (EST-05)
// ============================================================
export function DataTab({
  student,
  onEdit,
  canEdit,
}: {
  student: {
    first_names: string;
    last_names: string;
    document_type: string;
    document_number: string;
    birth_date: string | null;
    birth_place: string | null;
    address: string | null;
    district: string | null;
    phone: string | null;
    email: string | null;
    sexo?: string | null;
  };
  onEdit: () => void;
  canEdit: boolean;
}) {
  const rows: [string, string][] = [
    ["Nombres", student.first_names],
    ["Apellidos", student.last_names],
    ["Tipo de documento", student.document_type],
    ["Número de documento", student.document_number],
    [
      "Sexo",
      student.sexo === "M"
        ? "Masculino"
        : student.sexo === "F"
          ? "Femenino"
          : "—",
    ],
    ["Fecha de nacimiento", fmtDate(student.birth_date)],
    ["Lugar de nacimiento", student.birth_place ?? "—"],
    ["Domicilio", student.address ?? "—"],
    ["Distrito", student.district ?? "—"],
    ["Teléfono", student.phone ?? "—"],
    ["Correo", student.email ?? "—"],
  ];

  return (
    <Section title="Datos personales">
      <div className="flex justify-end">
        {canEdit && (
          <button type="button" onClick={onEdit} className={buttonClass("primary", "md")}>
            Editar datos
          </button>
        )}
      </div>
      <dl className="grid gap-x-8 rounded-2xl border border-line bg-white p-5 text-sm shadow-card sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-3 border-b border-line py-2 last:border-0"
          >
            <dt className="text-ink-muted">{label}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {!canEdit && (
        <p className="text-xs text-ink-muted">
          Su rol no puede editar datos personales del estudiante.
        </p>
      )}
    </Section>
  );
}

// ============================================================
// Familia (EST-06)
// ============================================================
const FAMILY_SLOTS = [
  { type: "padre", title: "Padre" },
  { type: "madre", title: "Madre" },
  { type: "guardian", title: "Guardián / tutor" },
] as const;

export function FamilyTab({
  studentId,
  family,
  canManage,
  onChanged,
}: {
  studentId: string;
  family: FamilyMember[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [full_name, setFullName] = useState("");
  const [document_type, setDocumentType] = useState("DNI");
  const [document_number, setDocumentNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [relationshipOther, setRelationshipOther] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEdit = (type: string) => {
    const member = family.find((f) => f.type === type);
    const rel = member?.relationship ?? "";
    const relOptions = ["padre", "madre", "abuelo/a", "tío/a", "hermano/a", "otro"];
    setEditing(type);
    setError(null);
    setFullName(member?.full_name ?? "");
    setDocumentType(member?.document_type ?? "DNI");
    setDocumentNumber(member?.document_number ?? "");
    setPhone(member?.phone ?? "");
    setEmail(member?.email ?? "");
    if (relOptions.includes(rel)) {
      setRelationship(rel);
      setRelationshipOther("");
    } else {
      setRelationship(rel ? "otro" : "");
      setRelationshipOther(rel);
    }
    setSaving(false);
  };

  const save = async (type: string) => {
    if (!full_name.trim() || !document_number.trim()) {
      setError("Nombre completo y número de documento son obligatorios.");
      return;
    }
    if (
      type === "guardian" &&
      !relationship.trim()
    ) {
      setError("La relación del guardián es obligatoria.");
      return;
    }
    if (type === "guardian" && relationship === "otro" && !relationshipOther.trim()) {
      setError("Describa la relación del guardián.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("upsert_family_member", {
        p_student_id: studentId,
        p_type: type,
        p_full_name: full_name.trim(),
        p_document_type: document_type,
        p_document_number: document_number.trim(),
        p_phone: phone.trim() || null,
        p_email: email.trim() || null,
        p_relationship:
          type === "guardian"
            ? relationship === "otro"
              ? relationshipOther.trim()
              : relationship
            : null,
      });
      if (error) throw error;
      if (!data?.success) {
        setError(data?.error ?? "No se pudo guardar el familiar");
        return;
      }
      toast.success(
        type === "guardian" ? "Guardián actualizado (historial conservado)" : "Familiar guardado"
      );
      setEditing(null);
      onChanged();
    } catch (err) {
      logClientError("estudiantes.familia.save", err);
      setError(toUserMessage(err, "No se pudo guardar el familiar"));
    }
    setSaving(false);
  };

  return (
    <Section title="Familia">
      {!canManage ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          Su rol no gestiona familiares. Puede consultar los datos registrados por los
          roles administrativos.
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          Padre y madre son fijos; el guardián/tutor operativo tiene relación explícita.
          Reasignar un guardián reemplaza el registro y conserva el historial en
          auditoría.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {FAMILY_SLOTS.map((slot) => {
          const member = family.find((f) => f.type === slot.type);
          const isEditing = editing === slot.type;
          const isGuardian = slot.type === "guardian";

          return (
            <div key={slot.type} className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{slot.title}</h3>
                {canManage && !isEditing && (
                  <button
                    type="button"
                    onClick={() => openEdit(slot.type)}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    {member
                      ? isGuardian
                        ? "Reasignar guardián"
                        : "Editar"
                      : "Agregar"}
                  </button>
                )}
              </div>

              {!isEditing &&
                (member ? (
                  <dl className="space-y-1.5 text-sm">
                    <div>
                      <dt className="text-xs text-ink-muted">Nombre</dt>
                      <dd className="font-medium text-ink">{member.full_name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Documento</dt>
                      <dd className="text-ink">
                        {member.document_type} {member.document_number}
                      </dd>
                    </div>
                    {isGuardian && (
                      <div>
                        <dt className="text-xs text-ink-muted">Relación</dt>
                        <dd className="text-ink">{member.relationship ?? "—"}</dd>
                      </div>
                    )}
                    {member.phone && (
                      <div>
                        <dt className="text-xs text-ink-muted">Teléfono</dt>
                        <dd className="text-ink">{member.phone}</dd>
                      </div>
                    )}
                    {member.email && (
                      <div>
                        <dt className="text-xs text-ink-muted">Correo</dt>
                        <dd className="break-all text-ink">{member.email}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-sm text-ink-muted">Sin registrar.</p>
                ))}

              {isEditing && (
                <div className="space-y-3">
                  {isGuardian && (
                    <>
                      <Field label="Relación *">
                        <select
                          value={relationship}
                          onChange={(e) => setRelationship(e.target.value)}
                          className={selectClasses}
                        >
                          <option value="">Seleccione…</option>
                          {["padre", "madre", "abuelo/a", "tío/a", "hermano/a", "otro"].map(
                            (rel) => (
                              <option key={rel} value={rel}>
                                {rel}
                              </option>
                            )
                          )}
                        </select>
                      </Field>
                      {relationship === "otro" && (
                        <Field label="Describa la relación *">
                          <input
                            type="text"
                            value={relationshipOther}
                            onChange={(e) => setRelationshipOther(e.target.value)}
                            className={inputClasses}
                          />
                        </Field>
                      )}
                    </>
                  )}
                  <Field label="Nombre completo *">
                    <input
                      type="text"
                      value={full_name}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tipo doc. *">
                      <select
                        value={document_type}
                        onChange={(e) => setDocumentType(e.target.value)}
                        className={selectClasses}
                      >
                        <option value="DNI">DNI</option>
                        <option value="CE">CE</option>
                        <option value="PASS">Pasaporte</option>
                      </select>
                    </Field>
                    <Field label="Nro. *">
                      <input
                        type="text"
                        value={document_number}
                        onChange={(e) => setDocumentNumber(e.target.value)}
                        className={inputClasses}
                      />
                    </Field>
                  </div>
                  <Field label="Teléfono">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Correo">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClasses}
                    />
                  </Field>

                  {error && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {error}
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className={buttonClass("secondary", "sm")}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => save(slot.type)}
                      disabled={saving}
                      className={buttonClass("primary", "sm")}
                    >
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ============================================================
// Períodos (EST-07)
// ============================================================
export function PeriodsTab({
  periods,
  activePeriodRaw,
  canManage,
  openAction,
  onOpenAction,
}: {
  periods: PeriodItem[];
  activePeriodRaw: ActivePeriod | null;
  canManage: boolean;
  openAction: PeriodAction;
  onOpenAction: (action: PeriodAction) => void;
}) {
  return (
    <Section title="Períodos escolares">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Cambiar de sección cierra y abre el período en una sola transacción; el retiro
          exige motivo; el retorno no duplica al estudiante.
        </p>
        {canManage && (
          <PeriodActionButtons
            hasActive={!!activePeriodRaw}
            open={openAction}
            onOpen={onOpenAction}
          />
        )}
      </div>

      <ol className="relative space-y-4 border-l-2 border-line pl-6">
        {periods.length === 0 && (
          <li>
            <EmptyState title="Sin períodos registrados" />
          </li>
        )}
        {periods.map((period) => (
          <li key={period.id} className="relative">
            <span
              aria-hidden
              className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${
                period.is_active ? "bg-primary" : "bg-slate-300"
              }`}
            />
            <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">
                  {period.school_year} · {period.nivel_name} · {period.grado_name} ·{" "}
                  Sección {period.section}
                </p>
                <div className="flex gap-2">
                  <Badge tone={TIPO_TONES[period.tipo] ?? "slate"}>{period.tipo}</Badge>
                  {period.is_active && <Badge tone="green">activo</Badge>}
                </div>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {period.institution_name ?? "Institución"} · {fmtDate(period.start_date)}{" "}
                → {period.is_active ? "vigente" : fmtDate(period.end_date)}
              </p>
              {period.tipo === "retiro" && period.motivo_retiro && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Motivo de retiro: {period.motivo_retiro}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function PeriodActionButtons({
  hasActive,
  open,
  onOpen,
}: {
  hasActive: boolean;
  open: PeriodAction;
  onOpen: (action: PeriodAction) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Acciones de período">
      <button
        type="button"
        disabled={!hasActive || open !== null}
        onClick={() => onOpen("cambio")}
        className={buttonClass("secondary", "sm")}
        title={hasActive ? undefined : "Requiere un período activo"}
      >
        Cambiar de sección
      </button>
      <button
        type="button"
        disabled={!hasActive || open !== null}
        onClick={() => onOpen("retiro")}
        className={buttonClass("secondary", "sm")}
        title={hasActive ? undefined : "Requiere un período activo"}
      >
        Retirar
      </button>
      <button
        type="button"
        disabled={hasActive || open !== null}
        onClick={() => onOpen("retorno")}
        className={buttonClass("secondary", "sm")}
        title={hasActive ? "El estudiante ya tiene un período activo" : undefined}
      >
        Registrar retorno
      </button>
    </div>
  );
}

// ============================================================
// Casos (F3: alta vía drawer CAS-02)
// ============================================================
export function CasesTab({
  casos,
  canCreate = false,
  onCreate,
}: {
  casos: CasoItem[];
  canCreate?: boolean;
  onCreate?: () => void;
}) {
  return (
    <Section title="Casos">
      {canCreate && onCreate && (
        <div className="flex justify-end">
          <button type="button" onClick={onCreate} className={buttonClass("secondary", "sm")}>
            Nuevo caso
          </button>
        </div>
      )}
      {casos.length === 0 ? (
        <EmptyState
          title="Sin casos registrados"
          description="Crea un caso con el botón «Nuevo caso» o desde el módulo de Casos."
        />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <ul className="divide-y divide-line">
          {casos.map((caso) => (
            <li
              key={caso.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{caso.situation}</p>
                <p className="text-xs text-ink-muted">
                  Abierto: {fmtDateTime(caso.opened_at)}
                  {caso.closed_at ? ` · Cerrado: ${fmtDateTime(caso.closed_at)}` : ""}
                  {caso.close_reason ? ` · ${caso.close_reason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill tone={CASO_TONES[caso.estado] ?? "slate"}>
                  {caso.estado.replace("_", " ")}
                </StatusPill>
                <Link
                  href={`/casos/${caso.id}`}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Abrir
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
      )}
    </Section>
  );
}

// ============================================================
// Derivaciones (F3: alta desde DER-02)
// ============================================================
export function ReferralsTab({
  derivaciones,
  studentId,
  canCreate = false,
}: {
  derivaciones: ReferralItem[];
  studentId?: string;
  canCreate?: boolean;
}) {
  return (
    <Section title="Derivaciones">
      {canCreate && studentId && (
        <div className="flex justify-end">
          <Link
            href={`/derivaciones/nueva?student=${studentId}`}
            className={buttonClass("secondary", "sm")}
          >
            Nueva derivación
          </Link>
        </div>
      )}
      {derivaciones.length === 0 ? (
        <EmptyState
          title="Sin derivaciones registradas"
          description="Registra una derivación desde el módulo de Derivaciones."
        />
      ) : (
      <ul className="space-y-3">
        {derivaciones.map((der) => (
          <li key={der.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{der.motivo}</p>
              <Badge tone="indigo">{fmtDate(der.derivation_date)}</Badge>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Derivado por: {der.derivador_nombre}
              {der.derivador_cargo ? ` · ${der.derivador_cargo}` : ""}
            </p>
            {der.resumen && (
              <p className="mt-2 text-sm text-ink-soft">{der.resumen}</p>
            )}
            {der.caso_id && (
              <Link
                href={`/casos/${der.caso_id}`}
                className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline"
              >
                Ver caso vinculado
              </Link>
            )}
          </li>
        ))}
      </ul>
      )}
    </Section>
  );
}

// ============================================================
// Necesidad especial (EST-09)
// ============================================================
export function SpecialNeedTab({
  necesidades,
  full,
  studentId,
  canManage = false,
  onChanged,
}: {
  necesidades: NeedItem[];
  full: boolean;
  studentId?: string;
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const [mode, setMode] = useState<"view" | "create" | "edit">("view");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    condition_type: "",
    clinical_description: "",
    teacher_orientation: "",
    certifying_entity: "",
    certification_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = () => {
    setForm({
      condition_type: "",
      clinical_description: "",
      teacher_orientation: "",
      certifying_entity: "",
      certification_date: "",
    });
    setFormError(null);
    setEditingId(null);
    setMode("create");
  };

  const openEdit = () => {
    const first = necesidades[0];
    if (!first) return;
    setForm({
      condition_type: first.condition_type ?? "",
      clinical_description: first.clinical_description ?? "",
      teacher_orientation: first.teacher_orientation ?? "",
      certifying_entity: first.certifying_entity ?? "",
      certification_date: first.certification_date ?? "",
    });
    setFormError(null);
    setEditingId(first.id ?? null);
    setMode("edit");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || saving) return;
    if (!form.condition_type.trim()) {
      setFormError("El tipo de condición es obligatorio");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const payload = {
        condition_type: form.condition_type.trim(),
        clinical_description: form.clinical_description.trim() || null,
        teacher_orientation: form.teacher_orientation.trim() || null,
        certifying_entity: form.certifying_entity.trim() || null,
        certification_date: form.certification_date || null,
      };
      if (mode === "edit" && editingId) {
        const { error: upError } = await supabase
          .from("necesidades_especiales")
          .update(payload)
          .eq("id", editingId);
        if (upError) throw upError;
      } else {
        const { error: insError } = await supabase
          .from("necesidades_especiales")
          .insert({ student_id: studentId, ...payload });
        if (insError) throw insError;
      }
      toast.success(
        mode === "edit"
          ? "Necesidad especial actualizada"
          : "Necesidad especial registrada"
      );
      setMode("view");
      onChanged?.();
    } catch (err) {
      const unique =
        typeof err === "object" && err !== null && "code" in err && err.code === "23505";
      setFormError(
        unique
          ? "El estudiante ya tiene esta condición registrada (una sola entidad por estudiante)."
          : toUserMessage(err, "No se pudo guardar la necesidad especial")
      );
      logClientError("necesidad.save", err);
    } finally {
      setSaving(false);
    }
  };

  if (!full) {
    const orientations = necesidades.filter((n) => n.teacher_orientation);
    return (
      <Section title="Necesidad especial — orientación docente">
        {orientations.length === 0 ? (
          <EmptyState title="Sin orientaciones registradas" />
        ) : (
          <ul className="space-y-3">
            {orientations.map((need, index) => (
              <li
                key={need.id ?? index}
                className="rounded-2xl border border-line bg-white p-4 shadow-card"
              >
                <p className="text-sm font-medium text-ink">Orientación para el docente</p>
                <p className="mt-1 text-sm text-ink-soft">{need.teacher_orientation}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-muted">
          La información clínica solo está disponible para Psicólogo y Global.
        </p>
      </Section>
    );
  }

  if (mode !== "view") {
    return (
      <Section title="Necesidad especial">
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">
              {mode === "create" ? "Registrar necesidad especial" : "Editar necesidad especial"}
            </p>
            <p className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              No crea un Caso
            </p>
          </div>

          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <Field label="Tipo de condición *">
            <input
              type="text"
              value={form.condition_type}
              onChange={(e) => setForm({ ...form, condition_type: e.target.value })}
              placeholder="Ej. TDAH, discapacidad visual..."
              className={inputClasses}
            />
          </Field>
          <Field label="Descripción clínica">
            <textarea
              value={form.clinical_description}
              onChange={(e) =>
                setForm({ ...form, clinical_description: e.target.value })
              }
              rows={3}
              className={inputClasses}
            />
          </Field>
          <Field label="Orientación para el docente">
            <textarea
              value={form.teacher_orientation}
              onChange={(e) => setForm({ ...form, teacher_orientation: e.target.value })}
              rows={2}
              className={inputClasses}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Entidad certificante">
              <input
                type="text"
                value={form.certifying_entity}
                onChange={(e) =>
                  setForm({ ...form, certifying_entity: e.target.value })
                }
                className={inputClasses}
              />
            </Field>
            <Field label="Fecha de certificación">
              <input
                type="date"
                value={form.certification_date}
                onChange={(e) =>
                  setForm({ ...form, certification_date: e.target.value })
                }
                className={inputClasses}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setMode("view")}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={buttonClass("primary", "md")}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Section>
    );
  }

  return (
    <Section title="Necesidad especial">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          Una sola entidad por estudiante. Este registro No crea un Caso.
        </p>
        {canManage && studentId && (
          <button
            type="button"
            onClick={necesidades.length > 0 ? openEdit : openCreate}
            className={buttonClass("secondary", "sm")}
          >
            {necesidades.length > 0 ? "Editar" : "Registrar necesidad especial"}
          </button>
        )}
      </div>
      {necesidades.length === 0 ? (
        <EmptyState
          title="Sin necesidades especiales registradas"
          description="El registro no crea un caso automáticamente."
        />
      ) : (
        <ul className="space-y-3">
          {necesidades.map((need, index) => (
            <li
              key={need.id ?? index}
              className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">
                  {need.condition_type ?? "Condición"}
                </p>
                {need.certification_date && (
                  <Badge tone="indigo">
                    certificada: {fmtDate(need.certification_date)}
                  </Badge>
                )}
              </div>
              {need.clinical_description && (
                <p className="text-sm text-ink-soft">
                  <span className="font-medium text-ink">Descripción: </span>
                  {need.clinical_description}
                </p>
              )}
              {need.teacher_orientation && (
                <p className="text-sm text-ink-soft">
                  <span className="font-medium text-ink">Orientación docente: </span>
                  {need.teacher_orientation}
                </p>
              )}
              {need.certifying_entity && (
                <p className="text-xs text-ink-muted">
                  Entidad certificante: {need.certifying_entity}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ============================================================
// Encuestas (aplicaciones del estudiante)
// ============================================================
export function SurveysTab({ aplicaciones }: { aplicaciones: SurveyApp[] }) {
  if (aplicaciones.length === 0) {
    return (
      <Section title="Encuestas">
        <EmptyState title="Sin aplicaciones de encuestas" />
      </Section>
    );
  }
  return (
    <Section title="Encuestas">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <ul className="divide-y divide-line">
          {aplicaciones.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {app.version_id?.encuestas?.title ?? "Encuesta"}{" "}
                  <span className="text-xs font-normal text-ink-muted">
                    v{app.version_id?.version_number ?? "?"}
                  </span>
                </p>
                <p className="text-xs text-ink-muted">
                  {app.year} · sección {app.section_name ?? "—"} ·{" "}
                  {fmtDate(app.started_at)} → {fmtDate(app.ends_at)}
                  {app.extended_at ? ` (ampliada ${fmtDate(app.extended_at)})` : ""}
                  {typeof app.progress === "number" ? ` · ${app.progress}%` : ""}
                </p>
              </div>
              <Badge tone={APP_TONES[app.status] ?? "slate"}>
                {APP_LABELS[app.status] ?? app.status}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-ink-muted">
        Ver las respuestas requiere permiso de encuestas y se habilita en la fase de
        encuestas.
      </p>
    </Section>
  );
}

// ============================================================
// Documentos (EST-08)
// ============================================================
export function DocumentsTab({ studentId }: { studentId: string }) {
  return (
    <Section title="Documentos">
      <StudentDocumentsPanel studentId={studentId} />
      <p className="text-xs text-ink-muted">
        Descarga con URL firmada y vista previa según el tipo. La interfaz no ofrece
        eliminar documentos clínicos.
      </p>
    </Section>
  );
}

// ============================================================
// Historial
// ============================================================
export function HistoryTab({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <Section title="Historial">
        <EmptyState title="Sin eventos registrados" />
      </Section>
    );
  }
  return (
    <Section title="Historial">
      <ol className="space-y-3">
        {events.map((event, index) => (
          <li
            key={`${event.date}-${event.kind}-${index}`}
            className="flex gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-card"
          >
            <span className="w-28 shrink-0 text-xs text-ink-muted">
              {fmtDate(event.date)}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{event.label}</p>
              <p className="text-xs text-ink-muted">
                {event.kind}
                {event.detail ? ` · ${event.detail}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
