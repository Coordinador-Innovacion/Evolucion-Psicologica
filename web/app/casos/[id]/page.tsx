"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CaseStatusBadge } from "@/components/casos/CaseStatusBadge";
import { CaseActions } from "@/components/casos/CaseActions";
import { AttentionEditor } from "@/components/casos/AttentionEditor";
import { NewAttentionForm } from "@/components/casos/NewAttentionForm";
import { ResponsibleHistory } from "@/components/casos/ResponsibleHistory";
import {
  StudentDocumentsPanel,
  canAccessDocuments,
} from "@/components/documentos/StudentDocumentsPanel";
import { useUser } from "@/hooks/useUser";
import { LoadingScreen } from "@/components/ui/feedback";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { Caso, Atencion, Derivacion } from "@/types/database";
import type { CasoEstado } from "@/types/supabase";

interface CaseWithDetails extends Caso {
  estudiantes?: {
    first_names: string;
    last_names: string;
    document_number: string;
  };
  atenciones?: Atencion[];
}

const STATE_STEPS: { estado: CasoEstado; label: string }[] = [
  { estado: "inicio", label: "Inicio" },
  { estado: "en_proceso", label: "En proceso" },
  { estado: "cerrado", label: "Cerrado" },
];

function StateFlow({ estado }: { estado: CasoEstado }) {
  const currentIndex = STATE_STEPS.findIndex((s) => s.estado === estado);
  return (
    <ol className="flex items-center gap-2 mt-4">
      {STATE_STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = index < currentIndex;
        return (
          <li key={step.estado} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isCurrent
                  ? "bg-indigo-600 text-white"
                  : isDone
                    ? "bg-indigo-100 text-indigo-800"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {step.label}
            </span>
            {index < STATE_STEPS.length - 1 && (
              <span className="text-slate-300" aria-hidden="true">
                &rarr;
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AttentionDetails({ attention }: { attention: Atencion }) {
  return (
    <div className="space-y-2 text-sm text-slate-700">
      <p>
        <span className="font-medium">Motivo:</span> {attention.motivo}
      </p>
      <p>
        <span className="font-medium">Qué se hizo:</span> {attention.que_se_hizo}
      </p>
      {attention.observaciones && (
        <p>
          <span className="font-medium">Observaciones:</span> {attention.observaciones}
        </p>
      )}
      {attention.compromisos && (
        <p>
          <span className="font-medium">Compromisos:</span> {attention.compromisos}
        </p>
      )}
      {attention.proxima_atencion && (
        <p>
          <span className="font-medium">Próxima atención:</span>{" "}
          {new Date(attention.proxima_atencion).toLocaleString("es-PE")}
        </p>
      )}
      <p className="text-xs text-slate-400">
        Esta atención es de solo lectura para su rol.
      </p>
    </div>
  );
}

export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile, loading: profileLoading } = useUser();
  const [caso, setCaso] = useState<CaseWithDetails | null>(null);
  const [derivacion, setDerivacion] = useState<Derivacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAttention, setSelectedAttention] = useState<Atencion | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const canManage = profile?.role === "global" || profile?.role === "psicologo";

  const reload = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();

      const { data, error: fetchError } = await supabase
        .from("casos")
        .select(`
          *,
          estudiantes(first_names, last_names, document_number),
          atenciones(*)
        `)
        .eq("id", id)
        .single();

      if (cancelled) return;

      if (fetchError) {
        logClientError("caso.load", fetchError);
        setError(toUserMessage(fetchError, "Error al cargar el caso"));
        setLoading(false);
        return;
      }

      const casoData = data as CaseWithDetails;
      setCaso(casoData);
      setError(null);

      if (casoData.derivation_id) {
        const { data: deriv } = await supabase
          .from("derivaciones")
          .select("*")
          .eq("id", casoData.derivation_id)
          .maybeSingle();
        if (cancelled) return;
        setDerivacion((deriv as Derivacion) ?? null);
      } else {
        setDerivacion(null);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, reloadVersion]);

  if (loading || profileLoading) {
    return <LoadingScreen label="Cargando caso..." />;
  }

  if (error || !caso) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Error</h2>
          <p className="mt-2 text-sm text-slate-500">
            {error || "Caso no encontrado"}
          </p>
          <Link
            href="/casos"
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Volver a casos
          </Link>
        </div>
      </div>
    );
  }

  const estado = caso.estado as CasoEstado;
  const atenciones = caso.atenciones ?? [];
  const sortedAtenciones = [...atenciones].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Información del caso */}
      <div className="rounded-xl border border-line bg-white p-6 shadow-card">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Caso — {caso.estudiantes?.first_names} {caso.estudiantes?.last_names}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                DNI: {caso.estudiantes?.document_number}
              </p>
            </div>
            <CaseStatusBadge estado={estado} />
          </div>

          <StateFlow estado={estado} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-6">
            <div>
              <span className="font-medium text-slate-700">Situación:</span>
              <p className="text-slate-600 mt-1">{caso.situation}</p>
            </div>
            <div>
              <span className="font-medium text-slate-700">Apertura:</span>
              <p className="text-slate-600 mt-1">
                {new Date(caso.opened_at).toLocaleString("es-PE")}
              </p>
            </div>
            {caso.closed_at && (
              <div>
                <span className="font-medium text-slate-700">Cierre:</span>
                <p className="text-slate-600 mt-1">
                  {new Date(caso.closed_at).toLocaleString("es-PE")}
                </p>
              </div>
            )}
            {caso.close_reason && (
              <div className="sm:col-span-2">
                <span className="font-medium text-slate-700">Motivo de cierre:</span>
                <p className="text-slate-600 mt-1">{caso.close_reason}</p>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <CaseActions
              caseId={caso.id}
              estado={estado}
              canManage={canManage}
              onStateChanged={reload}
            />
          </div>
        </div>

        {/* Derivación vinculada (opcional) */}
        {derivacion && (
          <div className="rounded-xl border border-line bg-white p-6 shadow-card">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              Derivación vinculada
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-slate-700">Fecha:</span>
                <p className="text-slate-600 mt-1">
                  {new Date(derivacion.derivation_date).toLocaleDateString("es-PE")}
                </p>
              </div>
              <div>
                <span className="font-medium text-slate-700">Derivador:</span>
                <p className="text-slate-600 mt-1">
                  {derivacion.derivador_nombre} — {derivacion.derivador_cargo}
                </p>
              </div>
              <div className="sm:col-span-2">
                <span className="font-medium text-slate-700">Motivo:</span>
                <p className="text-slate-600 mt-1">{derivacion.motivo}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              La derivación es un registro histórico: enlazarla no crea un segundo caso.
            </p>
          </div>
        )}

        {/* Atenciones */}
        <div className="rounded-xl border border-line bg-white p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Atenciones ({atenciones.length})
            </h2>
          </div>

          {canManage && estado !== "cerrado" && (
            <div className="mb-6">
              <NewAttentionForm caseId={caso.id} onCreated={reload} />
            </div>
          )}

          {canManage && estado === "cerrado" && (
            <p className="mb-4 text-sm text-slate-500">
              El caso está cerrado: no se pueden registrar nuevas atenciones. Reabre el
              caso para continuar.
            </p>
          )}

          {sortedAtenciones.length === 0 ? (
            <p className="text-sm text-slate-500">
              Este caso no tiene atenciones registradas.
            </p>
          ) : (
            <div className="space-y-4">
              {sortedAtenciones.map((atencion) => (
                <div
                  key={atencion.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedAttention?.id === atencion.id
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() =>
                    setSelectedAttention(
                      selectedAttention?.id === atencion.id ? null : atencion
                    )
                  }
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {atencion.motivo}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(atencion.created_at).toLocaleString("es-PE")}
                        {atencion.edited_at && (
                          <span className="ml-2 text-amber-600">
                            (editada)
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {selectedAttention?.id === atencion.id ? "▲" : "▼"}
                    </span>
                  </div>

                  {selectedAttention?.id === atencion.id && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      {canManage ? (
                        <AttentionEditor
                          attention={atencion}
                          onUpdated={reload}
                        />
                      ) : (
                        <AttentionDetails attention={atencion} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historial de responsables */}
        <div className="rounded-xl border border-line bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Responsables
          </h2>
          <ResponsibleHistory
            caseId={caso.id}
            currentResponsibleId={caso.current_responsible_id}
          />
        </div>

        {/* Documentos del estudiante (T53) */}
        {canAccessDocuments(profile?.role) && (
          <div className="rounded-xl border border-line bg-white p-6 shadow-card">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Documentos del estudiante
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Los documentos pertenecen al estudiante. La descarga genera un
              enlace temporal; no se almacena ninguna referencia permanente.
            </p>
            <StudentDocumentsPanel studentId={caso.student_id} />
          </div>
        )}
    </div>
  );
}
