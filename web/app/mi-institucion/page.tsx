"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { LicenseAlert } from "@/components/licencias/LicenseAlert";
import {
  ESTADO_LICENCIA,
  HOY_ISO,
  daysUntil,
  estadoDeGrupo,
  fmtFecha,
} from "@/lib/licencias";
import type { Tables } from "@/types/supabase";

type Institution = Tables<"institutions">;

type NivelRow = {
  id: string;
  name: string;
  order_number: number;
  grados: { name: string; order_number: number }[] | null;
};

type LicenciaRow = {
  id: string;
  start_date: string;
  end_date: string;
  licencia_codigos: { code: string }[] | null;
};

export default function MiInstitucionPage() {
  const { profile, loading } = useUser();
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [niveles, setNiveles] = useState<NivelRow[]>([]);
  const [licencias, setLicencias] = useState<LicenciaRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const institutionId = profile?.institution_id ?? null;
  const allowed =
    profile?.role === "global" ||
    profile?.role === "director" ||
    profile?.role === "admin_ie";

  useEffect(() => {
    if (!allowed || !institutionId) {
      return;
    }
    let cancelled = false;
    let raf = 0;

    raf = requestAnimationFrame(async () => {
      try {
        const supabase = createClient();
        const [inst, niv, lic] = await Promise.all([
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
            .select("id, start_date, end_date, licencia_codigos(code)")
            .eq("institution_id", institutionId)
            .order("end_date", { ascending: false }),
        ]);
        if (cancelled) return;
        setInstitution((inst.data as Institution) ?? null);
        setNiveles((niv.data ?? []) as unknown as NivelRow[]);
        setLicencias((lic.data ?? []) as LicenciaRow[]);
      } catch {
        if (!cancelled) {
          setInstitution(null);
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [allowed, institutionId]);

  if (loading || (loadingData && allowed && institutionId)) {
    return <LoadingScreen />;
  }

  if (!profile || !allowed) {
    return (
      <RestrictedAccess message="Solo Directores y Administradores pueden ver su institución." />
    );
  }

  if (!institutionId || !institution) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Mi institución"
          subtitle="Datos de la institución asignada a tu perfil."
        />
        <EmptyState
          title="Sin institución asignada"
          description="Tu perfil no tiene una institución educativa vinculada. Contacta al rol Global."
        />
      </div>
    );
  }

  const estado = estadoDeGrupo(licencias);
  const estadoInfo = ESTADO_LICENCIA[estado];
  const cobertura = licencias.find(
    (l) => l.start_date <= HOY_ISO && l.end_date >= HOY_ISO
  );
  const proxima = licencias.find((l) => l.start_date > HOY_ISO);
  const dias = cobertura ? daysUntil(cobertura.end_date) : null;

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(institution.code);
      toast.success("Código modular copiado");
    } catch {
      toast.error("No se pudo copiar el código");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Mi institución"
        subtitle="Datos, niveles y licencia de tu institución educativa."
      />

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {institution.name}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Registrada el {fmtFecha(institution.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm font-semibold text-slate-700">
              {institution.code}
            </span>
            <Button size="sm" variant="secondary" onClick={copiarCodigo}>
              Copiar
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          El código modular es el que usan los docentes para registrarse en la
          plataforma.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Licencia
            </h3>
            <Badge
              tone={
                estado === "vigente"
                  ? "green"
                  : estado === "por_vencer"
                    ? "amber"
                    : estado === "vencida"
                      ? "red"
                      : "indigo"
              }
            >
              {estadoInfo.label}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-ink">
            {cobertura ? (
              <>
                {fmtFecha(cobertura.start_date)} → {fmtFecha(cobertura.end_date)}
                {dias !== null && (
                  <span className="ml-2 text-ink-muted">
                    ({dias} día(s) restantes)
                  </span>
                )}
              </>
            ) : proxima ? (
              <>
                Próxima vigencia: {fmtFecha(proxima.start_date)} →{" "}
                {fmtFecha(proxima.end_date)}
              </>
            ) : (
              <span className="text-ink-muted">
                Sin licencia registrada: las nuevas atenciones están
                bloqueadas.
              </span>
            )}
          </p>
          <div className="mt-4">
            <LicenseAlert institutionId={institution.id} />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Niveles habilitados
          </h3>
          {niveles.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Sin niveles configurados. Solicita la creación de la estructura
              académica al rol Global.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {niveles.map((nivel) => (
                <li key={nivel.id}>
                  <p className="font-medium text-ink">{nivel.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(nivel.grados ?? [])
                      .sort((a, b) => a.order_number - b.order_number)
                      .map((g, i) => (
                        <span
                          key={`${nivel.id}-${g.name}`}
                          className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {i + 1}.º {g.name}
                        </span>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
