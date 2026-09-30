"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Modal } from "@/components/ui/modal";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/feedback";

/**
 * CAS-06 — Reasignar responsable: selector de Psicólogos de la I.E.
 * La escritura en caso_responsables_historial es solo vía RPC (054).
 */
export function ReassignCaseModal({
  open,
  onClose,
  casoId,
  institutionId,
  currentResponsibleId,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  casoId: string;
  institutionId: string | null;
  currentResponsibleId: string | null;
  onChanged: () => void;
}) {
  const [psychologists, setPsychologists] = useState<
    { user_id: string; full_name: string }[]
  >([]);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      setLoadingList(true);
      setError(null);
      setSelected("");
      setReason("");
    });

    (async () => {
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc(
          "list_institution_psychologists",
          { p_institution_id: institutionId }
        );
        if (rpcError) throw rpcError;
        if (!cancelled) {
          setPsychologists((data as { user_id: string; full_name: string }[]) ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("reassign.load", err);
          setError(toUserMessage(err, "No se pudieron cargar los Psicólogos"));
        }
      } finally {
        cancelAnimationFrame(raf);
        if (!cancelled) setLoadingList(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [open, institutionId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "reassign_case_responsible",
        {
          p_case_id: casoId,
          p_new_responsible_id: selected,
          p_reason: reason.trim() || null,
        }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        setError(data?.error ?? "No se pudo reasignar el responsable");
        return;
      }
      onChanged();
      onClose();
    } catch (err) {
      logClientError("reassign.submit", err);
      setError(toUserMessage(err, "No se pudo reasignar el responsable"));
    } finally {
      setSaving(false);
    }
  };

  const options = psychologists.filter((p) => p.user_id !== currentResponsibleId);

  return (
    <Modal open={open} onClose={onClose} title="Reasignar responsable">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <p className="text-sm text-ink-soft">
          Se cierra el registro del responsable actual y se abre uno nuevo en el
          historial (desde/hasta). Solo Psicólogos de la I.E.
        </p>

        <Field label="Nuevo responsable *">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={selectClasses}
            disabled={loadingList}
          >
            <option value="">
              {loadingList ? "Cargando Psicólogos..." : "Selecciona un Psicólogo..."}
            </option>
            {options.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </Field>

        {options.length === 0 && !loadingList && (
          <p className="text-xs text-ink-muted">
            No hay otros Psicólogos disponibles en la institución.
          </p>
        )}

        <Field label="Motivo (opcional)">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Motivo de la reasignación..."
            className={inputClasses}
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!selected || saving}
            className={buttonClass("primary", "md")}
          >
            {saving ? "Guardando..." : "Reasignar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
