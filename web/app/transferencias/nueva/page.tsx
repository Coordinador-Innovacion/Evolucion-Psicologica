"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { toast } from "sonner";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner, LoadingScreen, RestrictedAccess, Spinner } from "@/components/ui/feedback";

type NivelRow = {
  id: string;
  name: string;
  institution_id: string;
  institutions: { name: string } | null;
  grados: { id: string; name: string; order_number: number }[];
};

type StudentHit = {
  student_id: string;
  full_name: string;
  document_type: string;
  document_number: string;
  birth_date: string | null;
};

type TransferableCase = {
  caso_id: string;
  situation: string;
  estado: string;
  created_at: string;
};

type Lookup = {
  student_id: string;
  student_name: string;
  document_number: string;
  origin_institution_id: string;
  origin_institution_name: string;
  cases: TransferableCase[];
};

const SECTION_OPTIONS = ["A", "B", "U"];

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * TRF-02 — B (destino) solicita transferencia: identifica estudiante por DNI
 * (check_student_duplicates_by_dni), localiza el caso y la I.E. origen
 * (find_transferable_case, datos mínimos sin contenido clínico), fija
 * nivel/grado/sección destino (obligatorios) y confirma. Estado resultante
 * `pending`, sin efecto en A.
 */
export default function NuevaTransferenciaPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const myInst = profile?.institution_id ?? null;

  const [niveles, setNiveles] = useState<NivelRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [docType, setDocType] = useState("DNI");
  const [dni, setDni] = useState("");
  const [searching, setSearching] = useState(false);
  const [students, setStudents] = useState<StudentHit[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentHit | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const [nivelId, setNivelId] = useState("");
  const [gradoId, setGradoId] = useState("");
  const [section, setSection] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!can(role, "transferencias.solicitar")) return;
    if (!isGlobal && !myInst) return;

    let cancelled = false;
    const raf = requestAnimationFrame(async () => {
      if (cancelled) return;
      setCatalogLoading(true);
      try {
        const supabase = createClient();
        let query = supabase
          .from("niveles_educativos")
          .select(
            "id, name, institution_id, institutions(name), grados(id, name, order_number)"
          )
          .order("order_number");
        if (!isGlobal) query = query.eq("institution_id", myInst as string);
        const { data, error: fetchError } = await query;
        if (cancelled) return;
        if (fetchError) throw fetchError;
        const rows = ((data ?? []) as unknown as NivelRow[]).map((row) => ({
          ...row,
          grados: [...(row.grados ?? [])].sort(
            (a, b) => a.order_number - b.order_number
          ),
        }));
        setNiveles(rows);
      } catch (err) {
        if (cancelled) return;
        logClientError("transferencias.nueva.catalog", err);
        setError(toUserMessage(err, "Error al cargar la estructura académica"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setCatalogLoading(false);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [profileLoading, role, isGlobal, myInst]);

  const searchStudents = async () => {
    const q = dni.trim();
    if (q.length < 3) {
      setError("Ingresa al menos 3 caracteres del documento.");
      return;
    }
    setSearching(true);
    setError(null);
    setSelectedStudent(null);
    setLookup(null);
    setSelectedCaseId(null);
    setStudents([]);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "check_student_duplicates_by_dni",
        {
          p_document_type: docType,
          p_document_number: q,
        }
      );
      if (rpcError) throw rpcError;
      const rows = (data ?? []) as unknown as StudentHit[];
      if (rows.length === 0) {
        setError("No encontramos estudiantes con ese documento.");
        return;
      }
      setStudents(rows);
      if (rows.length === 1) {
        await selectStudent(rows[0]);
      }
    } catch (err) {
      logClientError("transferencias.nueva.search", err);
      setError(toUserMessage(err, "Error al buscar estudiantes"));
    } finally {
      setSearching(false);
    }
  };

  const selectStudent = async (student: StudentHit) => {
    setSelectedStudent(student);
    setLookup(null);
    setSelectedCaseId(null);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "find_transferable_case",
        { p_student_id: student.student_id }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        setError(data?.error ?? "No se pudo identificar el caso del estudiante.");
        return;
      }
      const result = data as unknown as Lookup;
      if (result.cases.length === 0) {
        setError("El estudiante no tiene casos registrados para transferir.");
        return;
      }
      setLookup(result);
    } catch (err) {
      logClientError("transferencias.nueva.lookup", err);
      setError(toUserMessage(err, "Error al identificar el caso del estudiante"));
    }
  };

  // Para Global el destino se infiere del nivel/grado: excluye la I.E. origen.
  const destinoNiveles = niveles.filter(
    (n) => !lookup || !isGlobal || n.institution_id !== lookup.origin_institution_id
  );
  const nivelSel = destinoNiveles.find((n) => n.id === nivelId) ?? null;
  const gradoSel = nivelSel?.grados.find((g) => g.id === gradoId) ?? null;
  const destinoNombre = nivelSel?.institutions?.name ?? (isGlobal ? "" : "Mi institución");
  const caseSel = lookup?.cases.find((c) => c.caso_id === selectedCaseId) ?? null;

  const valid =
    Boolean(lookup && selectedCaseId && nivelId && gradoId && section) &&
    Boolean(isGlobal ? nivelSel : myInst);

  const submit = async () => {
    if (!lookup || !selectedCaseId || !nivelId || !gradoId || !section) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("initiate_transfer", {
        p_caso_id: selectedCaseId,
        p_origin_institution_id: lookup.origin_institution_id,
        p_destination_nivel_id: nivelId,
        p_destination_grado_id: gradoId,
        p_section: section,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) {
        const serverError = String(data?.error ?? "");
        const message = serverError.includes(
          "Ya existe una transferencia activa para este caso"
        )
          ? "Ya existe una solicitud pendiente para este caso."
          : serverError || "Error al solicitar la transferencia";
        setError(message);
        setConfirmOpen(false);
        return;
      }
      toast.success("Solicitud de transferencia creada");
      const transferId = (data as unknown as { transfer_id: string }).transfer_id;
      router.push(`/transferencias/${transferId}`);
    } catch (err) {
      logClientError("transferencias.nueva.submit", err);
      setError(toUserMessage(err, "Error al solicitar la transferencia"));
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (profileLoading) return <LoadingScreen label="Cargando perfil..." />;

  if (!can(role, "transferencias.solicitar")) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="No tiene permiso para solicitar transferencias." />
      </div>
    );
  }

  if (!isGlobal && !myInst) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="Usuario sin institución asignada." />
      </div>
    );
  }

  if (catalogLoading) return <LoadingScreen label="Cargando estructura académica..." />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Nueva transferencia"
        subtitle="B (destino) solicita → A (origen) autoriza. La solicitud queda en estado pendiente y no tiene efecto en A."
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Transferencias", href: "/transferencias" },
          { label: "Nueva transferencia" },
        ]}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* 1. Identificar estudiante (datos mínimos) */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">1 · Identificar estudiante</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Se muestran solo datos mínimos (nombre y documento), sin contenido clínico.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
          <Field label="Tipo de documento">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className={selectClasses}
            >
              <option value="DNI">DNI</option>
              <option value="CE">Carné de extranjería</option>
            </select>
          </Field>
          <Field label="Número de documento">
            <input
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void searchStudents();
              }}
              placeholder="Ej. 12345678"
              className={inputClasses}
            />
          </Field>
          <button
            type="button"
            onClick={() => void searchStudents()}
            disabled={searching}
            className={buttonClass("secondary", "md")}
          >
            {searching ? <Spinner className="h-4 w-4" /> : null}
            Buscar
          </button>
        </div>

        {students.length > 1 && (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {students.map((s) => (
              <li key={s.student_id}>
                <button
                  type="button"
                  onClick={() => void selectStudent(s)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                    selectedStudent?.student_id === s.student_id ? "bg-indigo-50" : ""
                  }`}
                >
                  <span className="font-medium text-ink">{s.full_name}</span>
                  <span className="text-xs text-ink-muted">
                    {s.document_type} {s.document_number}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedStudent && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold text-ink">{selectedStudent.full_name}</p>
            <p className="text-xs text-ink-muted">
              {selectedStudent.document_type} {selectedStudent.document_number}
            </p>
          </div>
        )}
      </section>

      {/* 2. Caso + I.E. origen */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">2 · Caso e I.E. de origen</h2>
        {!lookup && (
          <p className="mt-3 text-sm text-ink-muted">
            Busca y selecciona al estudiante para identificar su caso y la institución
            de origen.
          </p>
        )}
        {lookup && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="indigo">I.E. de origen</Badge>
              <span className="text-sm font-medium text-ink">
                {lookup.origin_institution_name}
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {lookup.cases.map((c) => (
                <li key={c.caso_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCaseId(c.caso_id)}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      selectedCaseId === c.caso_id
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-line hover:border-indigo-300"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {c.situation}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        Caso {c.caso_id.slice(0, 8)} · abierto {fmtDate(c.created_at)}
                      </span>
                    </span>
                    <StatusPill tone={c.estado === "cerrado" ? "green" : "amber"}>
                      {c.estado === "inicio"
                        ? "Inicio"
                        : c.estado === "en_proceso"
                          ? "En proceso"
                          : "Cerrado"}
                    </StatusPill>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 3. Destino obligatorio */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">
          3 · Destino (nivel, grado y sección — obligatorios)
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Nivel destino">
            <select
              value={nivelId}
              onChange={(e) => {
                setNivelId(e.target.value);
                setGradoId("");
              }}
              className={selectClasses}
            >
              <option value="">Seleccionar nivel...</option>
              {destinoNiveles.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                  {isGlobal ? ` — ${n.institutions?.name ?? ""}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grado destino">
            <select
              value={gradoId}
              onChange={(e) => setGradoId(e.target.value)}
              disabled={!nivelId}
              className={selectClasses}
            >
              <option value="">Seleccionar grado...</option>
              {nivelSel?.grados.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sección destino">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              disabled={!gradoId}
              className={selectClasses}
            >
              <option value="">Seleccionar sección...</option>
              {SECTION_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {isGlobal && nivelSel && (
          <p className="mt-3 text-xs text-ink-muted">
            Institución destino (inferida del nivel/grado): {destinoNombre}
          </p>
        )}
      </section>

      <div className="flex items-center justify-between">
        <Link href="/transferencias" className={buttonClass("ghost", "md")}>
          Cancelar
        </Link>
        <button
          type="button"
          disabled={!valid}
          onClick={() => setConfirmOpen(true)}
          className={buttonClass("primary", "md")}
        >
          Continuar
        </button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar solicitud de transferencia"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className={buttonClass("primary", "md")}
            >
              {submitting ? "Solicitando..." : "Confirmar solicitud"}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Estudiante
            </p>
            <p className="font-medium text-ink">{selectedStudent?.full_name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Caso
            </p>
            <p className="font-medium text-ink">{caseSel?.situation}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                I.E. origen
              </p>
              <p className="font-medium text-ink">{lookup?.origin_institution_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                I.E. destino
              </p>
              <p className="font-medium text-ink">
                {destinoNombre || "—"}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Destino
            </p>
            <p className="font-medium text-ink">
              {nivelSel?.name} · {gradoSel?.name} · Sección {section}
            </p>
          </div>
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            La solicitud quedará en estado <strong>pendiente</strong> y no producirá
            ningún efecto en la institución origen hasta que A (origen) la autorice.
          </p>
        </div>
      </Modal>
    </div>
  );
}
