"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MailCheck, RefreshCw } from "lucide-react";
import { resendConfirmation } from "@/lib/actions/auth";

const COOLDOWN_SECONDS = 45;

export function VerifyEmailActions({ email }: { email?: string }) {
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    if (cooldown > 0 || sending) return;
    setSending(true);
    try {
      await resendConfirmation(email);
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <button
        type="button"
        onClick={handleResend}
        disabled={cooldown > 0 || sending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-strong disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${sending ? "animate-spin" : ""}`} />
        {cooldown > 0
          ? `Reenviar en ${cooldown}s`
          : sending
            ? "Reenviando…"
            : "Reenviar confirmación"}
      </button>

      {sent && cooldown > 0 && (
        <p role="status" className="text-center text-sm text-emerald-600">
          Si el correo existe, reenviamos la confirmación.
        </p>
      )}

      <div className="text-center text-sm">
        <Link
          href="/auth/login"
          className="font-medium text-brand-600 transition hover:text-brand-600"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    </div>
  );
}

export function VerifyEmailIcon() {
  return (
    <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
      <MailCheck className="h-7 w-7" />
    </span>
  );
}
