"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ApplicationManager } from "@/components/encuestas/aplicaciones/ApplicationManager";

export default function AplicacionesPage({
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/" className="text-xl font-bold text-gray-900">
                Evolución Psicológica
              </Link>
              <Link
                href="/encuestas"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Encuestas
              </Link>
              <span className="text-sm text-gray-400">Aplicaciones</span>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Cargando...</div>
        ) : (
          <ApplicationManager surveyId={id} surveyTitle={title} />
        )}
      </main>
    </div>
  );
}
