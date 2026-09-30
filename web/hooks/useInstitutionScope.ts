"use client";

import { useEffect, useState } from "react";
import { getInstitutionScope } from "@/components/layout/ScopeSelector";

/**
 * Institución efectiva para una página con alcance:
 * - No Global: la institución del perfil.
 * - Global: el alcance del selector global ("all" = null → todas las I.E.).
 */
export function useInstitutionScope(
  profileInstitutionId: string | null | undefined,
  isGlobal: boolean
): string | null {
  const [scope, setScope] = useState<string | null>(
    isGlobal ? null : profileInstitutionId ?? null
  );

  useEffect(() => {
    if (!isGlobal) {
      const raf = requestAnimationFrame(() => setScope(profileInstitutionId ?? null));
      return () => cancelAnimationFrame(raf);
    }
    const update = () => setScope(getInstitutionScope());
    const raf = requestAnimationFrame(update);
    window.addEventListener("institution-scope-changed", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("institution-scope-changed", update);
    };
  }, [isGlobal, profileInstitutionId]);

  return scope === "all" ? null : scope;
}
