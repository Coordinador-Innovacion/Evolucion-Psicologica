"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BadgeCheck,
  KeyRound,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useTheme } from "@/hooks/useTheme";
import { changePassword } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/components/layout/nav";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PasswordField } from "@/components/auth/PasswordField";

function PerfilTab() {
  const { profile } = useUser();
  const [institutionName, setInstitutionName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (profile?.institution_id) {
      supabase
        .from("institutions")
        .select("name")
        .eq("id", profile.institution_id)
        .single()
        .then(({ data }) => setInstitutionName(data?.name ?? null));
    }
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [profile?.institution_id]);

  if (!profile) return null;

  const rows: { label: string; value: string | null }[] = [
    { label: "Nombre completo", value: profile.full_name },
    { label: "Documento", value: profile.document_number },
    { label: "Correo", value: email },
    { label: "Rol", value: ROLE_LABELS[profile.role] ?? profile.role },
    { label: "Institución", value: institutionName ?? profile.institution_id },
  ];

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="mb-5 flex items-center gap-4">
        <Avatar name={profile.full_name} size="lg" />
        <div>
          <p className="font-display text-lg font-bold text-ink">
            {profile.full_name}
          </p>
          <p className="text-sm text-ink-muted">
            {ROLE_LABELS[profile.role] ?? profile.role}
          </p>
        </div>
      </div>
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm text-ink-muted">{row.label}</dt>
            <dd className="truncate text-sm font-medium text-ink">
              {row.value || "—"}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
        Los cambios de datos personales los realiza el administrador de tu
        institución.
      </p>
    </div>
  );
}

function SeguridadTabInner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const ok = searchParams.get("ok");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [matchError, setMatchError] = useState<string | null>(null);
  const [closingOthers, setClosingOthers] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (password !== confirm || password.length < 8) {
      event.preventDefault();
      setMatchError("Las contraseñas deben coincidir y tener 8+ caracteres.");
      return;
    }
    setMatchError(null);
  }

  async function cerrarOtrasSesiones() {
    setClosingOthers(true);
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "others",
      });
      if (signOutError) throw signOutError;
      toast.success("Se cerraron las otras sesiones");
    } catch {
      toast.error("No se pudieron cerrar las otras sesiones");
    } finally {
      setClosingOthers(false);
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <form
        onSubmit={handleSubmit}
        action={changePassword}
        className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-card"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-600" />
          <h3 className="font-display text-sm font-bold text-ink">
            Cambiar contraseña
          </h3>
        </div>

        {ok && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          >
            <BadgeCheck className="h-4 w-4" />
            Contraseña actualizada correctamente.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <AlertCircle className="h-4 w-4" />
            No se pudo actualizar la contraseña. Revisa los datos.
          </p>
        )}

        <PasswordField
          id="new-password"
          name="password"
          label="Nueva contraseña"
          autoComplete="new-password"
          minLength={8}
          strength
          onValueChange={setPassword}
        />
        <PasswordField
          id="confirm-password"
          name="password_confirm"
          label="Confirmar contraseña"
          autoComplete="new-password"
          minLength={8}
          onValueChange={setConfirm}
        />
        {matchError && (
          <p className="text-sm text-rose-600" role="alert">
            {matchError}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong"
        >
          Actualizar contraseña
        </button>
      </form>

      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2">
          <LogOut className="h-4 w-4 text-brand-600" />
          <h3 className="font-display text-sm font-bold text-ink">
            Otras sesiones
          </h3>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Cierra la sesión en todos los demás dispositivos, manteniendo esta
          sesión activa.
        </p>
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={cerrarOtrasSesiones}
            disabled={closingOthers}
          >
            {closingOthers ? "Cerrando..." : "Cerrar otras sesiones"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AparienciaTab() {
  const { theme, setTheme } = useTheme();

  const options = [
    {
      id: "light",
      label: "Claro",
      description: "Fondo claro, ideal para oficina",
      icon: <Sun className="h-5 w-5" />,
    },
    {
      id: "dark",
      label: "Oscuro",
      description: "Fondo oscuro, reduce la fatiga visual",
      icon: <Moon className="h-5 w-5" />,
    },
  ] as const;

  return (
    <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
      {options.map((option) => {
        const active = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(option.id)}
            className={`rounded-2xl border p-5 text-left shadow-card transition ${
              active
                ? "border-brand-500 bg-primary-soft glow-primary"
                : "border-line bg-surface hover:border-brand-500/40"
            }`}
          >
            <span
              className={`grid h-10 w-10 place-items-center rounded-xl ${
                active
                  ? "bg-brand-500 text-white"
                  : "bg-primary-soft text-primary"
              }`}
            >
              {option.icon}
            </span>
            <p className="mt-3 font-semibold text-ink">{option.label}</p>
            <p className="mt-1 text-xs text-ink-muted">{option.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function ConfiguracionContent({ initialTab }: { initialTab?: string }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(
    () => initialTab ?? searchParams.get("tab") ?? "perfil"
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Configuración"
        subtitle="Perfil, seguridad y apariencia de tu cuenta"
        breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Configuración" }]}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        className="mb-6 max-w-lg"
        tabs={[
          { id: "perfil", label: "Perfil" },
          { id: "seguridad", label: "Seguridad" },
          { id: "apariencia", label: "Apariencia" },
        ]}
      />

      {tab === "perfil" && <PerfilTab />}
      {tab === "seguridad" && (
        <Suspense>
          <SeguridadTabInner />
        </Suspense>
      )}
      {tab === "apariencia" && <AparienciaTab />}
    </div>
  );
}
