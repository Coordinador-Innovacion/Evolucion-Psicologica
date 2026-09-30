"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { can } from "@/lib/permissions";

export function useNavBadges(role: string | null | undefined): Record<string, number> {
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!role) {
      const id = requestAnimationFrame(() => setBadges({}));
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const next: Record<string, number> = {};

        if (can(role, "casos.consultar")) {
          const { count } = await supabase
            .from("casos")
            .select("id", { count: "exact", head: true })
            .neq("estado", "cerrado");
          if (typeof count === "number" && count > 0) next["/casos"] = count;
        }

        // DER-01: badge de derivaciones sin Caso (para quien puede gestionarlas)
        if (can(role, "derivaciones.crear")) {
          const { count } = await supabase
            .from("derivaciones")
            .select("id", { count: "exact", head: true })
            .is("caso_id", null);
          if (typeof count === "number" && count > 0) next["/derivaciones"] = count;
        }

        if (can(role, "encuestas.gestionar")) {
          const { count } = await supabase
            .from("encuesta_aplicaciones")
            .select("id", { count: "exact", head: true })
            .in("status", ["active", "extended"]);
          if (typeof count === "number" && count > 0) {
            next["/encuestas"] = count;
          }
        }

        if (!cancelled) setBadges(next);
      } catch {
        if (!cancelled) setBadges({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role]);

  return badges;
}
