"use client";

import type { CasoEstado } from "@/types/supabase";

const LABELS: Record<CasoEstado, string> = {
  inicio: "Inicio",
  en_proceso: "En proceso",
  cerrado: "Cerrado",
};

const STYLES: Record<CasoEstado, string> = {
  inicio: "bg-blue-100 text-blue-800",
  en_proceso: "bg-amber-100 text-amber-800",
  cerrado: "bg-gray-100 text-gray-600",
};

interface Props {
  estado: CasoEstado;
  className?: string;
}

export function CaseStatusBadge({ estado, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STYLES[estado]} ${className}`}
    >
      {LABELS[estado]}
    </span>
  );
}
