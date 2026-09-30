"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import { NewAttentionForm } from "@/components/casos/NewAttentionForm";
import { CaseStatusBadge } from "@/components/casos/CaseStatusBadge";
import { logClientError, toUserMessage } from "@/lib/errors";
import type { CasoEstado } from "@/types/supabase";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";

type CaseContext = {
  id: string;
  estado: CasoEstado;
  student_id: string;
  estudiantes: {
    first_names: string;
    last_names: string;
  } | null;
};

type PeriodLite = {
  id: string;
  institution_id: string | null;
  is_active: boolean;
};

export default function NewAttentionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;

  const [caso, setCaso] = useState<CaseContext | null>(null);
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const { license, loading: licenseLoading } = useLicenseStatus(institutionId);

  const reload = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("casos")
          .select(
            `id, estado, student_id,
             estudiantes(first_names, last_names)`
          )
          .eq("id", id)
          .maybeSingle();
        if (cancelled) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setError("Caso no encontrado");
          return;
        }
        const casoData = data as unknown as CaseContext;
        setCaso(casoData);

        const { data: periods } = await supabase.rpc("get_student_periods", {
          p_student_id: casoData.student_id,
        });
        if (cancelled) return;
        const list = (periods ?? []) as PeriodLite[];
        const active = list.find((p) => p.is_active) ?? null;
        setInstitutionId(active?.institution_id ?? profile?.institution_id ?? null);
      } catch (err) {
        if (cancelled) return;
        logClientError("atencion.nueva.load", err);
        setError(toUserMessage(err, "Error al cargar el caso"));
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [id, reloadVersion, profile?.institution_id]);

  const isPrivileged = role === "global" || role === "psicologo";
  const licenseExpired =
    role !== "global" && license?.status === "expired";
  const licenseDisabledReason =
    "Licencia vencida: nuevas atenciones bloqueadas";

  if (loading || profileLoading) {
    return <LoadingScreen label="Cargando..." />;
  }

  if (!isPrivileged) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <RestrictedAccess message="Solo Psicólogo o Global pueden registrar atenciones." />
      </div>
    );
  }

  if (error || !caso) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-ink">Error</h2>
          <p className="mt-2 text-sm text-ink-muted">{error || "Caso no encontrado"}</p>
          <Link href="/casos" className={buttonClass("secondary", "md")}>
            Volver a casos
          </Link>
        </div>
      </div>
    );
  }

  const studentName = caso.estudiantes
    ? `${caso.estudiantes.first_names} ${caso.estudiantes.last_names}`
    : "Estudiante";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Registrar atención"
        subtitle="Fecha y hora las fija el servidor."
        breadcrumbs={[
          { label: "Casos", href: "/casos" },
          { label: caso.id.slice(0, 8), href: `/casos/${caso.id}` },
          { label: "Nueva atención" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        <div>
          <p className="text-sm font-semibold text-ink">{studentName}</p>
          <p className="text-xs text-ink-muted">Caso registrado en esta atención</p>
        </div>
        <div className="flex items-center gap-3">
          <CaseStatusBadge estado={caso.estado} />
          <Link
            href={`/casos/${caso.id}`}
            className={buttonClass("secondary", "sm")}
          >
            Ver caso
          </Link>
        </div>
      </div>

      {caso.estado === "cerrado" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          El caso está cerrado: el servidor rechazará esta atención. Reabra el caso
          para continuar.
        </div>
      )}

      {role !== "global" && !licenseLoading && license && licenseExpired && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {license.message || "Licencia vencida: nuevas atenciones bloqueadas."}
        </div>
      )}

      <NewAttentionForm
        caseId={caso.id}
        showOrigen
        disabled={licenseExpired || caso.estado === "cerrado"}
        disabledReason={
          licenseExpired
            ? licenseDisabledReason
            : "El caso está cerrado: reábralo para registrar atenciones."
        }
        onCreated={(attentionId) => {
          setCreatedId(attentionId ?? null);
          reload();
        }}
      />

      {createdId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <span>Atención registrada correctamente.</span>
          <div className="flex gap-2">
            <Link
              href={`/casos/${caso.id}/atenciones/${createdId}`}
              className={buttonClass("secondary", "sm")}
            >
              Ver atención
            </Link>
            <Link href={`/casos/${caso.id}`} className={buttonClass("secondary", "sm")}>
              Volver al caso
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
