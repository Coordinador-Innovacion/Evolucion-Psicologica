"use client";

import { use } from "react";
import { DniAccessForm } from "@/components/encuesta/DniAccessForm";

export default function TokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          Evolución Psicológica
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Encuesta institucional
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <DniAccessForm token={token} />
      </div>
    </div>
  );
}
