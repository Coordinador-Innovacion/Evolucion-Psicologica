"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LEGACY_SECTIONS = ["A", "B", "U"];

/**
 * Catálogo de secciones de una I.E. (tabla `secciones`, migración 062).
 * Si la institución todavía no tiene filas, cae al conjunto legado A/B/U.
 */
export function useSeccionesCatalog(institutionId: string | null | undefined) {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!institutionId) {
      const raf = requestAnimationFrame(() => {
        setCatalog([]);
        setError(null);
      });
      return () => cancelAnimationFrame(raf);
    }
    let cancelled = false;
    createClient()
      .from("secciones")
      .select("name")
      .eq("institution_id", institutionId)
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setCatalog([]);
          setError("No se pudo cargar el catálogo de secciones.");
        } else {
          setCatalog((data ?? []).map((row) => String(row.name)));
          setError(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  useEffect(() => reload(), [reload]);

  return {
    /** Opciones para selects: catálogo activo o legado A/B/U si está vacío. */
    sections: catalog.length > 0 ? catalog : LEGACY_SECTIONS,
    /** true si la institución tiene un catálogo propio cargado. */
    fromCatalog: catalog.length > 0,
    error,
    reload,
  };
}

/** Devuelve opciones asegurando que la sección actual siempre esté incluida. */
export function withCurrentSection(options: string[], current: string): string[] {
  const value = current.trim();
  if (value && !options.includes(value)) return [...options, value];
  return options;
}
