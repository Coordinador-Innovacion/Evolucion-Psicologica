"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { can } from "@/lib/permissions";
import { getInstitutionScope } from "@/components/layout/ScopeSelector";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import { useSeccionesCatalog, withCurrentSection } from "@/hooks/useSeccionesCatalog";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Stepper, type StepDef } from "@/components/ui/stepper";

type VerifyState = "new" | "active_own" | "active_other" | "inactive" | null;

type Person = {
  on: boolean;
  full_name: string;
  document_type: string;
  document_number: string;
  phone: string;
  email: string;
  relationship: string;
  relationshipOther: string;
};

type FormState = {
  docType: string;
  docNumber: string;
  firstNames: string;
  lastNames: string;
  birthDate: string;
  birthPlace: string;
  address: string;
  district: string;
  phone: string;
  email: string;
  sexo: string;
  institutionId: string;
  schoolYear: string;
  nivelId: string;
  gradoId: string;
  section: string;
  startDate: string;
  father: Person;
  mother: Person;
  guardian: Person;
};

type NeedState = {
  on: boolean;
  condition_type: string;
  clinical_description: string;
  teacher_orientation: string;
  certifying_entity: string;
  certification_date: string;
};

type ExistingStudent = {
  id: string;
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
};

const EMPTY_PERSON: Person = {
  on: false,
  full_name: "",
  document_type: "DNI",
  document_number: "",
  phone: "",
  email: "",
  relationship: "",
  relationshipOther: "",
};

const EMPTY_NEED: NeedState = {
  on: false,
  condition_type: "",
  clinical_description: "",
  teacher_orientation: "",
  certifying_entity: "",
  certification_date: "",
};

