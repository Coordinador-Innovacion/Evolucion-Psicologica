"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";

type Institution = Tables<"institutions">;

export function useInstitutions(enabled = true) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);

  const refresh = useCallback(() => {
    setReloadVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("institutions")
          .select("*")
          .order("name", { ascending: true });
        if (!cancelled) {
          setInstitutions(error ? [] : data ?? []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setInstitutions([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadVersion]);

  return {
    institutions: enabled ? institutions : [],
    loading: enabled ? loading : false,
    refresh,
  };
}
