"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
} from "@/components/ui/feedback";
import type { SurveyApplicationItem } from "@/types/encuestas";

interface AnswerRow {
  question_id: string;
  question_label: string;
  question_type: string;
  is_required: boolean;
  answer: unknown;
  answered_at: string | null;
}

interface QuestionOption {
  id: string;
  label: string;
}

function formatAnswer(
  answer: unknown,
  optionLabels: QuestionOption[]
): string {
  if (answer === null || answer === undefined || answer === "")
    return "Sin respuesta";
  if (typeof answer === "boolean") return answer ? "Sí" : "No";
  if (typeof answer === "number") return String(answer);
  if (Array.isArray(answer)) {
    if (answer.length === 0) return "Sin respuesta";
    return answer
      .map((v) => {
        const found = optionLabels.find((o) => o.id === v);
        return found ? found.label : String(v);
      })
      .join(", ");
  }
  if (typeof answer === "string") {
    const found = optionLabels.find((o) => o.id === answer);
    return found ? found.label : answer;
  }
  return String(answer);
}

export function ApplicationAnswers({ applicationId }: { applicationId: string }) {
  const [anchor, setAnchor] = useState<{
    id: string;
    version_id: string;
    year: number;
    title: string;
    version_number: number;
  } | null>(null);
  const [group, setGroup] = useState<SurveyApplicationItem[]>([]);
  const [participants, setParticipants] = useState<Map<string, string>>(
    new Map()
  );
  const [selectedId, setSelectedId] = useState<string>(applicationId);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [questions, setQuestions] = useState<
    { id: string; label: string; options: QuestionOption[] }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("encuesta_aplicaciones")
        .select(
          "id, version_id, year, encuesta_versiones(version_number, encuestas(title))"
        )
        .eq("id", applicationId)
        .single();
      if (err) throw err;
      const row = data as unknown as {
        id: string;
        version_id: string;
        year: number;
        encuesta_versiones: {
          version_number: number;
          encuestas: { title: string } | null;
        } | null;
      };

      const { data: groupRows, error: groupErr } = await supabase
        .from("encuesta_aplicaciones")
        .select("*")
        .eq("version_id", row.version_id)
        .eq("year", row.year)
        .order("created_at", { ascending: true });
      if (groupErr) throw groupErr;
      const rows = (groupRows ?? []) as SurveyApplicationItem[];

      const studentIds = [
        ...new Set(
          rows
            .map((r) => r.respondent_student_id)
            .filter((v): v is string => Boolean(v))
        ),
      ];
      const userIds = [
        ...new Set(
          rows
            .map((r) => r.respondent_user_id)
            .filter((v): v is string => Boolean(v))
        ),
      ];
      const names = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from("estudiantes")
          .select("id, first_names, last_names")
          .in("id", studentIds);
        for (const s of (students ?? []) as {
          id: string;
          first_names: string;
          last_names: string;
        }[]) {
          names.set(s.id, `${s.last_names}, ${s.first_names}`);
        }
      }
      if (userIds.length > 0) {
        const { data: staffRows } = await supabase
          .from("perfiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        for (const p of (staffRows ?? []) as {
          user_id: string;
          full_name: string;
        }[]) {
          names.set(p.user_id, p.full_name);
        }
      }

      const { data: sectionRows, error: sErr } = await supabase
        .from("encuesta_secciones")
        .select("id")
        .eq("version_id", row.version_id)
        .order("sort_order", { ascending: true });
      if (sErr) throw sErr;
      const sectionIds = (sectionRows ?? []).map((s) => s.id);

      let questionRows: unknown[] = [];
      if (sectionIds.length > 0) {
        const { data: q, error: qErr } = await supabase
          .from("encuesta_preguntas")
          .select("id, label, encuesta_opciones(id, label)")
          .in("section_id", sectionIds)
          .order("sort_order", { ascending: true });
        if (qErr) throw qErr;
        questionRows = q ?? [];
      }

      setAnchor({
        id: row.id,
        version_id: row.version_id,
        year: row.year,
        title: row.encuesta_versiones?.encuestas?.title ?? "Encuesta",
        version_number: row.encuesta_versiones?.version_number ?? 0,
      });
      setGroup(rows);
      setParticipants(names);
      setQuestions(
        ((questionRows ?? []) as unknown as {
          id: string;
          label: string;
          encuesta_opciones: QuestionOption[];
        }[]).map((q) => ({
          id: q.id,
          label: q.label,
          options: q.encuesta_opciones ?? [],
        }))
      );
    } catch (err) {
      logClientError("ApplicationAnswers.load", err);
      setError(toUserMessage(err, "Error al cargar respuestas"));
    }
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(raf);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function loadAnswers() {
      setAnswersLoading(true);
      try {
        const supabase = createClient();
        const { data, error: err } = await supabase.rpc(
          "get_application_answers",
          { p_application_id: selectedId }
        );
        if (err) throw err;
        if (!data?.success) throw new Error(data?.error || "Error al cargar respuestas");
        if (!cancelled) setAnswers((data.answers ?? []) as AnswerRow[]);
      } catch (err) {
        if (!cancelled) {
          logClientError("ApplicationAnswers.answers", err);
          setError(toUserMessage(err, "Error al cargar respuestas"));
        }
      }
      if (!cancelled) setAnswersLoading(false);
    }
    if (selectedId) loadAnswers();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const optionMap = useMemo(() => {
    const map = new Map<string, QuestionOption[]>();
    for (const q of questions) map.set(q.id, q.options);
    return map;
  }, [questions]);

  const counts = useMemo(() => {
    let done = 0;
    let inProgress = 0;
    let notStarted = 0;
    for (const app of group) {
      if (app.status === "completed" || app.progress >= 100) done += 1;
      else if (app.progress > 0) inProgress += 1;
      else notStarted += 1;
    }
    return { done, inProgress, notStarted };
  }, [group]);

  if (loading) {
    return <LoadingScreen label="Cargando respuestas..." />;
  }

  if (error && !anchor) {
    return <ErrorBanner>{error}</ErrorBanner>;
  }

  if (!anchor) {
    return (
      <EmptyState
        title="Aplicación no encontrada."
        description="Puede que haya sido eliminada."
        action={
          <Link
            href="/encuestas/aplicaciones"
            className={buttonClass("secondary", "md")}
          >
            Volver a aplicaciones
          </Link>
        }
      />
    );
  }

  const nameFor = (app: SurveyApplicationItem) => {
    const key = app.respondent_student_id ?? app.respondent_user_id ?? "";
    return participants.get(key) ?? "Respondiente";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            <Link
              href={`/encuestas/aplicaciones/${applicationId}`}
              className="hover:text-slate-600"
            >
              Aplicación
            </Link>{" "}
            / Respuestas
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {anchor.title}{" "}
            <span className="text-sm font-normal text-slate-500">
              V{anchor.version_number} · Año {anchor.year}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Visor solo lectura de las respuestas.
          </p>
        </div>
        <Link
          href={`/encuestas/aplicaciones/${applicationId}`}
          className={buttonClass("secondary", "md")}
        >
          Volver a la aplicación
        </Link>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Finalizadas
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {counts.done}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            En progreso
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {counts.inProgress}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Sin iniciar
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {counts.notStarted}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Respondientes
            </h2>
          </div>
          <div className="max-h-96 divide-y divide-line overflow-y-auto">
            {group.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedId(app.id)}
                className={`flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-sm transition hover:bg-slate-50 ${
                  app.id === selectedId ? "bg-indigo-50" : ""
                }`}
              >
                <span className="truncate font-medium text-slate-900">
                  {nameFor(app)}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {app.progress}%
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              Respuestas
            </h2>
            <span className="text-sm text-slate-500">
              {answers.filter((a) => a.answer !== null).length} respondidas ·{" "}
              {questions.length} preguntas
            </span>
          </div>
          {answersLoading ? (
            <LoadingScreen label="Cargando respuestas..." />
          ) : answers.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Este respondiente aún no ha registrado respuestas.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {answers.map((a) => (
                <li key={a.question_id} className="py-3">
                  <p className="text-sm font-medium text-slate-900">
                    {a.question_label}
                    {a.is_required && (
                      <span className="ml-1 text-rose-500">*</span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {formatAnswer(a.answer, optionMap.get(a.question_id) ?? [])}
                  </p>
                  {a.answered_at && (
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(a.answered_at).toLocaleString("es-PE")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
