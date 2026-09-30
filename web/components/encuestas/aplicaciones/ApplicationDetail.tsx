"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEncuestas } from "@/hooks/useEncuestas";
import { useUser } from "@/hooks/useUser";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Field, inputClasses } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { DonutChart } from "@/components/ui/donut";
import {
  EmptyState,
  ErrorBanner,
  LoadingScreen,
} from "@/components/ui/feedback";
import { applicationUiState } from "@/components/encuestas/aplicaciones/ApplicationsList";
import type { SurveyApplicationItem } from "@/types/encuestas";

interface AnchorData extends SurveyApplicationItem {
  encuesta_versiones: {
    version_number: number;
    survey_id: string;
    encuestas: { id: string; title: string } | null;
  } | null;
}

interface ParticipantInfo {
  name: string;
  document_number: string | null;
}

const GROUP_STYLES: Record<string, string> = {
  programada: "bg-indigo-100 text-indigo-800",
  abierta: "bg-emerald-100 text-emerald-800",
  vencida: "bg-rose-100 text-rose-800",
  cerrada: "bg-slate-100 text-slate-700",
};

const GROUP_LABELS: Record<string, string> = {
  programada: "Programada",
  abierta: "Abierta",
  vencida: "Vencida",
  cerrada: "Cerrada",
};

