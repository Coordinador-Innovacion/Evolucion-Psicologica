import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  );
}

/**
 * Obtiene el perfil del usuario autenticado.
 * Retorna null si no hay sesión o el perfil no existe.
 */
export async function getUserProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("perfiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return profile;
}

/**
 * Verifica si el usuario tiene un rol específico.
 */
export async function hasRole(role: string) {
  const profile = await getUserProfile();
  return profile?.role === role;
}

/**
 * Verifica si el usuario es Global Admin.
 */
export async function isGlobal() {
  return hasRole("global");
}
