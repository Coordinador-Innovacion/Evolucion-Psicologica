"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

async function getAppOrigin(): Promise<string> {
  const h = await headers();
  const origin =
    h.get("x-forwarded-origin") ||
    h.get("origin") ||
    (h.get("x-forwarded-proto") && h.get("host")
      ? `${h.get("x-forwarded-proto")}://${h.get("host")}`
      : null) ||
    (h.get("host") ? `https://${h.get("host")}` : null);
  if (origin) return origin.replace(/\/$/, "");
  return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
}

/**
 * Iniciar sesión con email y contraseña.
 * En caso de error, redirige a login con parámetro de error.
 */
export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/auth/login?error=credentials");
  }

  redirect("/");
}

/**
 * Registrar nuevo usuario docente.
 * Requiere institution_code (código modular) validado en backend (T67).
 * El trigger handle_new_user resuelve institution_id server-side.
 */
export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const documentNumber = formData.get("document_number") as string;
  const institutionCode = ((formData.get("institution_code") as string) || "").trim();

  if (!institutionCode) {
    redirect("/auth/registro?error=institution");
  }

  const origin = await getAppOrigin();
  const emailRedirectTo = origin ? `${origin}/auth/callback` : undefined;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        document_number: documentNumber,
        role: "docente",
        institution_code: institutionCode,
      },
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });

  if (error) {
    redirect("/auth/registro?error=signup");
  }

  redirect("/auth/confirmacion");
}

/**
 * Solicitar recuperación de contraseña (Supabase Auth estándar).
 */
export async function resetPassword(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const origin = await getAppOrigin();
  const redirectTo = origin ? `${origin}/auth/nueva-clave` : undefined;

  await supabase.auth.resetPasswordForEmail(email, {
    ...(redirectTo ? { redirectTo } : {}),
  });

  redirect("/auth/recuperar?sent=1");
}

/**
 * Establecer nueva contraseña tras el enlace de recuperación.
 */
export async function updatePassword(formData: FormData) {
  const supabase = await createClient();
  const password = formData.get("password") as string;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?error=credentials");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/auth/nueva-clave?error=update");
  }

  redirect("/auth/login?reset=1");
}

/**
 * Cerrar sesión.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
