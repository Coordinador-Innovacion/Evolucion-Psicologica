"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { LoadingScreen, RestrictedAccess } from "@/components/ui/feedback";

export default function RegistroEstudiantePage() {
  const { profile, loading: profileLoading } = useUser();

  const [dni, setDni] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [found, setFound] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [documentType, setDocumentType] = useState("DNI");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const isPsychologist =
    profile?.role === "psicologo" || profile?.role === "global";

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dni.trim()) return;
    setSearching(true);
    setSearchError(null);
    setFound(false);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("estudiantes")
        .select("id, first_names, last_names, document_number")
        .eq("document_number", dni.trim())
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFound(true);
        setSearchError(null);
        setFirstName(data.first_names);
        setLastName(data.last_names);
        setDni(data.document_number);
      } else {
        setFound(false);
        setSearchError(
          "Estudiante no encontrado. Puede registrar uno nuevo con datos mínimos."
        );
        setFirstName("");
        setLastName("");
        setBirthDate("");
      }
    } catch (err) {
      logClientError("registro.search", err);
      setSearchError(toUserMessage(err, "Error al buscar estudiante"));
    }
    setSearching(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dni.trim() || !firstName.trim() || !lastName.trim() || !birthDate) {
      return;
    }
    setSaving(true);
    setSaveError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("estudiantes")
        .insert({
          first_names: firstName.trim(),
          last_names: lastName.trim(),
          document_type: documentType,
          document_number: dni.trim(),
          birth_date: birthDate,
        })
        .select("id")
        .single();

      if (error) throw error;

      setSaved(true);
      setSavedId(data.id);
    } catch (err) {
      logClientError("registro.register", err);
      setSaveError(toUserMessage(err, "Error al registrar estudiante"));
    }
    setSaving(false);
  };

  if (profileLoading) {
    return <LoadingScreen label="Cargando..." />;
  }

  if (!isPsychologist) {
    return (
      <RestrictedAccess message="Solo el Psicólogo puede registrar estudiantes." />
    );
  }

  if (saved) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-600">
            ✓
          </span>
          <h2 className="text-lg font-semibold text-slate-900">
            Estudiante registrado
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            <strong>
              {firstName} {lastName}
            </strong>{" "}
            ha sido registrado con DNI {dni}.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            El estudiante ya puede acceder a la encuesta mediante su DNI.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => {
                setSaved(false);
                setSavedId(null);
                setDni("");
                setFirstName("");
                setLastName("");
                setBirthDate("");
                setFound(false);
                setSearchError(null);
              }}
              className={buttonClass("secondary", "md")}
            >
              Registrar otro
            </button>
            <Link href="/" className={buttonClass("primary", "md")}>
              Volver al inicio
            </Link>
          </div>
          {savedId && (
            <p className="mt-4 text-xs text-slate-400">
              ID del estudiante: {savedId}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Registro mínimo de estudiante
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Datos mínimos obligatorios para habilitar el acceso del estudiante a
            encuestas.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white p-6 shadow-card">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">
            1. Buscar por DNI
          </h2>
          <form onSubmit={handleSearch} className="flex space-x-3">
            <input
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Número de DNI"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={20}
            />
            <button
              type="submit"
              disabled={searching || !dni.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {searchError && !found && (
            <p className="mt-3 text-sm text-amber-600">{searchError}</p>
          )}

          {found && (
            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
              <p className="text-sm text-emerald-700">
                Estudiante encontrado: <strong>{firstName} {lastName}</strong> (DNI: {dni})
              </p>
            </div>
          )}
        </div>

        {found ? (
          <div className="rounded-xl border border-line bg-white p-6 shadow-card">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              Datos del estudiante
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Nombres
                </label>
                <p className="text-sm text-slate-900">{firstName}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Apellidos
                </label>
                <p className="text-sm text-slate-900">{lastName}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Documento
                </label>
                <p className="text-sm text-slate-900">
                  {documentType}: {dni}
                </p>
              </div>
            </div>
            <div className="mt-6">
              <Link
                href="/"
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                El estudiante ya puede acceder a encuestas.
              </Link>
            </div>
          </div>
        ) : dni && !searching ? (
          <div className="rounded-xl border border-line bg-white p-6 shadow-card">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">
              2. Registrar datos mínimos
            </h2>
            <form onSubmit={handleRegister}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Tipo de documento *
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="DNI">DNI</option>
                    <option value="CE">Carné de Extranjería</option>
                    <option value="PASS">Pasaporte</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Número de documento *
                  </label>
                  <input
                    type="text"
                    value={dni}
                    disabled
                    className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Nombres completos *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Nombres del estudiante"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Apellidos completos *
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Apellidos del estudiante"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Fecha de nacimiento *
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              {saveError && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-md text-sm text-rose-700">
                  {saveError}
                </div>
              )}

              <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => {
                setDni("");
                setFirstName("");
                setLastName("");
                setBirthDate("");
                setFound(false);
                setSearchError(null);
              }}
              className={buttonClass("secondary", "md")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                !firstName.trim() ||
                !lastName.trim() ||
                !birthDate
              }
              className={buttonClass("primary", "md", saving ? "opacity-50" : "")}
            >
              {saving ? "Registrando..." : "Registrar estudiante"}
            </button>
              </div>
            </form>
          </div>
        ) : null}
    </div>
  );
}
