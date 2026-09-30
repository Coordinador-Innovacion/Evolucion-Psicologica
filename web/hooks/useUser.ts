"use client";

import { useEffect, useState } from "react";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";

type Profile = Tables<"perfiles">;

const RETRY_MS = 1_500;
const MAX_RETRIES = 20;

function isNetworkError(error: { name?: string; message?: string }): boolean {
  return (
    error.name === "AuthRetryableFetchError" ||
    /fetch|network|load failed|econn|etimedout/i.test(error.message ?? "")
  );
}

/**
 * Hook para obtener el perfil del usuario autenticado.
 * Retorna null mientras carga, undefined si no hay sesión.
 */
export function useUser() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let cancelled = false;

    function retry(): boolean {
      if (cancelled || attempts >= MAX_RETRIES) return false;
      attempts += 1;
      timer = setTimeout(() => void getProfile(), RETRY_MS);
      return true;
    }

    async function getProfile() {
      if (cancelled) return;
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (!user) {
          if (
            userErr &&
            !isAuthSessionMissingError(userErr) &&
            isNetworkError(userErr) &&
            retry()
          ) {
            return;
          }
          setProfile(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("perfiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (error && isNetworkError(error) && retry()) return;

        setProfile(data);
        setLoading(false);
      } catch (err) {
        if (isNetworkError(err as Error) && retry()) {
          return;
        }
        setProfile(null);
        setLoading(false);
      }
    }

    void getProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      attempts = 0;
      void getProfile();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
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
