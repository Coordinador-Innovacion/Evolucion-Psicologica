"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { VersionManager } from "@/components/encuestas/versiones/VersionManager";
import { LoadingScreen } from "@/components/ui/feedback";

export default function VersionesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("encuestas")
        .select("title")
        .eq("id", id)
        .single();
      if (data) setTitle(data.title);
      setLoading(false);
    }
    load();
  }, [id]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {title || "Encuesta"}
        </p>
        <h1 className="text-xl font-semibold text-slate-900">Versiones</h1>
      </div>
      {loading ? (
        <LoadingScreen label="Cargando versiones..." />
      ) : (
        <VersionManager surveyId={id} surveyTitle={title} />
      )}
    </div>
  );
}
