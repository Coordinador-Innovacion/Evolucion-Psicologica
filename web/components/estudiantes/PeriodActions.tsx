"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";

export type ActivePeriod = {
  id: string;
  institution_id: string;
  school_year: number;
  nivel_id: string;
  grado_id: string;
  section: string;
  start_date: string;
};

export type PeriodAction = "cambio" | "retiro" | "retorno" | null;

type Props = {
  studentId: string;
  profile: { role: string; institution_id: string | null };
  activePeriod: ActivePeriod | null;
  open: PeriodAction;
  onClose: () => void;
  onChanged: () => void;
};

const SECTIONS = ["A", "B", "U"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * EST-07 — Acciones de período en transacción única:
 * Cambiar de sección (cierra + abre), Retirar (motivo obligatorio),
 * Registrar retorno (abre período sin duplicar estudiante).
 */
export function PeriodActions({
  studentId,
  profile,
  activePeriod,
  open,
  onClose,
  onChanged,
}: Props) {
  const role = profile.role;
  const isGlobal = role === "global";

  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [instSel, setInstSel] = useState(profile.institution_id ?? "");
  const [niveles, setNiveles] = useState<{ id: string; name: string }[]>([]);
  const [gradosCambio, setGradosCambio] = useState<{ id: string; name: string }[]>([]);
  const [gradosRetorno, setGradosRetorno] = useState<{ id: string; name: string }[]>([]);

  const [gradoId, setGradoId] = useState("");
  const [section, setSection] = useState("A");
  const [startDate, setStartDate] = useState(today());
  const [motivo, setMotivo] = useState("");
  const [endDate, setEndDate] = useState(today());
  const [schoolYear, setSchoolYear] = useState(String(new Date().getFullYear()));
  const [nivelId, setNivelId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retornoInstitution = isGlobal ? instSel : profile.institution_id;

  // Catálogos según la acción abierta
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createClient();

    if (open === "cambio" && activePeriod) {
      const raf = requestAnimationFrame(() => {
        setGradoId(activePeriod.grado_id);
        setSection(activePeriod.section);
        setStartDate(today());
      });
      supabase
        .from("grados")
        .select("id, name, order_number")
        .eq("nivel_id", activePeriod.nivel_id)
        .order("order_number")
        .then(({ data, error }) => {
          if (!cancelled && !error) setGradosCambio(data ?? []);
        });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }

    if (open === "retorno") {
      const raf = requestAnimationFrame(() => {
        setSchoolYear(
          activePeriod
            ? String(activePeriod.school_year)
            : String(new Date().getFullYear())
        );
        setNivelId("");
        setGradoId("");
        setSection("A");
        setStartDate(today());
        if (!isGlobal) setInstSel(profile.institution_id ?? "");
      });
      const inst = retornoInstitution;
      if (isGlobal && !inst) {
        supabase
          .from("institutions")
          .select("id, name")
          .order("name")
          .then(({ data, error }) => {
            if (!cancelled && !error) setInstitutions(data ?? []);
          });
      }
      if (inst) {
        supabase
          .from("niveles_educativos")
          .select("id, name, order_number")
          .eq("institution_id", inst)
          .order("order_number")
          .then(({ data, error }) => {
            if (!cancelled && !error) setNiveles(data ?? []);
          });
      } else if (!isGlobal) {
        const raf2 = requestAnimationFrame(() => setNiveles([]));
        return () => {
          cancelled = true;
          cancelAnimationFrame(raf);
          cancelAnimationFrame(raf2);
        };
      }
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }

    if (open === "retiro") {
      const raf = requestAnimationFrame(() => {
        setMotivo("");
        setEndDate(today());
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [open, activePeriod, isGlobal, profile.institution_id, retornoInstitution]);

  // Grados del nivel elegido en el retorno
  useEffect(() => {
    if (open !== "retorno" || !nivelId) {
      const raf = requestAnimationFrame(() => setGradosRetorno([]));
      return () => cancelAnimationFrame(raf);
    }
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("grados")
      .select("id, name, order_number")
      .eq("nivel_id", nivelId)
      .order("order_number")
      .then(({ data, error }) => {
        if (!cancelled && !error) setGradosRetorno(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [open, nivelId]);

  const finish = (message: string) => {
    toast.success(message);
    setError(null);
    onChanged();
    onClose();
  };

  const handleChangeSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePeriod) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("change_school_section", {
        p_student_id: studentId,
        p_new_grado_id: gradoId || null,
        p_new_section: section,
        p_new_start_date: startDate || null,
      });
      if (error) throw error;
      if (!data?.success) {
        setError(data?.error ?? "No se pudo cambiar de sección");
        return;
      }
      finish("Sección actualizada: período anterior cerrado y nuevo abierto");
    } catch (err) {
      logClientError("estudiantes.periodos.change", err);
      setError(toUserMessage(err, "No se pudo cambiar de sección"));
    }
    setSaving(false);
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("withdraw_student", {
        p_student_id: studentId,
        p_motivo: motivo.trim(),
        p_end_date: endDate || null,
      });
      if (error) throw error;
      if (!data?.success) {
        setError(data?.error ?? "No se pudo registrar el retiro");
        return;
      }
      finish("Estudiante retirado: período cerrado con motivo");
    } catch (err) {
      logClientError("estudiantes.periodos.withdraw", err);
      setError(toUserMessage(err, "No se pudo registrar el retiro"));
    }
    setSaving(false);
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("register_return", {
        p_student_id: studentId,
        p_school_year: Number(schoolYear),
        p_nivel_id: nivelId || null,
        p_grado_id: gradoId || null,
        p_section: section,
        p_start_date: startDate || null,
        p_institution_id: isGlobal ? instSel : null,
      });
      if (error) throw error;
      if (!data?.success) {
        setError(data?.error ?? "No se pudo registrar el retorno");
        return;
      }
      finish("Retorno registrado: nuevo período abierto");
    } catch (err) {
      logClientError("estudiantes.periodos.return", err);
      setError(toUserMessage(err, "No se pudo registrar el retorno"));
    }
    setSaving(false);
  };

  const errorBox = error ? (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      {error}
    </p>
  ) : null;

  return (
    <>
      {/* Cambiar de sección */}
      <Modal
        open={open === "cambio"}
        onClose={onClose}
        title="Cambiar de sección"
      >
        <form onSubmit={handleChangeSection} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Se cierra el período vigente y se abre uno nuevo en la misma transacción. Sin
            solapamientos.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Grado *">
              <select
                value={gradoId}
                onChange={(e) => setGradoId(e.target.value)}
                className={selectClasses}
              >
                {gradosCambio.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sección *">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className={selectClasses}
              >
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Inicio del nuevo período *">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClasses}
              />
            </Field>
          </div>
          {errorBox}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !gradoId}
              className={buttonClass("primary", "md")}
            >
              {saving ? "Aplicando…" : "Cambiar de sección"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Retirar */}
      <Modal open={open === "retiro"} onClose={onClose} title="Retirar estudiante">
        <form onSubmit={handleWithdraw} className="space-y-4">
          <p className="text-sm text-ink-muted">
            El retiro cierra el período activo con motivo obligatorio. El estudiante
            permanece en el sistema y puede retornar luego.
          </p>
          <Field label="Motivo del retiro *">
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Cambio de institución"
              className={inputClasses}
              required
            />
          </Field>
          <Field label="Fecha de fin *">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClasses}
              required
            />
          </Field>
          {errorBox}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !motivo.trim()}
              className={buttonClass("danger", "md")}
            >
              {saving ? "Registrando…" : "Registrar retiro"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Registrar retorno */}
      <Modal
        open={open === "retorno"}
        onClose={onClose}
        title="Registrar retorno"
      >
        <form onSubmit={handleReturn} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Solo se abre un nuevo período: no se duplica al estudiante.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {isGlobal && (
              <Field label="Institución *">
                <select
                  value={instSel}
                  onChange={(e) => {
                    setInstSel(e.target.value);
                    setNivelId("");
                    setGradoId("");
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
              </Field>
            )}
            <Field label="Año escolar *">
              <input
                type="number"
                min={2000}
                max={2100}
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
                className={inputClasses}
              />
            </Field>
            <Field label="Nivel *">
              <select
                value={nivelId}
                onChange={(e) => {
                  setNivelId(e.target.value);
                  setGradoId("");
                }}
                className={selectClasses}
              >
                <option value="">Seleccione…</option>
                {niveles.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grado *">
              <select
                value={gradoId}
                onChange={(e) => setGradoId(e.target.value)}
                className={selectClasses}
              >
                <option value="">Seleccione…</option>
                {gradosRetorno.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sección *">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className={selectClasses}
              >
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Inicio *">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClasses}
              />
            </Field>
          </div>
          {errorBox}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                saving || !nivelId || !gradoId || (isGlobal && !instSel) || Number(schoolYear) < 2000
              }
              className={buttonClass("primary", "md")}
            >
              {saving ? "Registrando…" : "Registrar retorno"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
