"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { Icon } from "@/components/ui/icons";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, inputClasses, selectClasses } from "@/components/ui/field";
import { ErrorBanner, LoadingScreen } from "@/components/ui/feedback";

interface RespondentData {
  first_names: string | null;
  last_names: string | null;
  document_type: string | null;
  document_number: string | null;
  birth_date: string | null;
  birth_place: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  guardian: {
    type: string | null;
    full_name: string | null;
    document_type: string | null;
    document_number: string | null;
    phone: string | null;
    email: string | null;
    relationship: string | null;
  } | null;
}

const LABELS: { key: keyof RespondentData; label: string }[] = [
  { key: "first_names", label: "Nombres" },
  { key: "last_names", label: "Apellidos" },
  { key: "document_type", label: "Tipo de documento" },
  { key: "document_number", label: "Documento" },
  { key: "birth_date", label: "Fecha de nacimiento" },
  { key: "birth_place", label: "Lugar de nacimiento" },
  { key: "address", label: "Dirección" },
  { key: "phone", label: "Teléfono" },
  { key: "email", label: "Correo" },
];

export default function DatosPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  const respondentName = searchParams.get("name") ?? "Respondiente";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RespondentData | null>(null);
  const [noData, setNoData] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    birth_date: "",
    birth_place: "",
    address: "",
    phone: "",
    email: "",
    guardian_type: "padre",
    guardian_name: "",
    guardian_doc_type: "DNI",
    guardian_doc: "",
    guardian_phone: "",
    guardian_email: "",
    guardian_relationship: "",
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<RespondentData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: result, error: rpcError } = await supabase.rpc(
          "complete_respondent_profile",
          { p_token: token, p_fields: {} }
        );
        if (rpcError) throw rpcError;
        if (cancelled) return;
        if (!result?.success) {
          if (
            result?.error ===
            "Este respondiente no tiene datos adicionales que completar"
          ) {
            setNoData(true);
          } else {
            setError(result?.error || "No se pudieron cargar tus datos");
          }
        } else {
          const profile = result.data as RespondentData;
          dataRef.current = profile;
          setData(profile);
          setForm({
            birth_date: profile.birth_date ?? "",
            birth_place: profile.birth_place ?? "",
            address: profile.address ?? "",
            phone: profile.phone ?? "",
            email: profile.email ?? "",
            guardian_type: profile.guardian?.type ?? "padre",
            guardian_name: profile.guardian?.full_name ?? "",
            guardian_doc_type: profile.guardian?.document_type ?? "DNI",
            guardian_doc: profile.guardian?.document_number ?? "",
            guardian_phone: profile.guardian?.phone ?? "",
            guardian_email: profile.guardian?.email ?? "",
            guardian_relationship: profile.guardian?.relationship ?? "",
          });
        }
      } catch (err) {
        if (!cancelled) {
          logClientError("e.datos.load", err);
          setError(toUserMessage(err, "No se pudieron cargar tus datos"));
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const persist = useCallback(
    async (values: typeof form) => {
      setSaving(true);
      setSaved(false);
      try {
        const supabase = createClient();
        const fields: Record<string, unknown> = {
          birth_date: values.birth_date,
          birth_place: values.birth_place,
          address: values.address,
          phone: values.phone,
          email: values.email,
        };
        if (values.guardian_name.trim() && values.guardian_doc.trim()) {
          fields.guardian = {
            type: values.guardian_type,
            full_name: values.guardian_name,
            document_type: values.guardian_doc_type,
            document_number: values.guardian_doc,
            phone: values.guardian_phone,
            email: values.guardian_email,
            relationship: values.guardian_relationship,
          };
        }
        const { data: result, error: rpcError } = await supabase.rpc(
          "complete_respondent_profile",
          { p_token: token, p_fields: fields }
        );
        if (rpcError) throw rpcError;
        if (!result?.success)
          throw new Error(result?.error || "No se pudieron guardar tus datos");
        setSaved(true);
        setError(null);
        // Reflejar lo guardado en la vista de solo lectura (misma semántica
        // del servidor: cadena vacía → NULL)
        setData((prev) =>
          prev
            ? {
                ...prev,
                birth_date: values.birth_date || null,
                birth_place: values.birth_place || null,
                address: values.address || null,
                phone: values.phone || null,
                email: values.email || null,
                guardian:
                  values.guardian_name.trim() && values.guardian_doc.trim()
                    ? {
                        type: values.guardian_type,
                        full_name: values.guardian_name,
                        document_type: values.guardian_doc_type,
                        document_number: values.guardian_doc,
                        phone: values.guardian_phone || null,
                        email: values.guardian_email || null,
                        relationship: values.guardian_relationship || null,
                      }
                    : prev.guardian,
              }
            : prev
        );
      } catch (err) {
        logClientError("e.datos.save", err);
        setError(toUserMessage(err, "No se pudieron guardar tus datos"));
      }
      setSaving(false);
    },
    [token]
  );

  const update = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist(next);
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (loading) {
    return <LoadingScreen label="Cargando tus datos..." />;
  }

  const missing = data
    ? LABELS.filter(({ key }) => {
        const value = data[key];
        return value === null || value === "";
      }).length +
      (data.guardian?.full_name ? 0 : 1)
    : 0;

  return (
    <div className="relative min-h-screen bg-canvas">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.14),transparent_55%)]"
      />
      <main className="relative mx-auto max-w-xl px-4 py-10">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-950/30">
            <Icon name="pulse" className="h-8 w-8" />
          </span>
          <h1 className="text-xl font-semibold text-slate-900">Tus datos</h1>
          <p className="mt-1 text-sm text-slate-500">
            {respondentName} · revisa la información registrada
          </p>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        {noData && (
          <div className="rounded-2xl border border-line bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">
              No hay datos adicionales que completar para este respondiente.
            </p>
            <Link
              href={`/e/${token}/responder?name=${encodeURIComponent(
                respondentName
              )}`}
              className={`${buttonClass("primary", "lg")} mt-5 w-full justify-center`}
            >
              Comenzar encuesta
            </Link>
          </div>
        )}

        {!noData && data && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Información registrada
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {missing > 0
                      ? `Faltan ${missing} ${
                          missing === 1 ? "dato" : "datos"
                        } por completar.`
                      : "Tus datos están completos."}
                  </p>
                </div>
                {!editing && missing > 0 && (
                  <Button size="sm" onClick={() => setEditing(true)}>
                    Completa lo que falta
                  </Button>
                )}
              </div>

              {!editing && (
                <dl className="mt-4 divide-y divide-line text-sm">
                  {LABELS.map(({ key, label }) => (
                    <div key={key} className="flex justify-between gap-4 py-2.5">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-right font-medium text-slate-900">
                        {(data[key] as string | null) || (
                          <span className="text-amber-600">Pendiente</span>
                        )}
                      </dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-slate-500">Apoderado</dt>
                    <dd className="text-right font-medium text-slate-900">
                      {data.guardian?.full_name || (
                        <span className="text-amber-600">Pendiente</span>
                      )}
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            {editing && (
              <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    Completa lo que falta
                  </h2>
                  <span className="text-xs font-medium text-emerald-600">
                    {saving
                      ? "Guardando..."
                      : saved
                        ? "Guardado ✓"
                        : "Autoguardado activo"}
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Fecha de nacimiento">
                      <input
                        type="date"
                        value={form.birth_date}
                        onChange={(e) =>
                          update({ birth_date: e.target.value })
                        }
                        className={inputClasses}
                      />
                    </Field>
                    <Field label="Lugar de nacimiento">
                      <input
                        type="text"
                        value={form.birth_place}
                        onChange={(e) =>
                          update({ birth_place: e.target.value })
                        }
                        className={inputClasses}
                      />
                    </Field>
                  </div>
                  <Field label="Dirección">
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => update({ address: e.target.value })}
                      className={inputClasses}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Teléfono">
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => update({ phone: e.target.value })}
                        className={inputClasses}
                      />
                    </Field>
                    <Field label="Correo">
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => update({ email: e.target.value })}
                        className={inputClasses}
                      />
                    </Field>
                  </div>

                  <div className="border-t border-line pt-4">
                    <h3 className="mb-3 text-sm font-semibold text-slate-900">
                      Padre, madre o apoderado
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Tipo">
                        <select
                          value={form.guardian_type}
                          onChange={(e) =>
                            update({ guardian_type: e.target.value })
                          }
                          className={selectClasses}
                        >
                          <option value="padre">Padre</option>
                          <option value="madre">Madre</option>
                          <option value="guardian">Apoderado</option>
                        </select>
                      </Field>
                      <Field label="Nombres y apellidos">
                        <input
                          type="text"
                          value={form.guardian_name}
                          onChange={(e) =>
                            update({ guardian_name: e.target.value })
                          }
                          className={inputClasses}
                        />
                      </Field>
                      <Field label="Tipo de documento">
                        <select
                          value={form.guardian_doc_type}
                          onChange={(e) =>
                            update({ guardian_doc_type: e.target.value })
                          }
                          className={selectClasses}
                        >
                          <option value="DNI">DNI</option>
                          <option value="CE">CE</option>
                          <option value="PASSPORT">Pasaporte</option>
                        </select>
                      </Field>
                      <Field label="Documento *">
                        <input
                          type="text"
                          value={form.guardian_doc}
                          onChange={(e) =>
                            update({ guardian_doc: e.target.value })
                          }
                          className={inputClasses}
                          maxLength={20}
                        />
                      </Field>
                      <Field label="Teléfono">
                        <input
                          type="tel"
                          value={form.guardian_phone}
                          onChange={(e) =>
                            update({ guardian_phone: e.target.value })
                          }
                          className={inputClasses}
                        />
                      </Field>
                      <Field label="Correo">
                        <input
                          type="email"
                          value={form.guardian_email}
                          onChange={(e) =>
                            update({ guardian_email: e.target.value })
                          }
                          className={inputClasses}
                        />
                      </Field>
                      <Field label="Parentesco">
                        <input
                          type="text"
                          value={form.guardian_relationship}
                          onChange={(e) =>
                            update({ guardian_relationship: e.target.value })
                          }
                          className={inputClasses}
                          placeholder="Ej: Madre"
                        />
                      </Field>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <Button variant="secondary" onClick={() => setEditing(false)}>
                    Listo
                  </Button>
                </div>
              </div>
            )}

            <Link
              href={`/e/${token}/responder?name=${encodeURIComponent(
                respondentName
              )}`}
              className={`${buttonClass("primary", "lg")} w-full justify-center`}
            >
              Comenzar encuesta
            </Link>
            <p className="text-center text-xs text-slate-400">
              Tus respuestas se guardan automáticamente.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
