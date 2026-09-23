"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
 * Registrar nuevo usuario.
 * El trigger handle_new_user crea el perfil automáticamente.
 */
export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const documentNumber = formData.get("document_number") as string;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        document_number: documentNumber,
        role: "docente",
      },
    },
  });

  if (error) {
    redirect("/auth/registro?error=signup");
  }

  redirect("/auth/confirmacion");
}

/**
 * Cerrar sesión.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