const DRAFT_KEY = "ep:student-draft:v1";
const RELATIONSHIPS = ["padre", "madre", "abuelo/a", "tío/a", "hermano/a", "otro"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeInternalPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

function defaultForm(role: string, institutionId: string | null): FormState {
  const scope =
    role === "global" && typeof window !== "undefined"
      ? getInstitutionScope()
      : null;
  return {
    docType: "DNI",
    docNumber: "",
    firstNames: "",
    lastNames: "",
    birthDate: "",
    birthPlace: "",
    address: "",
    district: "",
    phone: "",
    email: "",
    sexo: "",
    institutionId:
      role === "global" ? (scope && scope !== "all" ? scope : "") : institutionId ?? "",
    schoolYear: String(new Date().getFullYear()),
    nivelId: "",
    gradoId: "",
    section: "A",
    startDate: today(),
    father: { ...EMPTY_PERSON },
    mother: { ...EMPTY_PERSON },
    guardian: { ...EMPTY_PERSON },
  };
}

function loadDraft(): Partial<FormState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<FormState>;
  } catch {
    return null;
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

function personComplete(p: Person, guardian = false): boolean {
  if (!p.on) return true;
  if (!p.full_name.trim() || !p.document_number.trim()) return false;
  if (guardian) {
    if (!p.relationship) return false;
    if (p.relationship === "otro" && !p.relationshipOther.trim()) return false;
  }
  return true;
}

function personPayload(p: Person, guardian = false): Record<string, unknown> | null {
  if (!personComplete(p, guardian)) return null;
  return {
    full_name: p.full_name.trim(),
    document_type: p.document_type,
    document_number: p.document_number.trim(),
    phone: p.phone.trim() || null,
    email: p.email.trim() || null,
    relationship: guardian
      ? p.relationship === "otro"
        ? p.relationshipOther.trim()
        : p.relationship
      : null,
  };
}

type Props = {
  profile: { user_id: string; role: string; institution_id: string | null };
  initialDoc: string | null;
  completar: boolean;
  desde: string | null;
};

export function StudentWizard({ profile, initialDoc, completar, desde }: Props) {
  const router = useRouter();
  const backTo = safeInternalPath(desde);
  const role = profile.role;
  const isGlobal = role === "global";
  const canFamily = can(role, "estudiantes.familia");
  const canNeed = can(role, "necesidades.gestionar");
  const canEdit = can(role, "estudiantes.editar");
  const canAcademico = can(role, "academico.gestionar");

  const [hadDraft, setHadDraft] = useState(() => loadDraft() !== null);
  const [form, setForm] = useState<FormState>(() => {
    const base = defaultForm(role, profile.institution_id);
    const draft = loadDraft() ?? {};
    return {
      ...base,
      ...draft,
      ...(initialDoc ? { docNumber: initialDoc } : {}),
      father: { ...EMPTY_PERSON, ...(draft.father ?? {}) },
      mother: { ...EMPTY_PERSON, ...(draft.mother ?? {}) },
      guardian: { ...EMPTY_PERSON, ...(draft.guardian ?? {}) },
    };
  });
  const [need, setNeed] = useState<NeedState>({ ...EMPTY_NEED });
  const [files, setFiles] = useState<File[]>([]);

  const [mode, setMode] = useState<"nuevo" | "existente">(
    completar ? "existente" : "nuevo"
  );
  const [step, setStep] = useState(completar ? 2 : 0);
  const [verify, setVerify] = useState<VerifyState>(completar ? "inactive" : null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingStudent | null>(null);

  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [ownInstitutionName, setOwnInstitutionName] = useState<string | null>(null);
  const [niveles, setNiveles] = useState<{ id: string; name: string }[]>([]);
  const [grados, setGrados] = useState<{ id: string; name: string }[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const { sections: catalogSections, error: seccionesError } = useSeccionesCatalog(
    form.institutionId
  );
  const sectionOptions = useMemo(
    () => withCurrentSection(catalogSections, form.section),
    [catalogSections, form.section]
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { upload } = useDocumentUpload();

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Borrador de sesión (sin datos clínicos)
  useEffect(() => {
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [form]);

  // Completar/retorno: cargar estudiante existente por documento
  useEffect(() => {
    if (!completar || !initialDoc) return;
    let cancelled = false;
    const supabase = createClient();
    Promise.resolve(
      supabase
        .from("estudiantes")
        .select(
          "id, first_names, last_names, document_type, document_number, birth_date, birth_place, address, district, phone, email"
        )
        .eq("document_number", initialDoc.trim())
        .maybeSingle()
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setMode("nuevo");
          setVerify("new");
          setStep(1);
          return;
        }
        const student = data as ExistingStudent;
        setExisting(student);
        setVerify("inactive");
        setMode("existente");
        setForm((prev) => ({
          ...prev,
          docType: student.document_type,
          docNumber: student.document_number,
          firstNames: student.first_names,
          lastNames: student.last_names,
          birthDate: student.birth_date ?? "",
          birthPlace: student.birth_place ?? "",
          address: student.address ?? "",
          district: student.district ?? "",
          phone: student.phone ?? "",
          email: student.email ?? "",
        }));
        setStep(2);
      })
      .catch(() => {
        if (!cancelled) {
          setMode("nuevo");
          setVerify("new");
          setStep(1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [completar, initialDoc]);

  // Instituciones (Global) / nombre de mi I.E.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    if (isGlobal) {
      supabase
        .from("institutions")
        .select("id, name")
        .order("name")
        .then(({ data, error }) => {
          if (!cancelled && !error) setInstitutions(data ?? []);
        });
      return () => {
        cancelled = true;
      };
    }
    if (profile.institution_id) {
      supabase
        .from("institutions")
        .select("name")
        .eq("id", profile.institution_id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setOwnInstitutionName(data?.name ?? null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isGlobal, profile.institution_id]);

  // Niveles de la I.E. seleccionada
  useEffect(() => {
    if (!form.institutionId) {
      const raf = requestAnimationFrame(() => setNiveles([]));
      return () => cancelAnimationFrame(raf);
    }
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("niveles_educativos")
      .select("id, name, order_number")
      .eq("institution_id", form.institutionId)
      .order("order_number")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setNiveles([]);
          setCatalogError("No se pudieron cargar los niveles de la institución.");
        } else {
          setNiveles(data ?? []);
          setCatalogError(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [form.institutionId]);

  // Grados del nivel seleccionado
  useEffect(() => {
    if (!form.nivelId) {
      const raf = requestAnimationFrame(() => setGrados([]));
      return () => cancelAnimationFrame(raf);
    }
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("grados")
      .select("id, name, order_number")
      .eq("nivel_id", form.nivelId)
      .order("order_number")
      .then(({ data, error }) => {
        if (!cancelled && !error) setGrados(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [form.nivelId]);

  const steps: StepDef[] = useMemo(() => {
    const all: StepDef[] = [
      { id: 0, label: "Verificar documento" },
      { id: 1, label: "Datos personales" },
      { id: 2, label: "Matrícula / período" },
      { id: 3, label: "Familia" },
      { id: 4, label: "Datos opcionales" },
      { id: 5, label: "Necesidad especial" },
      { id: 6, label: "Documentos" },
      { id: 7, label: "Resumen" },
    ];
    if (mode === "existente") {
      return all.filter((s) => [0, 1, 2, 4, 7].includes(s.id) && (s.id !== 4 || canEdit));
    }
    return all;
  }, [mode, canEdit]);

  const stepValid = (id: number): boolean => {
    switch (id) {
      case 0:
        return (
          !!verify &&
          form.docNumber.trim().length > 0 &&
          (verify === "new" || verify === "inactive")
        );
      case 1:
        if (mode === "existente") return true;
        return !!(
          form.firstNames.trim() &&
          form.lastNames.trim() &&
          form.birthDate
        );
      case 2: {
        const year = Number(form.schoolYear);
        return !!(
          form.institutionId &&
          year >= 2000 &&
          year <= 2100 &&
          form.nivelId &&
          form.gradoId &&
          sectionOptions.includes(form.section) &&
          form.startDate
        );
      }
      case 3:
        if (!canFamily) return true;
        return (
          personComplete(form.father) &&
          personComplete(form.mother) &&
          personComplete(form.guardian, true)
        );
      case 4:
        return true;
      case 5:
        if (!canNeed || !need.on) return true;
        return !!need.condition_type.trim();
      case 6:
        return true;
      case 7:
        return true;
      default:
        return false;
    }
  };

  const visibleIds = steps.map((s) => s.id);
  const currentIndex = Math.max(0, visibleIds.indexOf(step));

  const canJump = (id: number): boolean => {
    const target = visibleIds.indexOf(id);
    if (target < 0) return false;
    if (target <= currentIndex) return true;
    return visibleIds
      .slice(currentIndex, target)
      .every((s) => stepValid(s));
  };

  const goNext = () => {
    if (step === 0 && verify === "inactive") {
      beginReturn();
      return;
    }
    const next = visibleIds[currentIndex + 1];
    if (next !== undefined && stepValid(step)) setStep(next);
  };
  const goPrev = () => {
    const prev = visibleIds[currentIndex - 1];
    if (prev !== undefined) setStep(prev);
  };

  const runVerify = async () => {
    if (!form.docNumber.trim()) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("verify_student_document", {
        p_document_type: form.docType,
        p_document_number: form.docNumber.trim(),
      });
      if (error) throw error;
      if (!data?.success) {
        setVerifyError(data?.error ?? "No se pudo verificar el documento");
        setVerify(null);
        return;
      }
      setVerify(data.status);
      if (data.status === "inactive" && data.student_id) {
        const { data: student } = await supabase
          .from("estudiantes")
          .select(
            "id, first_names, last_names, document_type, document_number, birth_date, birth_place, address, district, phone, email"
          )
          .eq("id", data.student_id)
          .maybeSingle();
        if (student) {
          const s = student as ExistingStudent;
          setExisting(s);
          setForm((prev) => ({
            ...prev,
            firstNames: s.first_names,
            lastNames: s.last_names,
            birthDate: s.birth_date ?? "",
            docType: s.document_type,
            docNumber: s.document_number,
          }));
        }
      }
    } catch (err) {
      logClientError("estudiantes.wizard.verify", err);
      setVerifyError(toUserMessage(err, "Error al verificar el documento"));
      setVerify(null);
    }
    setVerifying(false);
  };

  const beginReturn = () => {
    setMode("existente");
    setStep(2);
  };

  const submit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("register_student_full", {
        p_document_type: form.docType,
        p_document_number: form.docNumber.trim(),
        p_first_names: mode === "existente" ? existing?.first_names ?? null : form.firstNames.trim(),
        p_last_names: mode === "existente" ? existing?.last_names ?? null : form.lastNames.trim(),
        p_birth_date: mode === "existente" ? existing?.birth_date ?? null : form.birthDate,
        p_birth_place: form.birthPlace.trim() || null,
        p_address: form.address.trim() || null,
        p_district: form.district.trim() || null,
        p_phone: form.phone.trim() || null,
        p_email: form.email.trim() || null,
        p_student_id: mode === "existente" ? existing?.id ?? null : null,
        p_institution_id: isGlobal ? form.institutionId : null,
        p_school_year: Number(form.schoolYear),
        p_nivel_id: form.nivelId || null,
        p_grado_id: form.gradoId || null,
        p_section: form.section,
        p_start_date: form.startDate || null,
        p_sexo: form.sexo || null,
        p_father: canFamily ? personPayload(form.father) : null,
        p_mother: canFamily ? personPayload(form.mother) : null,
        p_guardian: canFamily ? personPayload(form.guardian, true) : null,
        p_special_need:
          canNeed && need.on
            ? {
                condition_type: need.condition_type.trim(),
                clinical_description: need.clinical_description.trim() || null,
                teacher_orientation: need.teacher_orientation.trim() || null,
                certifying_entity: need.certifying_entity.trim() || null,
                certification_date: need.certification_date || "",
              }
            : null,
      });
      if (error) throw error;
      if (!data?.success) {
        setSaveError(data?.error ?? "No se pudo completar el registro");
        setSaving(false);
        return;
      }

      const studentId = data.student_id as string;

      // Documentos (opcional): se suben después de crear el estudiante
      let failedUploads = 0;
      for (const file of files) {
        const result = await upload(studentId, file);
        if (!result) failedUploads += 1;
      }

      clearDraft();
      toast.success("Estudiante registrado correctamente");
      if (failedUploads > 0) {
        toast.warning(
          `${failedUploads} documento(s) no se pudieron subir; puede adjuntarlos desde la ficha.`
        );
      }
      router.push(backTo ?? `/estudiantes/${studentId}`);
      return;
    } catch (err) {
      logClientError("estudiantes.wizard.submit", err);
      setSaveError(toUserMessage(err, "No se pudo completar el registro"));
    }
    setSaving(false);
  };

  const resetDraft = () => {
    clearDraft();
    setHadDraft(false);
    setForm(defaultForm(role, profile.institution_id));
    setNeed({ ...EMPTY_NEED });
    setFiles([]);
    setMode(completar ? "existente" : "nuevo");
    setVerify(completar ? "inactive" : null);
    setStep(completar ? 2 : 0);
  };

  const summaryRow = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );

  const selectedNivel = niveles.find((n) => n.id === form.nivelId);
  const selectedGrado = grados.find((g) => g.id === form.gradoId);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={mode === "existente" ? "Completar estudiante" : "Registrar estudiante"}
        subtitle="Paso a paso: verificación, matrícula, familia y documentos"
        breadcrumbs={[
          { label: "Estudiantes", href: "/estudiantes" },
          { label: mode === "existente" ? "Completar" : "Nuevo" },
        ]}
        actions={
          <Link href="/estudiantes/nuevo?modo=minimo" className={buttonClass("secondary", "md")}>
            Registro mínimo
          </Link>
        }
      />

      {hadDraft && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Se recuperó un borrador de esta sesión (sin datos clínicos).</span>
          <button
            type="button"
            onClick={resetDraft}
            className="font-medium text-amber-900 underline"
          >
            Descartar borrador
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <Stepper
          steps={steps}
          active={step}
          completed={new Set(visibleIds.filter((id) => visibleIds.indexOf(id) < currentIndex))}
          onJump={setStep}
          canJump={canJump}
        />

        <Card className="space-y-5 p-6">
          {/* Paso 0 — Verificar documento */}
          {step === 0 && (
            <section aria-label="Verificar documento" className="space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">
                Verificar documento
              </h2>
              <p className="text-sm text-ink-muted">
                Ingrese el DNI (o documento) para verificar si el estudiante ya existe y
                en qué estado se encuentra su matrícula.
              </p>
              <div className="grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                <Field label="Tipo de documento">
                  <select
                    value={form.docType}
                    onChange={(e) => setField("docType", e.target.value)}
                    className={selectClasses}
                  >
                    <option value="DNI">DNI</option>
                    <option value="CE">Carné de Extranjería</option>
                    <option value="PASS">Pasaporte</option>
                  </select>
                </Field>
                <Field label="Número de documento">
                  <input
                    type="text"
                    value={form.docNumber}
                    onChange={(e) => setField("docNumber", e.target.value)}
                    placeholder="Ej. 70123456"
                    inputMode="numeric"
                    maxLength={20}
                    className={inputClasses}
                  />
                </Field>
                <button
                  type="button"
                  onClick={runVerify}
                  disabled={verifying || !form.docNumber.trim()}
                  className={buttonClass("primary", "md")}
                >
                  {verifying ? "Verificando…" : "Verificar"}
                </button>
              </div>

              {verifyError && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {verifyError}
                </p>
              )}

              {verify === "new" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Documento nuevo: puede continuar con el registro.
                </div>
              )}

              {verify === "active_own" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p className="font-semibold">Período activo en su institución</p>
                  <p className="mt-1">
                    El estudiante ya está matriculado este año. No es necesario crear un
                    registro nuevo.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/estudiantes/${existing?.id ?? ""}`)}
                      className={buttonClass("primary", "md")}
                    >
                      Ir a la ficha
                    </button>
                  </div>
                </div>
              )}

              {verify === "active_other" && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <p className="font-semibold">Matrícula activa en otra institución</p>
                  <p className="mt-1">
                    Existe un período activo en otra institución educativa. No se creará un
                    registro nuevo: el estudiante debe retirarse o transferirse primero
                    desde su institución de origen.
                  </p>
                </div>
              )}

              {verify === "inactive" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold">Estudiante sin período activo</p>
                  <p className="mt-1">
                    El estudiante existe (retirado o egresado). Puede registrar un retorno:
                    solo se abre un nuevo período, sin duplicar el estudiante.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={beginReturn} className={buttonClass("primary", "md")}>
                      Continuar con matrícula
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/estudiantes/${existing?.id ?? ""}`)}
                      className={buttonClass("secondary", "md")}
                    >
                      Ir a la ficha
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Paso 1 — Datos personales */}
          {step === 1 && (
            <section aria-label="Datos personales" className="space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">Datos personales</h2>
              {mode === "existente" ? (
                <div className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted">
                  <p className="mb-2 font-medium text-ink">
                    {existing?.first_names} {existing?.last_names}
                  </p>
                  <p>
                    {existing?.document_type} {existing?.document_number} · fecha de
                    nacimiento: {existing?.birth_date ?? "—"}
                  </p>
                  <p className="mt-2 text-xs">
                    La identidad no se modifica aquí; para completar datos opcionales use
                    el paso correspondiente.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nombres *">
                    <input
                      type="text"
                      value={form.firstNames}
                      onChange={(e) => setField("firstNames", e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Apellidos *">
                    <input
                      type="text"
                      value={form.lastNames}
                      onChange={(e) => setField("lastNames", e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Fecha de nacimiento *">
                    <input
                      type="date"
                      value={form.birthDate}
                      onChange={(e) => setField("birthDate", e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Sexo" hint="Opcional">
                    <select
                      value={form.sexo}
                      onChange={(e) => setField("sexo", e.target.value)}
                      className={selectClasses}
                    >
                      <option value="">No especificado</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </Field>
                </div>
              )}
            </section>
          )}

          {/* Paso 2 — Matrícula / período */}
          {step === 2 && (
            <section aria-label="Matrícula y período" className="space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">
                Matrícula / período
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Institución educativa *">
                  {isGlobal ? (
                    <select
                      value={form.institutionId}
                      onChange={(e) => {
                        setField("institutionId", e.target.value);
                        setField("nivelId", "");
                        setField("gradoId", "");
                      }}
                      className={selectClasses}
                    >
                      <option value="">Seleccione una I.E.</option>
                      {institutions.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={ownInstitutionName ?? "Mi institución"}
                      className={`${inputClasses} bg-slate-50`}
                    />
                  )}
                </Field>
                <Field label="Año escolar *" hint="Ej. 2026">
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={form.schoolYear}
                    onChange={(e) => setField("schoolYear", e.target.value)}
                    className={inputClasses}
                  />
                </Field>
                <Field label="Nivel *">
                  <select
                    value={form.nivelId}
                    onChange={(e) => {
                      setField("nivelId", e.target.value);
                      setField("gradoId", "");
                    }}
                    className={selectClasses}
                  >
                    <option value="">Seleccione un nivel</option>
                    {niveles.map((nivel) => (
                      <option key={nivel.id} value={nivel.id}>
                        {nivel.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Grado *">
                  <select
                    value={form.gradoId}
                    onChange={(e) => setField("gradoId", e.target.value)}
                    className={selectClasses}
                  >
                    <option value="">Seleccione un grado</option>
                    {grados.map((grado) => (
                      <option key={grado.id} value={grado.id}>
                        {grado.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Sección *">
                  <select
                    value={form.section}
                    onChange={(e) => setField("section", e.target.value)}
                    className={selectClasses}
                  >
                    {sectionOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha de inicio *" hint="Por defecto: hoy">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setField("startDate", e.target.value)}
                    className={inputClasses}
                  />
                </Field>
              </div>

              {niveles.length === 0 && !catalogError && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  La institución aún no tiene niveles configurados.{" "}
                  {canAcademico && (
                    <Link href="/academico/niveles" className="font-medium underline">
                      Configurar estructura académica
                    </Link>
                  )}
                </p>
              )}
              {(catalogError || seccionesError) && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {catalogError ?? seccionesError}
                </p>
              )}
            </section>
          )}

          {/* Paso 3 — Familia */}
          {step === 3 && (
            <section aria-label="Familia" className="space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">Familia</h2>
              {!canFamily ? (
                <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
                  Su rol no gestiona familiares ( corresponde a los roles administrativos).
                  Puede continuar sin familia; el personal administrativo podrá completar
                  estos datos desde la ficha.
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-muted">
                    Padre y madre son fijos; además se registra un guardián/tutor operativo
                    con relación explícita. Todos los campos son opcionales en este paso.
                  </p>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <PersonCard
                      title="Padre"
                      person={form.father}
                      onChange={(p) => setField("father", p)}
                    />
                    <PersonCard
                      title="Madre"
                      person={form.mother}
                      onChange={(p) => setField("mother", p)}
                    />
                    <PersonCard
                      title="Guardián / tutor"
                      guardian
                      person={form.guardian}
                      onChange={(p) => setField("guardian", p)}
                    />
                  </div>
                </>
              )}
            </section>
          )}

          {/* Paso 4 — Datos opcionales */}
          {step === 4 && (
            <section aria-label="Datos opcionales" className="space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">Datos opcionales</h2>
              {mode === "existente" && !canEdit ? (
                <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
                  Su rol no puede editar datos personales. Los opcionales los completan los
                  roles administrativos desde la ficha.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Lugar de nacimiento">
                    <input
                      type="text"
                      value={form.birthPlace}
                      onChange={(e) => setField("birthPlace", e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Distrito">
                    <input
                      type="text"
                      value={form.district}
                      onChange={(e) => setField("district", e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Domicilio" className="sm:col-span-2">
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setField("address", e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Teléfono de contacto">
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                  <Field label="Correo de contacto">
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                      className={inputClasses}
                    />
                  </Field>
                </div>
              )}
            </section>
          )}

          {/* Paso 5 — Necesidad especial */}
          {step === 5 && (
            <section aria-label="Necesidad especial" className="space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">
                Necesidad especial <Badge tone="indigo">opcional</Badge>
              </h2>
              {!canNeed ? (
                <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
                  Solo el Psicólogo o Global registran necesidades especiales. Este paso no
                  aplica a su rol y no crea un caso.
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      checked={need.on}
                      onChange={(e) => setNeed({ ...EMPTY_NEED, on: e.target.checked })}
                      className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                    />
                    El estudiante tiene una necesidad especial
                  </label>
                  {need.on && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Condición *">
                        <input
                          type="text"
                          value={need.condition_type}
                          onChange={(e) =>
                            setNeed({ ...need, condition_type: e.target.value })
                          }
                          placeholder="Ej. Discapacidad motora"
                          className={inputClasses}
                        />
                      </Field>
                      <Field label="Entidad certificante">
                        <input
                          type="text"
                          value={need.certifying_entity}
                          onChange={(e) =>
                            setNeed({ ...need, certifying_entity: e.target.value })
                          }
                          className={inputClasses}
                        />
                      </Field>
                      <Field label="Fecha de certificación">
                        <input
                          type="date"
                          value={need.certification_date}
                          onChange={(e) =>
                            setNeed({ ...need, certification_date: e.target.value })
                          }
                          className={inputClasses}
                        />
                      </Field>
                      <Field label="Descripción clínica" className="sm:col-span-2">
                        <textarea
                          rows={3}
                          value={need.clinical_description}
                          onChange={(e) =>
                            setNeed({ ...need, clinical_description: e.target.value })
                          }
                          className={inputClasses}
                        />
                      </Field>
                      <Field label="Orientación al docente" className="sm:col-span-2">
                        <textarea
                          rows={2}
                          value={need.teacher_orientation}
                          onChange={(e) =>
                            setNeed({ ...need, teacher_orientation: e.target.value })
                          }
                          className={inputClasses}
                        />
                      </Field>
                    </div>
                  )}
                  <p className="text-xs text-ink-muted">
                    Este paso no crea un caso: los casos se gestionan desde Casos.
                  </p>
                </>
              )}
            </section>
          )}

          {/* Paso 6 — Documentos */}
          {step === 6 && (
            <section aria-label="Documentos" className="space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">
                Documentos <Badge tone="indigo">opcional</Badge>
              </h2>
              <p className="text-sm text-ink-muted">
                Adjunte documentos de respaldo (PDF, imágenes, ofimática). Se suben al
                terminar el registro, cuando el estudiante ya tenga ficha.
              </p>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length) setFiles((prev) => [...prev, ...picked]);
                  e.target.value = "";
                }}
                className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-slate-50"
              />
              {files.length > 0 && (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-ink">{file.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-ink-muted">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((prev) => prev.filter((_, i) => i !== index))
                          }
                          className="text-xs text-rose-600 hover:underline"
                        >
                          Quitar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-muted">
                Límite: 50 MB por archivo. No se permite eliminar documentos clínicos desde
                la interfaz.
              </p>
            </section>
          )}

          {/* Paso 7 — Resumen */}
          {step === 7 && (
            <section aria-label="Resumen y confirmación" className="space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">
                Resumen y confirmación
              </h2>
              <div className="grid gap-5 md:grid-cols-2">
                <dl className="rounded-xl border border-line p-4">
                  <h3 className="mb-2 text-sm font-semibold text-ink">
                    Identidad
                  </h3>
                  {summaryRow("Documento", `${form.docType} ${form.docNumber || "—"}`)}
                  {summaryRow(
                    "Nombre",
                    mode === "existente"
                      ? `${existing?.first_names ?? ""} ${existing?.last_names ?? ""}`
                      : `${form.firstNames} ${form.lastNames}`
                  )}
                  {summaryRow(
                    "Fecha de nacimiento",
                    mode === "existente"
                      ? existing?.birth_date ?? "—"
                      : form.birthDate || "—"
                  )}
                  {summaryRow("Opcionales", [
                    form.birthPlace,
                    form.address,
                    form.district,
                    form.phone,
                    form.email,
                  ].filter(Boolean).join(" · ") || "—")}
                  {summaryRow(
                    "Sexo",
                    mode === "existente"
                      ? "—"
                      : form.sexo === "M"
                        ? "Masculino"
                        : form.sexo === "F"
                          ? "Femenino"
                          : "No especificado"
                  )}
                </dl>
                <dl className="rounded-xl border border-line p-4">
                  <h3 className="mb-2 text-sm font-semibold text-ink">Matrícula</h3>
                  {summaryRow(
                    "Institución",
                    isGlobal
                      ? institutions.find((i) => i.id === form.institutionId)?.name ?? "—"
                      : ownInstitutionName ?? "Mi institución"
                  )}
                  {summaryRow("Año escolar", form.schoolYear)}
                  {summaryRow(
                    "Nivel · Grado",
                    `${selectedNivel?.name ?? "—"} · ${selectedGrado?.name ?? "—"}`
                  )}
                  {summaryRow("Sección", form.section)}
                  {summaryRow("Inicio", form.startDate || "—")}
                  {summaryRow("Tipo", mode === "existente" ? "retorno / regular" : "regular")}
                </dl>
                <dl className="rounded-xl border border-line p-4">
                  <h3 className="mb-2 text-sm font-semibold text-ink">Familia</h3>
                  {summaryRow(
                    "Padre",
                    form.father.on && form.father.full_name
                      ? form.father.full_name
                      : canFamily
                        ? "—"
                        : "no registrado en este flujo"
                  )}
                  {summaryRow(
                    "Madre",
                    form.mother.on && form.mother.full_name ? form.mother.full_name : canFamily ? "—" : ""
                  )}
                  {summaryRow(
                    "Guardián",
                    form.guardian.on && form.guardian.full_name
                      ? `${form.guardian.full_name} (${form.guardian.relationship === "otro" ? form.guardian.relationshipOther : form.guardian.relationship})`
                      : canFamily
                        ? "—"
                        : ""
                  )}
                </dl>
                <dl className="rounded-xl border border-line p-4">
                  <h3 className="mb-2 text-sm font-semibold text-ink">
                    Necesidad especial y documentos
                  </h3>
                  {summaryRow(
                    "Necesidad especial",
                    canNeed && need.on ? need.condition_type || "—" : "no"
                  )}
                  {summaryRow(
                    "Documentos a subir",
                    files.length > 0 ? `${files.length} archivo(s)` : "—"
                  )}
                  {summaryRow("Registros", "estudiante + período (+ familia / necesidad)")}
                </dl>
              </div>

              <p className="rounded-lg border border-line bg-surface px-4 py-3 text-xs text-ink-muted">
                El registro se guarda en <strong>una sola transacción</strong>: todo o
                nada. Si algo falla, no se crea ningún registro.
              </p>

              {saveError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {saveError}
                </p>
              )}
            </section>
          )}

          {/* Navegación */}
          <div className="flex items-center justify-between border-t border-line pt-4">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0}
              className={buttonClass("secondary", "md")}
            >
              Anterior
            </button>
            <div className="flex items-center gap-3">
              {step === 7 ? (
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className={buttonClass("primary", "md")}
                >
                  {saving ? "Guardando…" : "Confirmar registro"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!stepValid(step)}
                  className={buttonClass("primary", "md")}
                >
                  Siguiente
                </button>
              )}
            </div>
          </div>

          {!stepValid(step) && step !== 7 && (
            <p className="text-xs text-ink-muted">
              Complete los campos obligatorios del paso para continuar.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function PersonCard({
  title,
  person,
  guardian = false,
  onChange,
}: {
  title: string;
  person: Person;
  guardian?: boolean;
  onChange: (p: Person) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={person.on}
            onChange={(e) => onChange({ ...person, on: e.target.checked })}
            className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
          />
          Registrar
        </label>
      </div>
      {person.on && (
        <div className="space-y-3">
          {guardian && (
            <Field label="Relación *">
              <select
                value={person.relationship}
                onChange={(e) => onChange({ ...person, relationship: e.target.value })}
                className={selectClasses}
              >
                <option value="">Seleccione…</option>
                {RELATIONSHIPS.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {guardian && person.relationship === "otro" && (
            <Field label="Describa la relación *">
              <input
                type="text"
                value={person.relationshipOther}
                onChange={(e) =>
                  onChange({ ...person, relationshipOther: e.target.value })
                }
                className={inputClasses}
              />
            </Field>
          )}
          <Field label="Nombre completo *">
            <input
              type="text"
              value={person.full_name}
              onChange={(e) => onChange({ ...person, full_name: e.target.value })}
              className={inputClasses}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo doc. *">
              <select
                value={person.document_type}
                onChange={(e) => onChange({ ...person, document_type: e.target.value })}
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
                value={person.document_number}
                onChange={(e) => onChange({ ...person, document_number: e.target.value })}
                className={inputClasses}
              />
            </Field>
          </div>
          <Field label="Teléfono">
            <input
              type="tel"
              value={person.phone}
              onChange={(e) => onChange({ ...person, phone: e.target.value })}
              className={inputClasses}
            />
          </Field>
          <Field label="Correo">
            <input
              type="email"
              value={person.email}
              onChange={(e) => onChange({ ...person, email: e.target.value })}
              className={inputClasses}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
