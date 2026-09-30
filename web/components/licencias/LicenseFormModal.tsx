"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { Tables } from "@/types/supabase";
import { fmtFecha } from "@/lib/licencias";

type Institution = Tables<"institutions">;

export function LicenseFormModal({
  open,
  onClose,
  onSaved,
  institutions,
  institutionId,
  defaultStart,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  institutions: Institution[];
  /** Si se fija (IE-03), el selector de I.E. no aparece. */
  institutionId?: string | null;
  /** LIC-03: renovación prellena el inicio al día siguiente del fin actual. */
  defaultStart?: string;
}) {
  const [target, setTarget] = useState<string>(institutionId ?? "");
  const [start, setStart] = useState(defaultStart ?? "");
  const [end, setEnd] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instId = institutionId ?? target;

  const reset = () => {
    setTarget(institutionId ?? "");
    setStart(defaultStart ?? "");
    setEnd("");
    setCodes([]);
    setCodeInput("");
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const addCode = () => {
    const value = codeInput.trim();
    if (!value) return;
    setCodes((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setCodeInput("");
  };

  const valid =
    !!instId && !!start && !!end && end > start && codes.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();

      const { data: existentes, error: fetchError } = await supabase
        .from("licencias")
        .select("start_date, end_date")
        .eq("institution_id", instId);
      if (fetchError) throw fetchError;
      const solapa = (existentes ?? []).some(
        (l) => l.start_date <= end && l.end_date >= start
      );
      if (solapa) {
        throw new Error(
          "Ya existe una licencia que solapa con ese rango de fechas."
        );
      }

      const { data, error: rpcError } = await supabase.rpc(
        "create_license_with_codes",
        {
          p_institution_id: instId,
          p_start_date: start,
          p_end_date: end,
          p_codes: codes,
        }
      );
      if (rpcError) throw rpcError;
      if (!data?.success) {
        throw new Error(data?.error || "Error al registrar la licencia");
      }
      toast.success("Licencia registrada");
      reset();
      onSaved();
      onClose();
    } catch (err) {
      logClientError("license.create", err);
      setError(toUserMessage(err, "Error al registrar la licencia"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Registrar licencia"
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          {!institutionId && (
            <Field label="Institución educativa *">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={selectClasses}
                required
              >
                <option value="">Seleccione una institución</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} ({inst.code})
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de inicio *">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={inputClasses}
                required
              />
            </Field>
            <Field label="Fecha de fin *">
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                min={start || undefined}
                className={inputClasses}
                required
              />
            </Field>
          </div>
          {start && end && end <= start && (
            <p className="text-sm text-rose-600">
              La fecha de fin debe ser posterior a la fecha de inicio.
            </p>
          )}

          <Field
            label="Códigos de licencia *"
            hint="Uno o varios códigos/serie; deben ser únicos en todo el sistema."
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCode();
                  }
                }}
                className={inputClasses}
                placeholder="SERIE-2026-001"
                maxLength={100}
              />
              <Button variant="secondary" onClick={addCode}>
                Agregar
              </Button>
            </div>
          </Field>
          {codes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {codes.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-mono text-slate-700"
                >
                  {c}
                  <button
                    type="button"
                    aria-label={`Quitar ${c}`}
                    onClick={() => setCodes((prev) => prev.filter((x) => x !== c))}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {start && end && end > start && (
            <p className="text-xs text-ink-muted">
              Vigencia propuesta: {fmtFecha(start)} → {fmtFecha(end)}. El
              servidor valida además que no se solape con licencias existentes.
            </p>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid || saving}>
            {saving ? "Guardando..." : "Registrar licencia"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
