"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useInstitutionScope } from "@/hooks/useInstitutionScope";
import { can } from "@/lib/permissions";
import { logClientError, toUserMessage } from "@/lib/errors";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, selectClasses } from "@/components/ui/field";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
  RestrictedAccess,
} from "@/components/ui/feedback";
import { SkeletonList } from "@/components/ui/skeleton";

type NivelRow = {
  id: string;
  name: string;
  order_number: number;
  institution_id: string;
  institutions: { name: string } | null;
  grados: { id: string; name: string; order_number: number }[];
};

async function loadNiveles(scope: string | null): Promise<NivelRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("niveles_educativos")
    .select(
      "id, name, order_number, institution_id, institutions(name), grados(id, name, order_number)"
    )
    .order("order_number");
  if (scope) query = query.eq("institution_id", scope);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as NivelRow[];
  return rows.map((row) => ({
    ...row,
    grados: [...(row.grados ?? [])].sort((a, b) => a.order_number - b.order_number),
  }));
}

/**
 * ACA-01 — Niveles y grados por I.E.
 * Grados fijos en solo lectura; crea la estructura base (Primaria 1–6,
 * Secundaria 1–5) vía create_academic_structure (idempotente).
 */
export default function AcademicoNivelesPage() {
  const { profile, loading: profileLoading } = useUser();
  const role = profile?.role ?? null;
  const isGlobal = role === "global";
  const scope = useInstitutionScope(profile?.institution_id, isGlobal);

  const [niveles, setNiveles] = useState<NivelRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [instSel, setInstSel] = useState("");
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  const canManage = can(role, "academico.gestionar");

  useEffect(() => {
    if (profileLoading || !role) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) setError(null);
    });
    loadNiveles(scope)
      .then((rows) => {
        if (!cancelled) setNiveles(rows);
      })
      .catch((err) => {
        logClientError("academico.niveles.load", err);
        if (!cancelled) setError(toUserMessage(err, "No se pudo cargar la estructura"));
      })
      .finally(() => cancelAnimationFrame(raf));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [profileLoading, role, scope, reloadToken]);

  useEffect(() => {
    if (!modalOpen || !isGlobal) return;
    let cancelled = false;
    supabaseInstitutions()
      .then((rows) => {
        if (!cancelled) setInstitutions(rows);
      })
      .catch(() => {
        if (!cancelled) setInstitutions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, isGlobal]);

  const openCreate = () => {
    setInstSel(scope ?? "");
    setModalOpen(true);
  };

  const createStructure = async () => {
    if (isGlobal && !instSel) {
      toast.error("Seleccione una institución educativa");
      return;
    }
    setCreating(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_academic_structure", {
        p_institution_id: isGlobal ? instSel : null,
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error ?? "No se pudo crear la estructura");
        return;
      }
      toast.success(data?.message ?? "Estructura académica creada");
      setModalOpen(false);
      refresh();
    } catch (err) {
      logClientError("academico.niveles.create", err);
      toast.error(toUserMessage(err, "No se pudo crear la estructura"));
    }
    setCreating(false);
  };

  if (profileLoading) return <LoadingScreen label="Cargando..." />;
  if (!profile) {
    return <RestrictedAccess message="Debe iniciar sesión para ver la estructura académica." />;
  }
  if (!canManage) {
    return <RestrictedAccess message="Su rol no puede gestionar la estructura académica." />;
  }

  // Agrupar por institución
  const byInstitution = new Map<string, { name: string; niveles: NivelRow[] }>();
  for (const nivel of niveles ?? []) {
    const key = nivel.institution_id;
    const bucket = byInstitution.get(key) ?? {
      name: nivel.institutions?.name ?? "Institución",
      niveles: [],
    };
    bucket.niveles.push(nivel);
    byInstitution.set(key, bucket);
  }

  return (
    <div>
      <PageHeader
        title="Niveles y grados"
        subtitle="Estructura académica por institución educativa"
        breadcrumbs={[
          { label: "Académico", href: "/academico/niveles" },
          { label: "Niveles y grados" },
        ]}
        actions={
          <button type="button" onClick={openCreate} className={buttonClass("primary", "md")}>
            Crear estructura base
          </button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {niveles === null && !error && <SkeletonList rows={5} />}

      {niveles !== null && niveles.length === 0 && (
        <EmptyState
          title="Sin niveles configurados"
          description="Cree la estructura base: Primaria (1.º–6.º) y Secundaria (1.º–5.º)."
          action={
            <button
              type="button"
              onClick={openCreate}
              className={buttonClass("primary", "md")}
            >
              Crear estructura base
            </button>
          }
        />
      )}

      <div className="space-y-6">
        {[...byInstitution.entries()].map(([instId, bucket]) => (
          <section key={instId} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-bold text-ink">{bucket.name}</h2>
              <Badge tone="slate">{bucket.niveles.length} nivel(es)</Badge>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {bucket.niveles.map((nivel) => (
                <div
                  key={nivel.id}
                  className="rounded-2xl border border-line bg-white p-5 shadow-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-ink">{nivel.name}</h3>
                    <Badge tone="indigo">orden {nivel.order_number}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    Grados fijos — solo lectura.
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {nivel.grados.map((grado, index) => (
                      <li
                        key={grado.id}
                        className="rounded-lg border border-line bg-surface px-2.5 py-1 text-sm text-ink"
                        title={grado.name}
                      >
                        {index + 1}.º {grado.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-ink-muted">
        El esquema actual no expone activar/desactivar niveles: se muestran en solo
        lectura. Los grados son fijos por diseño (Primaria 1.º–6.º, Secundaria 1.º–5.º).
      </p>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Crear estructura académica base"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Crea (si no existen) los niveles Primaria y Secundaria con sus grados fijos.
            La operación es idempotente: no duplica niveles existentes.
          </p>
          {isGlobal && (
            <Field label="Institución educativa *">
              <select
                value={instSel}
                onChange={(e) => setInstSel(e.target.value)}
                className={selectClasses}
              >
                <option value="">Seleccione…</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createStructure}
              disabled={creating}
              className={buttonClass("primary", "md")}
            >
              {creating ? "Creando…" : "Crear estructura"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

async function supabaseInstitutions(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("institutions")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}
