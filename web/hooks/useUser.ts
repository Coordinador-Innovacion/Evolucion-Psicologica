"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";

type Profile = Tables<"perfiles">;

/**
 * Hook para obtener el perfil del usuario autenticado.
 * Retorna null mientras carga, undefined si no hay sesión.
 */
export function useUser() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function getProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("perfiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      setProfile(data);
      setLoading(false);
    }

    getProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      getProfile();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { profile, loading };
}

/**
 * Verifica si el usuario tiene un rol específico.
 */
export function useHasRole(role: string) {
  const { profile, loading } = useUser();
  return {
    hasRole: profile?.role === role,
    loading,
  };
}

/**
 * Verifica si el usuario es Global Admin.
 */
export function useIsGlobal() {
  return useHasRole("global");
}