function participantState(app: SurveyApplicationItem): {
  label: string;
  className: string;
} {
  if (app.status === "completed" || app.progress >= 100) {
    return { label: "Finalizada", className: "bg-emerald-100 text-emerald-800" };
  }
  if (app.progress > 0) {
    return { label: "En progreso", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "Sin iniciar", className: "bg-slate-100 text-slate-700" };
}

function toLimaInput(iso: string): string {
  const d = new Date(iso);
  const lima = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return lima.toISOString().slice(0, 16);
}

function fromLimaInput(local: string): string {
  return local ? new Date(`${local}:00-05:00`).toISOString() : "";
}

function formatLima(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApplicationDetail({
  applicationId,
  openLinks,
}: {
  applicationId: string;
  openLinks?: boolean;
}) {
  const { profile } = useUser();
  const { extendApplication } = useEncuestas();

  const [anchor, setAnchor] = useState<AnchorData | null>(null);
  const [group, setGroup] = useState<SurveyApplicationItem[]>([]);
  const [participants, setParticipants] = useState<
    Map<string, ParticipantInfo>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [showExtend, setShowExtend] = useState(false);
  const [newEndsAt, setNewEndsAt] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  const [showLinks, setShowLinks] = useState(openLinks === true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("encuesta_aplicaciones")
        .select(
          "*, encuesta_versiones(version_number, survey_id, encuestas(id, title))"
        )
        .eq("id", applicationId)
        .single();
      if (err) throw err;
      const anchorRow = data as unknown as AnchorData;
      const { data: rows, error: groupErr } = await supabase
        .from("encuesta_aplicaciones")
        .select("*")
        .eq("version_id", anchorRow.version_id)
        .eq("year", anchorRow.year)
        .eq("started_at", anchorRow.started_at)
        .eq("ends_at", anchorRow.ends_at)
        .order("created_at", { ascending: true });
      if (groupErr) throw groupErr;
      const groupRows = (rows ?? []) as SurveyApplicationItem[];

      const studentIds = [
        ...new Set(
          groupRows
            .map((r) => r.respondent_student_id)
            .filter((v): v is string => Boolean(v))
        ),
      ];
      const userIds = [
        ...new Set(
          groupRows
            .map((r) => r.respondent_user_id)
            .filter((v): v is string => Boolean(v))
        ),
      ];
      const info = new Map<string, ParticipantInfo>();
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from("estudiantes")
          .select("id, first_names, last_names, document_number")
          .in("id", studentIds);
        for (const s of (students ?? []) as {
          id: string;
          first_names: string;
          last_names: string;
          document_number: string;
        }[]) {
          info.set(s.id, {
            name: `${s.last_names}, ${s.first_names}`,
            document_number: s.document_number,
          });
        }
      }
      if (userIds.length > 0) {
        const { data: staffRows } = await supabase
          .from("perfiles")
          .select("user_id, full_name, document_number")
          .in("user_id", userIds);
        for (const p of (staffRows ?? []) as {
          user_id: string;
          full_name: string;
          document_number: string;
        }[]) {
          info.set(p.user_id, {
            name: p.full_name,
            document_number: p.document_number,
          });
        }
      }

      setAnchor(anchorRow);
      setGroup(groupRows);
      setParticipants(info);
      setNow(new Date());
    } catch (err) {
      logClientError("ApplicationDetail.load", err);
      setError(toUserMessage(err, "Error al cargar la aplicación"));
    }
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void load();
    });
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
    };
  }, [load]);

  const survey = anchor?.encuesta_versiones?.encuestas ?? null;
  const versionNumber = anchor?.encuesta_versiones?.version_number ?? null;

  const groupState = anchor
    ? applicationUiState(anchor, now)
    : "cerrada";

  const avgProgress = useMemo(() => {
    if (group.length === 0) return 0;
    return Math.round(
      group.reduce((acc, a) => acc + (a.progress ?? 0), 0) / group.length
    );
  }, [group]);

  const counts = useMemo(() => {
    let done = 0;
    let inProgress = 0;
    let notStarted = 0;
    for (const app of group) {
      const st = participantState(app).label;
      if (st === "Finalizada") done += 1;
      else if (st === "En progreso") inProgress += 1;
      else notStarted += 1;
    }
    return { done, inProgress, notStarted };
  }, [group]);

  const handleExtend = async () => {
    if (!newEndsAt || !anchor) return;
    const iso = fromLimaInput(newEndsAt);
    if (new Date(iso) <= new Date(anchor.ends_at)) {
      setExtendError(
        "La nueva fecha de fin debe ser posterior a la fecha actual de fin."
      );
      return;
    }
    setExtending(true);
    setExtendError(null);
    try {
      await Promise.all(group.map((app) => extendApplication(app.id, iso)));
      setShowExtend(false);
      await load();
    } catch (err) {
      logClientError("ApplicationDetail.extend", err);
      setExtendError(toUserMessage(err, "Error al ampliar plazo"));
    }
    setExtending(false);
  };

  const linkFor = (token: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/e/${token}`
      : `/e/${token}`;

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId((c) => (c === key ? null : c)), 2000);
    } catch {
      logClientError("ApplicationDetail.clipboard", new Error("clipboard denied"));
    }
  };

  const copyAllLinks = () => {
    const links = group
      .filter((a) => a.access_token)
      .map((a) => {
        const p = infoFor(a);
        return `${p.name} — ${linkFor(a.access_token as string)}`;
      })
      .join("\n");
    copyText(links, "all");
  };

  const downloadCsv = () => {
    const lines = ["respondiente,dni,enlace"];
    for (const a of group) {
      if (!a.access_token) continue;
      const p = infoFor(a);
      lines.push(
        `"${p.name.replace(/"/g, '""')}","${p.document_number ?? ""}","${linkFor(
          a.access_token
        )}"`
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "enlaces-encuesta.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const infoFor = (app: SurveyApplicationItem): ParticipantInfo => {
    const key = app.respondent_student_id ?? app.respondent_user_id ?? "";
    return (
      participants.get(key) ?? {
        name: "Respondiente",
        document_number: null,
      }
    );
  };

  if (loading) {
    return <LoadingScreen label="Cargando aplicación..." />;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            <Link
              href="/encuestas/aplicaciones"
              className="hover:text-slate-600"
            >
              Aplicaciones
            </Link>{" "}
            / {survey?.title ?? "Encuesta"}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-900">
            {survey?.title ?? "Encuesta"}
            <span className="text-sm font-normal text-slate-500">
              V{versionNumber ?? "?"}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${GROUP_STYLES[groupState]}`}
            >
              {GROUP_LABELS[groupState]}
            </span>
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Año escolar {anchor.year}</span>
            <span>
              Ventana: {formatLima(anchor.started_at)} —{" "}
              {formatLima(anchor.ends_at)}
            </span>
            {anchor.extended_at && (
              <span className="text-amber-600">
                Ampliada: {formatLima(anchor.extended_at)}
              </span>
            )}
            <span>{group.length} participantes</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setNewEndsAt(toLimaInput(anchor.ends_at));
              setExtendError(null);
              setShowExtend(true);
            }}
          >
            Ampliar plazo
          </Button>
          <Button onClick={() => setShowLinks(true)}>Copiar enlace</Button>
          <Link
            href={`/encuestas/aplicaciones/${applicationId}/respuestas`}
            className={buttonClass("secondary", "md")}
          >
            Ver respuestas
          </Link>
          {profile?.role === "psicologo" && (
            <Link
              href="/estudiantes/nuevo"
              className={buttonClass("secondary", "md")}
            >
              Registrar estudiante
            </Link>
          )}
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-900">
            Avance de la aplicación
          </h2>
          <div className="mt-3">
            <DonutChart
              data={[
                { label: "Finalizadas", value: counts.done, color: "#22C55E" },
                {
                  label: "En progreso",
                  value: counts.inProgress,
                  color: "#F59E0B",
                },
                {
                  label: "Sin iniciar",
                  value: counts.notStarted,
                  color: "#94A3B8",
                },
              ]}
              size={160}
              centerValue={`${avgProgress}%`}
              centerLabel="avance promedio"
            />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Participantes
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Participante</th>
                  <th className="px-3 py-3">DNI</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Avance</th>
                  <th className="px-3 py-3">Última actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {group.map((app) => {
                  const info = infoFor(app);
                  const st = participantState(app);
                  return (
                    <tr
                      key={app.id}
                      className={
                        app.id === applicationId ? "bg-indigo-50/60" : ""
                      }
                    >
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {info.name}
                        {app.id === applicationId && (
                          <span className="ml-2 text-xs font-normal text-indigo-600">
                            (esta aplicación)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {info.document_number ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {app.progress}%
                      </td>
                      <td className="px-3 py-3 text-slate-500">
                        {formatLima(app.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal
        open={showExtend}
        onClose={() => setShowExtend(false)}
        title="Ampliar plazo"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Se mantiene la misma aplicación, el mismo enlace y el avance
            guardado. No se crea una aplicación nueva.
          </p>
          <Field label="Nueva fecha/hora de fin *">
            <input
              type="datetime-local"
              value={newEndsAt}
              onChange={(e) => setNewEndsAt(e.target.value)}
              className={inputClasses}
            />
          </Field>
          {newEndsAt &&
            new Date(fromLimaInput(newEndsAt)) <= new Date(anchor.ends_at) && (
              <p className="text-sm text-rose-600">
                La nueva fecha de fin debe ser posterior a la fecha actual de
                fin.
              </p>
            )}
          {extendError && <ErrorBanner>{extendError}</ErrorBanner>}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowExtend(false)}
              disabled={extending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleExtend}
              disabled={
                extending ||
                !newEndsAt ||
                new Date(fromLimaInput(newEndsAt)) <=
                  new Date(anchor.ends_at)
              }
            >
              {extending ? "Ampliando..." : "Ampliar plazo"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showLinks}
        onClose={() => setShowLinks(false)}
        title="Enlaces de acceso"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cada participante tiene un enlace propio. Compártelo por el canal
            que prefieras; el respondiente ingresará con su DNI.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={copyAllLinks}>
              {copiedId === "all" ? "✓ Copiados" : "Copiar todos"}
            </Button>
            <Button size="sm" variant="secondary" onClick={downloadCsv}>
              Descargar lista (CSV)
            </Button>
          </div>
          <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {group.map((app) => {
              const info = infoFor(app);
              return (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {info.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {app.access_token ? linkFor(app.access_token) : "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      app.access_token &&
                      copyText(linkFor(app.access_token), app.id)
                    }
                  >
                    {copiedId === app.id ? "✓ Copiado" : "Copiar"}
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowLinks(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
