"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";

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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Cargando encuesta...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              No se puede acceder
            </h2>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <Link
              href={`/encuesta/${token}`}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Volver al inicio de acceso
            </Link>
          </div>
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-lg font-semibold text-gray-900">
                {data.survey_title}
              </h1>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span>
                {data.sections.length}{" "}
                {data.sections.length === 1 ? "sección" : "secciones"}
              </span>
              <span>
                {totalQuestions}{" "}
                {totalQuestions === 1 ? "pregunta" : "preguntas"}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <p className="text-sm text-gray-600 mb-4">
            Encuesta cargada correctamente. Revise las secciones a continuación
            y cuando esté listo, comience a responder.
          </p>
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-400 mb-4">
            <div>
              <span className="font-medium text-gray-600">Aplicación:</span>{" "}
              {appParam ? appParam.slice(0, 8) + "..." : "—"}
            </div>
            <div>
              <span className="font-medium text-gray-600">Tipo:</span>{" "}
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
            className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            Comenzar encuesta
          </button>
        </div>

        <div className="space-y-4">
          {data.sections.map((section, idx) => (
            <div
              key={section.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                Sección {idx + 1}: {section.title}
              </h3>
              {section.description && (
                <p className="text-xs text-gray-500 mb-3">
                  {section.description}
                </p>
              )}
              <div className="space-y-3">
                {section.questions.map((q) => (
                  <div
                    key={q.id}
                    className="border-l-2 border-blue-200 pl-3"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-700">{q.label}</span>
                      {q.is_required && (
                        <span className="text-red-500 text-xs">*</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
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
