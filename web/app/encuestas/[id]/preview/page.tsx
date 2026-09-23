"use client";

import { use } from "react";
import Link from "next/link";
import { PreviewContent } from "@/components/encuestas/preview/PreviewContent";

export default function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

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
              <span className="text-sm text-gray-400">Vista Previa</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href={`/encuestas/${id}/constructor`}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Volver al constructor
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PreviewContent surveyId={id} />
      </main>
    </div>
  );
}
