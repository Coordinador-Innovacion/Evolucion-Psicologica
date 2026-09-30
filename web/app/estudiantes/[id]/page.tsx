"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/field";
import {
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { SkeletonList } from "@/components/ui/skeleton";
import { PeriodActions, type ActivePeriod, type PeriodAction } from "@/components/estudiantes/PeriodActions";
import { EditStudentDrawer, type EditableStudent } from "@/components/estudiantes/EditStudentDrawer";
import { CaseCreateForm } from "@/components/casos/CaseCreateForm";
import { Modal } from "@/components/ui/modal";
import {
  SummaryTab,
  DataTab,
  FamilyTab,
  PeriodsTab,
  CasesTab,
  ReferralsTab,
  SpecialNeedTab,
  SurveysTab,
  DocumentsTab,
  HistoryTab,
  type PeriodItem,
  type FamilyMember,
  type CasoItem,
  type ReferralItem,
  type NeedItem,
  type SurveyApp,
  type HistoryEvent,
} from "@/components/estudiantes/StudentTabs";

type StudentRow = EditableStudent & {
  document_type: string;
  document_number: string;
};

type Ficha = {
  student: StudentRow;
  periods: PeriodItem[];
  activePeriod: ActivePeriod | null;
  family: FamilyMember[];
  casos: CasoItem[];
  derivaciones: ReferralItem[];
  necesidades: NeedItem[];
  aplicaciones: SurveyApp[];
  atencionesCount: number;
};

const ESTADO_TONES: Record<string, BadgeTone> = {
  activo: "green",
  retirado: "amber",
  egresado: "slate",
};

function estadoEstudiante(periods: PeriodItem[]): string {
  const active = periods.find((p) => p.is_active);
  if (active) return "activo";
  const latest = periods[0];
  if (!latest) return "sin período";
  return latest.tipo === "retiro" ? "retirado" : "egresado";
}

function edad(birthDate: string | null): string {
  if (!birthDate) return "—";
  const years = Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  );
  return `${years} años`;
}

function historyFrom(
  periods: PeriodItem[],
  casos: CasoItem[],
  derivaciones: ReferralItem[],
  aplicaciones: SurveyApp[]
): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  for (const p of periods) {
    events.push({
      date: p.start_date,
      kind: "período",
      label: `Período ${p.school_year}: ${p.nivel_name} · ${p.grado_name} · ${p.section}`,
      detail: p.is_active
        ? "vigente"
        : p.tipo === "retiro"
          ? `retiro${p.motivo_retiro ? `: ${p.motivo_retiro}` : ""}`
          : p.tipo,
    });
  }
  for (const c of casos) {
    events.push({
      date: c.opened_at,
      kind: "caso",
      label: `Caso abierto: ${c.situation}`,
      detail: c.estado,
    });
    if (c.closed_at) {
      events.push({
        date: c.closed_at,
        kind: "caso",
        label: "Caso cerrado",
        detail: c.close_reason ?? undefined,
      });
    }
  }
  for (const d of derivaciones) {
    events.push({
      date: d.derivation_date,
      kind: "derivación",
      label: `Derivación: ${d.motivo}`,
      detail: d.derivador_nombre,
    });
  }
  for (const a of aplicaciones) {
    events.push({
      date: a.started_at,
      kind: "encuesta",
      label: `Aplicación de encuesta (${a.year})`,
      detail: a.status,
    });
  }
  return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function loadFicha(studentId: string, role: string): Promise<Ficha> {
  const supabase = createClient();

  const studentRes = await supabase
    .from("estudiantes")
    .select(
      "id, first_names, last_names, document_type, document_number, birth_date, birth_place, address, district, phone, email"
    )
    .eq("id", studentId)
    .maybeSingle();
  if (studentRes.error) throw studentRes.error;
  if (!studentRes.data) throw new Error("Estudiante no encontrado");
  const student = studentRes.data as unknown as StudentRow;

  const [periodsRes, familiaRes, casosRes, derivRes, aplicRes, activeRes] =
    await Promise.all([
      supabase.rpc("get_student_periods", { p_student_id: studentId }),
      supabase
        .from("familiares")
        .select(
          "id, type, full_name, document_type, document_number, phone, email, relationship"
        )
        .eq("student_id", studentId)
        .order("type"),
      supabase
        .from("casos")
        .select("id, situation, estado, opened_at, closed_at, close_reason")
        .eq("student_id", studentId)
        .order("opened_at", { ascending: false }),
      supabase
        .from("derivaciones")
        .select(
          "id, derivation_date, motivo, resumen, caso_id, derivador_nombre, derivador_cargo"
        )
        .eq("student_id", studentId)
        .order("derivation_date", { ascending: false }),
      supabase
        .from("encuesta_aplicaciones")
        .select(
          "id, status, year, section_name, started_at, ends_at, extended_at, progress, version_id(version_number, encuestas(title))"
        )
        .eq("respondent_student_id", studentId)
        .order("started_at", { ascending: false }),
      supabase
        .from("periodos_escolares")
        .select(
          "id, institution_id, school_year, nivel_id, grado_id, section, start_date"
        )
        .eq("student_id", studentId)
        .is("end_date", null)
        .maybeSingle(),
    ]);

  const periods = (periodsRes.data ?? []) as unknown as PeriodItem[];
  const casos = (casosRes.data ?? []) as unknown as CasoItem[];
  const derivaciones = (derivRes.data ?? []) as unknown as ReferralItem[];
  const aplicaciones = (aplicRes.data ?? []) as unknown as SurveyApp[];
  const activePeriod = (activeRes.data ?? null) as ActivePeriod | null;

  // Necesidades: tabla clínica solo G/P; docente usa vista segura (solo orientación).
  let necesidades: NeedItem[] = [];
  if (role === "global" || role === "psicologo") {
    const { data, error } = await supabase
      .from("necesidades_especiales")
      .select(
        "id, student_id, condition_type, clinical_description, teacher_orientation, certifying_entity, certification_date"
      )
      .eq("student_id", studentId);
    if (!error) necesidades = (data ?? []) as unknown as NeedItem[];
  } else if (role === "docente") {
    const { data, error } = await supabase
      .from("v_necesidades_docente")
      .select("id, student_id, teacher_orientation")
      .eq("student_id", studentId);
    if (!error) necesidades = (data ?? []) as unknown as NeedItem[];
  }

  let atencionesCount = 0;
  const casoIds = casos.map((c) => c.id);
  if (casoIds.length > 0) {
    const { count, error } = await supabase
      .from("atenciones")
      .select("id", { count: "exact", head: true })
      .in("caso_id", casoIds);
    if (!error) atencionesCount = count ?? 0;
  }

  return {
    student,
    periods,
    activePeriod,
    family: (familiaRes.data ?? []) as unknown as FamilyMember[],
    casos,
    derivaciones,
    necesidades,
    aplicaciones,
    atencionesCount,
  };
}

