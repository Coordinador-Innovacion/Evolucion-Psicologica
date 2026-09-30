"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Card } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { LicenseFormModal } from "@/components/licencias/LicenseFormModal";
import { ExpiringLicensesPanel } from "@/components/licencias/ExpiringLicensesPanel";
import {
  ESTADO_LICENCIA,
  HOY_ISO,
  daysUntil,
  estadoDeGrupo,
  fmtFecha,
  nextDayISO,
} from "@/lib/licencias";
import type { Tables } from "@/types/supabase";

type Institution = Tables<"institutions">;

type LicenciaRow = {
  id: string;
  institution_id: string;
  start_date: string;
  end_date: string;
  created_at: string;
  institutions: { name: string; code: string } | null;
  licencia_codigos: { code: string }[] | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  vigente: "green",
  por_vencer: "amber",
  vencida: "red",
  futura: "slate",
  sin_licencia: "indigo",
};

const ESTADOS = [
  { value: "todas", label: "Todas" },
  { value: "futura", label: "Futura" },
  { value: "vigente", label: "Vigente" },
  { value: "por_vencer", label: "Por vencer (≤30 d)" },
  { value: "vencida", label: "Vencida" },
];

export default function LicenciasPage() {
  const { profile, loading } = useUser();
  const [licencias, setLicencias] = useState<LicenciaRow[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [reload, setReload] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todas");

  const [modalOpen, setModalOpen] = useState(false);
  const [renovar, setRenovar] = useState<LicenciaRow | null>(null);

  const refresh = useCallback(() => setReload((v) => v + 1), []);

  useEffect(() => {
    if (!profile || profile.role !== "global") return;
    let cancelled = false;
    let raf = 0;

    raf = requestAnimationFrame(async () => {
      try {
        const supabase = createClient();
        const [lic, inst] = await Promise.all([
          supabase
            .from("licencias")
            .select(
              "id, institution_id, start_date, end_date, created_at, institutions(name, code), licencia_codigos(code)"
            )
            .order("end_date", { ascending: true }),
          supabase
            .from("institutions")
            .select("*")
            .order("name", { ascending: true }),
        ]);
        if (cancelled) return;
        if (lic.error) throw lic.error;
        setLicencias((lic.data ?? []) as unknown as LicenciaRow[]);
        setInstitutions((inst.data ?? []) as Institution[]);
        setPageError(null);
      } catch (err) {
        if (!cancelled) {
          logClientError("license.list", err);
          setPageError(toUserMessage(err, "No se pudieron cargar las licencias"));
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [profile, reload]);

  if (loading) return <LoadingScreen />;

  if (!profile || profile.role !== "global") {
    return (
      <RestrictedAccess message="Solo el rol Global puede gestionar licencias." />
    );
  }

  if (loadingData && !pageError) return <LoadingScreen />;

  const query = q.trim().toLowerCase();
  const filtradas = licencias.filter((lic) => {
    const estado = estadoDeGrupo([lic]);
    if (estadoFilter !== "todas" && estado !== estadoFilter) return false;
    if (!query) return true;
    const nombre = (lic.institutions?.name ?? "").toLowerCase();
    const codigo = (lic.institutions?.code ?? "").toLowerCase();
    return nombre.includes(query) || codigo.includes(query);
  });

  const openNuevo = () => {
    setRenovar(null);
    setModalOpen(true);
  };

  const openRenovar = (lic: LicenciaRow) => {
    setRenovar(lic);
    setModalOpen(true);
  };

  const copiarCodigo = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado");
    } catch {
      toast.error("No se pudo copiar el código");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Licencias"
        subtitle="Vigencia de las instituciones y códigos de licencia."
        actions={<Button onClick={openNuevo}>Registrar licencia</Button>}
      />

      {pageError && <ErrorBanner>{pageError}</ErrorBanner>}

      <ExpiringLicensesPanel />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Buscar I.E.">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre o código modular"
              className={inputClasses}
            />
          </Field>
          <Field label="Estado">
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className={selectClasses}
            >
              {ESTADOS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <p className="text-xs text-ink-muted">
              Orden: vencimiento más próximo primero.
            </p>
          </div>
        </div>
      </Card>

      {filtradas.length === 0 ? (
        <EmptyState
          title="Sin licencias"
          description="Registra la primera licencia para habilitar las atenciones."
          action={
            <Button size="sm" onClick={openNuevo}>
              Registrar licencia
            </Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">Institución</th>
                <th className="px-4 py-3 font-medium">Códigos</th>
                <th className="px-4 py-3 font-medium">Inicio</th>
                <th className="px-4 py-3 font-medium">Fin</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtradas.map((lic) => {
                const estado = estadoDeGrupo([lic]);
                const info = ESTADO_LICENCIA[estado];
                const dias =
                  estado === "vigente" || estado === "por_vencer"
                    ? daysUntil(lic.end_date)
                    : null;
                return (
                  <tr key={lic.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        {lic.institutions?.name ?? "—"}
                      </p>
                      <p className="font-mono text-xs text-ink-muted">
                        {lic.institutions?.code ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(lic.licencia_codigos ?? []).map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            title="Copiar código"
                            onClick={() => copiarCodigo(c.code)}
                            className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-700 hover:bg-slate-200"
                          >
                            {c.code}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {fmtFecha(lic.start_date)}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {fmtFecha(lic.end_date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={ESTADO_TONE[estado] ?? "slate"}>
                          {info.label}
                        </Badge>
                        {dias !== null && (
                          <span className="text-xs text-ink-muted">
                            {dias} d
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openRenovar(lic)}
                      >
                        Renovar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-ink-muted">
        Renovar crea un registro nuevo (nunca edita el anterior): el inicio se
        prefija al día siguiente del fin actual. Vigencia de hoy:{" "}
        {fmtFecha(HOY_ISO)}.
      </p>

      <LicenseFormModal
        key={renovar?.id ?? "nueva-licencia"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setRenovar(null);
        }}
        onSaved={refresh}
        institutions={institutions}
        institutionId={renovar?.institution_id ?? null}
        defaultStart={renovar ? nextDayISO(renovar.end_date) : undefined}
      />
    </div>
  );
}
