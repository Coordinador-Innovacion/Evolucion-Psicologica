import { createClient } from "@/lib/supabase/client";

export type AlertItem = {
  id: string;
  kind: "licencia" | "transferencia" | "promocion";
  title: string;
  detail: string;
  href: string;
  tone: "amber" | "rose" | "blue";
  created: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadAlerts(role: string | null | undefined): Promise<AlertItem[]> {
  const supabase = createClient();
  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const alerts: AlertItem[] = [];

  const [{ data: licencias }, { data: transferencias }, { data: lotes }] =
    await Promise.all([
      supabase
        .from("licencias")
        .select("id, institution_id, end_date")
        .lte("end_date", in30)
        .order("end_date")
        .limit(10),
      supabase
        .from("transferencias")
        .select("id, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("lotes_promocion")
        .select("id, status, started_at")
        .in("status", ["INTERRUPTED", "FAILED"])
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

  for (const licencia of licencias ?? []) {
    const days = Math.ceil(
      (new Date(`${licencia.end_date}T23:59:59`).getTime() - Date.now()) /
        DAY_MS
    );
    const expired = licencia.end_date < todayStr;
    alerts.push({
      id: `lic-${licencia.id}`,
      kind: "licencia",
      tone: expired ? "rose" : "amber",
      title: expired ? "Licencia vencida" : `Licencia vence en ${days} días`,
      detail: expired
        ? "Las nuevas atenciones psicológicas están bloqueadas."
        : "Renueva para evitar interrupciones.",
      href: role === "global" ? "/instituciones" : "/coordinador",
      created: licencia.end_date,
    });
  }

  for (const transferencia of transferencias ?? []) {
    alerts.push({
      id: `trans-${transferencia.id}`,
      kind: "transferencia",
      tone: "blue",
      title: "Transferencia pendiente por autorizar",
      detail: "Revisa el caso y autoriza o rechaza la solicitud.",
      href: "/coordinador",
      created: transferencia.created_at,
    });
  }

  for (const lote of lotes ?? []) {
    alerts.push({
      id: `promo-${lote.id}`,
      kind: "promocion",
      tone: "rose",
      title: "Promoción interrumpida",
      detail:
        lote.status === "FAILED"
          ? "El lote finalizó con errores."
          : "El lote se detuvo antes de completarse.",
      href: "/coordinador",
      created: lote.started_at,
    });
  }

  return alerts;
}
