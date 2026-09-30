"use client";

import { useEffect, useState } from "react";
import { Building2, Globe2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const SCOPE_KEY = "institution_scope";

export function getInstitutionScope(): string {
  if (typeof window === "undefined") return "all";
  return localStorage.getItem(SCOPE_KEY) ?? "all";
}

export function setInstitutionScope(value: string) {
  localStorage.setItem(SCOPE_KEY, value);
  window.dispatchEvent(new CustomEvent("institution-scope-changed"));
}

type Institution = { id: string; name: string };

export function ScopeSelector({
  role,
  institutionId,
}: {
  role: string | null | undefined;
  institutionId: string | null | undefined;
}) {
  const [scope, setScope] = useState("all");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [ownName, setOwnName] = useState<string | null>(null);

  const isGlobal = role === "global";

  useEffect(() => {
    const id = requestAnimationFrame(() => setScope(getInstitutionScope()));
    const onChange = () => setScope(getInstitutionScope());
    window.addEventListener("institution-scope-changed", onChange);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("institution-scope-changed", onChange);
    };
  }, []);

  useEffect(() => {
    if (!isGlobal && institutionId) {
      const supabase = createClient();
      supabase
        .from("institutions")
        .select("name")
        .eq("id", institutionId)
        .single()
        .then(({ data }) => setOwnName(data?.name ?? null));
    }
    if (isGlobal) {
      const supabase = createClient();
      supabase
        .from("institutions")
        .select("id, name")
        .order("name")
        .then(({ data }) => setInstitutions(data ?? []));
    }
  }, [isGlobal, institutionId]);

  if (isGlobal) {
    return (
      <label className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft shadow-sm md:inline-flex">
        <Globe2 className="h-3.5 w-3.5 text-brand-600" />
        <span className="sr-only">Ámbito institucional</span>
        <select
          value={scope}
          onChange={(event) => setInstitutionScope(event.target.value)}
          className="max-w-[10rem] truncate border-none bg-transparent text-xs font-semibold text-ink focus:outline-none"
        >
          <option value="all">Todas las I.E.</option>
          {institutions.map((institution) => (
            <option key={institution.id} value={institution.id}>
              {institution.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (!institutionId) return null;

  return (
    <span
      title={ownName ?? "Institución"}
      className="hidden max-w-[12rem] items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft shadow-sm sm:inline-flex"
    >
      <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-600" />
      <span className="truncate">{ownName ?? "Mi institución"}</span>
    </span>
  );
}
