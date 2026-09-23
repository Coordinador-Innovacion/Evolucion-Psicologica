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

export function HomeNav() {
  const { profile, loading } = useUser();

  const showCoord = !loading && hasRole(profile?.role, COORD_ROLES);
  const showAnalitica = !loading && hasRole(profile?.role, OPS_ROLES);

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Link
        href="/encuestas"
        className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
      >
        Encuestas
      </Link>
      <Link
        href="/casos"
        className="inline-block px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
      >
        Casos
      </Link>
      {showCoord && (
        <Link
          href="/coordinador"
          className="inline-block px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
        >
          Coordinación
        </Link>
      )}
      {showAnalitica && (
        <Link
          href="/analitica"
          className="inline-block px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
        >
          Analítica
        </Link>
      )}
    </div>
  );
}
