"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { SurveySectionData } from "@/types/encuestas";
import { needsOptions } from "@/types/encuestas";

export interface PublishCheck {
  ok: boolean;
  label: string;
  detail: string | null;
}

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim() === "";
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function buildPublishChecks(
  sections: SurveySectionData[]
): PublishCheck[] {
  const questions = sections.flatMap((s) => s.questions);
  const total = questions.length;

  const labelsOk = questions.every((q) => !isBlank(q.label));
  const labelsMissing = questions.filter((q) => isBlank(q.label)).length;

  const optionProblems = questions.filter((q) => {
    if (!needsOptions(q.question_type)) return false;
    if (q.options.length < 2) return true;
    return q.options.some((o) => isBlank(o.label));
  });

  const scaleProblems = questions.filter((q) => {
    if (q.question_type !== "escala") return false;
    const min = numOrNull(q.config.min) ?? 1;
    const max = numOrNull(q.config.max) ?? 5;
    return min >= max;
  });

  const numberProblems = questions.filter((q) => {
    if (q.question_type !== "numero") return false;
    const min = numOrNull(q.config.min);
    const max = numOrNull(q.config.max);
    return min !== null && max !== null && min > max;
  });

  const dateProblems = questions.filter((q) => {
    if (q.question_type !== "fecha") return false;
    const min = typeof q.config.min_date === "string" ? q.config.min_date : null;
    const max = typeof q.config.max_date === "string" ? q.config.max_date : null;
    return min !== null && max !== null && min > max;
  });

  const multiProblems = questions.filter((q) => {
    if (q.question_type !== "seleccion_multiple") return false;
    const min = numOrNull(q.config.min_selected);
    const max = numOrNull(q.config.max_selected);
    return min !== null && max !== null && min > max;
  });

  return [
    {
      ok: sections.length >= 1,
      label: "Al menos una sección",
      detail: sections.length >= 1 ? null : "Agrega una sección a la encuesta",
    },
    {
      ok: total >= 1,
      label: "Al menos una pregunta",
      detail: total >= 1 ? null : "Agrega al menos una pregunta",
    },
    {
      ok: labelsOk,
      label: "Cada pregunta con enunciado",
      detail: labelsOk
        ? null
        : `${labelsMissing} ${
            labelsMissing === 1 ? "pregunta sin" : "preguntas sin"
          } enunciado`,
    },
    {
      ok: optionProblems.length === 0,
      label: "Opciones válidas donde el tipo lo requiere",
      detail:
        optionProblems.length === 0
          ? null
          : `${optionProblems.length} ${
              optionProblems.length === 1 ? "pregunta" : "preguntas"
            } necesita al menos 2 opciones con texto`,
    },
    {
      ok: scaleProblems.length === 0,
      label: "Escalas coherentes (mínimo < máximo)",
      detail:
        scaleProblems.length === 0
          ? null
          : `${scaleProblems.length} escala con rango inválido`,
    },
    {
      ok: numberProblems.length === 0,
      label: "Rangos de número coherentes (mín ≤ máx)",
      detail:
        numberProblems.length === 0
          ? null
          : `${numberProblems.length} pregunta numérica con rango inválido`,
    },
    {
      ok: dateProblems.length === 0,
      label: "Rango de fechas coherente (inicio ≤ fin)",
      detail:
        dateProblems.length === 0
          ? null
          : `${dateProblems.length} pregunta de fecha con rango inválido`,
    },
    {
      ok: multiProblems.length === 0,
      label: "Selección múltiple: mínimo ≤ máximo",
      detail:
        multiProblems.length === 0
          ? null
          : `${multiProblems.length} pregunta con límites inválidos`,
    },
  ];
}

interface Props {
  open: boolean;
  sections: SurveySectionData[];
  publishing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function PublishVersionDialog({
  open,
  sections,
  publishing,
  onClose,
  onConfirm,
}: Props) {
  const checks = buildPublishChecks(sections);
  const allOk = checks.every((c) => c.ok);

  return (
    <Modal open={open} onClose={onClose} title="Publicar versión">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Revisa las validaciones antes de publicar:
        </p>

        <ul className="space-y-2">
          {checks.map((check) => (
            <li
              key={check.label}
              className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                check.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              <span aria-hidden="true" className="font-semibold">
                {check.ok ? "✓" : "✕"}
              </span>
              <span>
                {check.label}
                {check.detail && (
                  <span className="block text-xs opacity-80">
                    {check.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Una vez publicada, la versión queda inmutable: no podrá editarse ni
          eliminarse. Para cambios, crea una nueva versión.
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={publishing}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!allOk || publishing}
            title={
              allOk
                ? ""
                : "Corrige las validaciones marcadas para poder publicar"
            }
          >
            {publishing ? "Publicando..." : "Publicar versión"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
