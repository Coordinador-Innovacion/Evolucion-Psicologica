"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Icon } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/button";
import { ErrorBanner, LoadingScreen } from "@/components/ui/feedback";

interface LinkState {
  code: "invalid_token" | "not_open" | "window_closed" | "unavailable" | "unpublished" | "unknown";
  error: string;
  opensAt?: string | null;
  closedAt?: string | null;
  institutionName?: string | null;
}

function formatLima(value: string): string {
  return new Date(value).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EnlacePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LinkState | null>(null);
  const [survey, setSurvey] = useState<{
    title: string;
    institution: string | null;
    progress: number;
    completed: boolean;
    endsAt: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await supabase.rpc(
          "get_survey_structure",
          { p_token: token }
        );
        if (rpcError) throw rpcError;
        if (cancelled) return;
        if (!data?.success) {
          setState({
            code: (data?.code as LinkState["code"]) ?? "unknown",
            error: data?.error || "No se pudo cargar la encuesta",
            opensAt: data?.opens_at ?? null,
            closedAt: data?.closed_at ?? null,
            institutionName: data?.institution_name ?? null,
          });
        } else {
          setSurvey({
            title: data.survey_title,
            institution: data.institution_name ?? null,
            progress: data.progress ?? 0,
            completed: data.completed === true,
            endsAt: data.ends_at ?? null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("e.landing", err);
          setError(toUserMessage(err, "No se pudo cargar la encuesta"));
        }
      }
      if (!cancelled) setLoading(false);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return <LoadingScreen label="Verificando enlace..." />;
  }

  const shell = (content: React.ReactNode) => (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_55%)]"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-950/30">
            <Icon name="pulse" className="h-8 w-8" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {survey?.institution ?? "Evolución Psicológica"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Encuesta institucional
          </p>
        </div>
        {content}
      </div>
    </div>
  );

  if (error) {
    return shell(<ErrorBanner>{error}</ErrorBanner>);
  }

  if (state) {
    const titles: Record<LinkState["code"], string> = {
      invalid_token: "Enlace no válido",
      not_open: "La encuesta aún no está disponible",
      window_closed: "El plazo de la encuesta terminó",
      unavailable: "La encuesta no está disponible",
      unpublished: "La encuesta no está disponible",
      unknown: "No se pudo acceder",
    };
    return shell(
      <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
          <Icon name="calendar" className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold text-slate-900">
          {titles[state.code]}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{state.error}</p>
        {state.code === "not_open" && state.opensAt && (
          <p className="mt-3 text-sm font-medium text-indigo-700">
            Abre el {formatLima(state.opensAt)}
          </p>
        )}
        {(state.code === "window_closed" || state.code === "unavailable") &&
          state.closedAt && (
            <p className="mt-3 text-sm font-medium text-slate-700">
              Cerró el {formatLima(state.closedAt)}
            </p>
          )}
        {(state.code === "window_closed" || state.code === "unavailable") && (
          <p className="mt-2 text-sm text-slate-500">
            Tu avance quedó guardado. Consulta con tu I.E. si necesitas
            continuar.
          </p>
        )}
        {state.code === "invalid_token" && (
          <p className="mt-2 text-sm text-slate-500">
            Verifica que hayas copiado el enlace completo o solicita uno nuevo
            a tu institución.
          </p>
        )}
      </div>
    );
  }

  if (survey) {
    if (survey.completed) {
      return shell(
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-card">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <Icon name="check" className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-semibold text-emerald-900">
            ¡Gracias por participar!
          </h2>
          <p className="mt-2 text-sm text-emerald-700">
            Ya completaste &ldquo;{survey.title}&rdquo;. Tus respuestas fueron
            registradas.
          </p>
        </div>
      );
    }
    return shell(
      <div className="rounded-2xl border border-line bg-white p-8 shadow-card">
        <h2 className="text-center text-lg font-semibold text-slate-900">
          {survey.title}
        </h2>
        {survey.progress > 0 && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${survey.progress}%` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-slate-500">
              Llevas {survey.progress}% respondido. Tus respuestas se guardan
              automáticamente.
            </p>
          </div>
        )}
        {survey.endsAt && (
          <p className="mt-4 text-center text-xs text-slate-500">
            El plazo termina el {formatLima(survey.endsAt)}
          </p>
        )}
        <Link
          href={`/e/${token}/acceso`}
          className={`${buttonClass("primary", "lg")} mt-6 w-full justify-center`}
        >
          {survey.progress > 0 ? "Continuar con mi DNI" : "Comenzar con mi DNI"}
        </Link>
        <p className="mt-4 text-center text-xs text-slate-400">
          Necesitas tu número de DNI para ingresar. Tu avance se conserva al
          volver.
        </p>
      </div>
    );
  }

  return null;
}
