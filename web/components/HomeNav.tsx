"use client";

import Link from "next/link";
import { useUser } from "@/hooks/useUser";

const COORD_ROLES = ["global", "director", "admin_ie", "coordinador"] as const;
const OPS_ROLES = [
  "global",
  "director",
  "admin_ie",
  "coordinador",
  "psicologo",
  "docente",
] as const;

function hasRole(
  role: string | null | undefined,
  roles: readonly string[]
): boolean {
  return role !== null && role !== undefined && roles.includes(role);
}

const baseCls =
  "inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700";

export function HomeNav() {
  const { profile, loading } = useUser();

  const showCoord = !loading && hasRole(profile?.role, COORD_ROLES);
  const showAnalitica = !loading && hasRole(profile?.role, OPS_ROLES);
  const isGlobal = !loading && profile?.role === "global";

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Link
        href="/encuestas"
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
      >
        Encuestas
      </Link>
      <Link href="/casos" className={baseCls}>
        Casos
      </Link>
      {showCoord && (
        <Link href="/coordinador" className={baseCls}>
          Coordinación
        </Link>
      )}
      {isGlobal && (
        <Link href="/instituciones" className={baseCls}>
          Instituciones
        </Link>
      )}
      {isGlobal && (
        <Link href="/personal" className={baseCls}>
          Personal
        </Link>
      )}
      {showAnalitica && (
        <Link href="/analitica" className={baseCls}>
          Analítica
        </Link>
      )}
    </div>
  );
}