export default function EstudianteFichaPage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const router = useRouter();
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("resumen");
  const [openAction, setOpenAction] = useState<PeriodAction>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (profileLoading || !role || !studentId) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    loadFicha(studentId, role)
      .then((data) => {
        if (!cancelled) setFicha(data);
      })
      .catch((err) => {
        logClientError("estudiantes.ficha.load", err);
        if (!cancelled) setError(toUserMessage(err, "No se pudo cargar la ficha"));
      })
      .finally(() => {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [profileLoading, role, studentId, reloadToken]);

  const canEdit = can(role, "estudiantes.editar");
  const canPeriods = can(role, "estudiantes.periodos");
  const canFamily = can(role, "estudiantes.familia");
  const canNeedConsult =
    can(role, "necesidades.consultar") || can(role, "necesidades.orientacion");

  const tabs = useMemo(() => {
    if (!ficha) return [];
    const abiertos = ficha.casos.filter((c) => c.estado !== "cerrado").length;
    const list = [
      { id: "resumen", label: "Resumen" },
      { id: "datos", label: "Datos" },
      { id: "familia", label: "Familia" },
      { id: "periodos", label: "Períodos", count: ficha.periods.length },
      { id: "casos", label: "Casos", count: abiertos || ficha.casos.length },
      { id: "derivaciones", label: "Derivaciones", count: ficha.derivaciones.length },
    ];
    if (canNeedConsult) {
      list.push({ id: "necesidad", label: "Necesidad especial" });
    }
    list.push({ id: "encuestas", label: "Encuestas", count: ficha.aplicaciones.length });
    list.push({ id: "documentos", label: "Documentos" });
    list.push({ id: "historial", label: "Historial" });
    return list;
  }, [ficha, canNeedConsult]);

  if (profileLoading || loading) {
    return <LoadingScreen label="Cargando ficha del estudiante..." />;
  }

  if (!profile) {
    return (
      <RestrictedAccess message="Debe iniciar sesión para ver la ficha del estudiante." />
    );
  }

  if (error) {
    return <ErrorBanner>{error}</ErrorBanner>;
  }

  if (!ficha) {
    return <SkeletonList rows={6} />;
  }

  const { student, periods, activePeriod, family, casos, derivaciones, necesidades, aplicaciones } = ficha;
  const estado = estadoEstudiante(periods);
  const activePeriodItem = periods.find((p) => p.is_active) ?? null;
  const casoAbierto = casos.find((c) => c.estado !== "cerrado");
  const fullNeed = role === "global" || role === "psicologo";
  const history = historyFrom(periods, casos, derivaciones, aplicaciones);

  return (
    <div className="space-y-6">
      {/* Cabecera EST-04 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar
            name={`${student.first_names} ${student.last_names}`}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold text-ink">
              {student.first_names} {student.last_names}
            </h1>
            <p className="text-sm text-ink-muted">
              {student.document_type} {student.document_number} · {edad(student.birth_date)}
              {activePeriodItem
                ? ` · ${activePeriodItem.grado_name} ${activePeriodItem.section} · ${activePeriodItem.institution_name ?? ""}`
                : " · Sin período activo"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={ESTADO_TONES[estado] ?? "slate"}>{estado}</Badge>
              {casoAbierto && (
                <Badge tone="amber">caso {casoAbierto.estado.replace("_", " ")}</Badge>
              )}
              {fullNeed && necesidades.length > 0 && (
                <Badge tone="indigo">necesidad especial</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={buttonClass("primary", "md")}
            >
              Editar
            </button>
          )}
          {canPeriods && (
            <>
              <button
                type="button"
                disabled={!activePeriod || openAction !== null}
                onClick={() => setOpenAction("cambio")}
                className={buttonClass("secondary", "md")}
              >
                Cambiar de sección
              </button>
              <button
                type="button"
                disabled={!activePeriod || openAction !== null}
                onClick={() => setOpenAction("retiro")}
                className={buttonClass("secondary", "md")}
              >
                Retirar
              </button>
              <button
                type="button"
                disabled={!!activePeriod || openAction !== null}
                onClick={() => setOpenAction("retorno")}
                className={buttonClass("secondary", "md")}
              >
                Registrar retorno
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setTab("documentos")}
            className={buttonClass("ghost", "md")}
          >
            Subir documento
          </button>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div role="tabpanel" className="min-h-64">
        {tab === "resumen" && (
          <SummaryTab
            student={student}
            activePeriod={activePeriodItem}
            periods={periods}
            casos={casos}
            derivaciones={derivaciones}
            aplicaciones={aplicaciones}
            necesidades={necesidades}
            atencionesCount={ficha.atencionesCount}
          />
        )}

        {tab === "datos" && (
          <DataTab student={student} canEdit={canEdit} onEdit={() => setDrawerOpen(true)} />
        )}

        {tab === "familia" && (
          <FamilyTab
            studentId={studentId}
            family={family}
            canManage={canFamily}
            onChanged={refresh}
          />
        )}

        {tab === "periodos" && (
          <PeriodsTab
            periods={periods}
            activePeriodRaw={activePeriod}
            canManage={canPeriods}
            openAction={openAction}
            onOpenAction={setOpenAction}
          />
        )}

        {tab === "casos" && (
          <CasesTab
            casos={casos}
            canCreate={can(role, "casos.gestionar")}
            onCreate={() => setNewCaseOpen(true)}
          />
        )}
        {tab === "derivaciones" && (
          <ReferralsTab
            derivaciones={derivaciones}
            studentId={studentId}
            canCreate={can(role, "derivaciones.crear")}
          />
        )}

        {tab === "necesidad" && (
          <SpecialNeedTab
            necesidades={necesidades}
            full={fullNeed}
            studentId={studentId}
            canManage={can(role, "necesidades.gestionar")}
            onChanged={refresh}
          />
        )}

        {tab === "encuestas" && <SurveysTab aplicaciones={aplicaciones} />}
        {tab === "documentos" && <DocumentsTab studentId={studentId} />}
        {tab === "historial" && <HistoryTab events={history} />}
      </div>

      {canPeriods && (
        <PeriodActions
          studentId={studentId}
          profile={{
            role: profile.role,
            institution_id: profile.institution_id,
          }}
          activePeriod={activePeriod}
          open={openAction}
          onClose={() => setOpenAction(null)}
          onChanged={() => {
            setOpenAction(null);
            refresh();
          }}
        />
      )}

      <Modal
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        title="Nuevo caso"
        size="lg"
      >
        <CaseCreateForm
          studentId={studentId}
          currentUserId={profile.user_id}
          isPsychologist={profile.role === "psicologo"}
          onCreated={(caseId) => {
            setNewCaseOpen(false);
            router.push(`/casos/${caseId}?nueva=1`);
          }}
          onCancel={() => setNewCaseOpen(false)}
        />
      </Modal>

      <EditStudentDrawer
        student={student}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setDrawerOpen(false);
          refresh();
        }}
      />

      {!canEdit && (
        <Card>
          <p className="text-xs text-ink-muted">
            Su rol puede consultar la ficha; la edición de datos corresponde a Global,
            Director, Admin I.E. y Coordinador.
          </p>
        </Card>
      )}
    </div>
  );
}
