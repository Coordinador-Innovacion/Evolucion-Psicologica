import type { Metadata } from "next";
import { VerifyEmailActions, VerifyEmailIcon } from "@/components/auth/VerifyEmail";

export const metadata: Metadata = { title: "Revisa tu correo" };

export default async function VerificaCorreoPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card sm:p-8">
      <VerifyEmailIcon />
      <h2 className="font-display text-xl font-bold text-ink">
        Revisa tu correo
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        Te enviamos un enlace de confirmación
        {email ? (
          <>
            {" "}
            a <span className="font-medium text-ink-soft">{email}</span>
          </>
        ) : null}
        . Haz clic en el enlace para activar tu cuenta.
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        ¿No lo ves? Revisa la carpeta de correo no deseado.
      </p>
      <VerifyEmailActions email={email} />
    </div>
  );
}
