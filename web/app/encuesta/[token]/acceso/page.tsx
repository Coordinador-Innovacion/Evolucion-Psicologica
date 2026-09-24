"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Icon } from "@/components/ui/icons";
import { LoadingScreen } from "@/components/ui/feedback";

interface SurveySection {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  questions: {
    id: string;
    question_type: string;
    label: string;
    description: string | null;
    is_required: boolean;
    sort_order: number;
    config: Record<string, unknown>;
    presentation: Record<string, unknown>;
    options: { id: string; label: string; sort_order: number }[];
  }[];
}

interface AccessData {
  application_id: string;
  survey_title: string;
  sections: SurveySection[];
}

export default function AccesoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = use(params);
  const searchP = use(searchParams);
  const appParam = typeof searchP.app === "string" ? searchP.app : undefined;
  const typeParam = typeof searchP.type === "string" ? searchP.type : undefined;
  const nameParam = typeof searchP.name === "string" ? searchP.name : "";
  const router = useRouter();

  const [data, setData] = useState<AccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data: result, error: rpcError } = await supabase.rpc(
        "get_survey_structure",
        { p_token: token }
      );
      if (cancelled) return;
      if (rpcError) {
        logClientError("encuesta.acceso.load", rpcError);
        setError(toUserMessage(rpcError, "No se pudo cargar la encuesta"));
      } else if (!result?.success) {
        setError(result?.error || "No se pudo cargar la encuesta");
      } else {
        setData({
          application_id: result.application_id,
          survey_title: result.survey_title,
          sections: result.sections || [],
        });
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return <LoadingScreen label="Cargando encuesta..." />;
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">
            No se puede acceder
          </h2>
          <p className="mt-2 text-sm text-rose-600">{error}</p>
          <Link
            href={`/encuesta/${token}`}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Volver al inicio de acceso
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totalQuestions = data.sections.reduce(
    (acc, s) => acc + s.questions.length,
    0
  );

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-950/20">
              <Icon name="pulse" className="h-5 w-5" />
            </span>
            <h1 className="truncate text-base font-semibold text-slate-900">
              {data.survey_title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
            <span className="hidden rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700 sm:inline">
              {data.sections.length}{" "}
              {data.sections.length === 1 ? "sección" : "secciones"}
            </span>
            <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 sm:inline">
              {totalQuestions}{" "}
              {totalQuestions === 1 ? "pregunta" : "preguntas"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
          <p className="mb-4 text-sm text-slate-600">
            Encuesta cargada correctamente. Revise las secciones a continuación
            y cuando esté listo, comience a responder.
          </p>
          <div className="mb-4 grid grid-cols-2 gap-4 text-xs text-slate-400">
            <div>
              <span className="font-medium text-slate-600">Aplicación:</span>{" "}
              {appParam ? appParam.slice(0, 8) + "..." : "—"}
            </div>
            <div>
              <span className="font-medium text-slate-600">Tipo:</span>{" "}
              {typeParam === "student" ? "Estudiante" : "Docente"}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              router.push(
                `/encuesta/${token}/responder?app=${appParam || ""}&type=${typeParam || ""}&name=${encodeURIComponent(nameParam)}`
              )
            }
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Comenzar encuesta
          </button>
        </div>

        <div className="space-y-4">
          {data.sections.map((section, idx) => (
            <div
              key={section.id}
              className="rounded-2xl border border-line bg-white p-6 shadow-card"
            >
              <h3 className="mb-1 text-sm font-semibold text-slate-900">
                Sección {idx + 1}: {section.title}
              </h3>
              {section.description && (
                <p className="mb-3 text-xs text-slate-500">
                  {section.description}
                </p>
              )}
              <div className="space-y-3">
                {section.questions.map((q) => (
                  <div
                    key={q.id}
                    className="border-l-2 border-indigo-200 pl-3"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-slate-700">{q.label}</span>
                      {q.is_required && (
                        <span className="text-xs text-rose-500">*</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Tipo: {q.question_type}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
