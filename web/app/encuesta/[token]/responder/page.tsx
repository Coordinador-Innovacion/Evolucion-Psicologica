"use client";

import { use } from "react";
import { ResponseForm } from "@/components/encuesta/ResponseForm";

export default function ResponderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = use(params);
  const searchP = use(searchParams);
  const respondentName =
    typeof searchP.name === "string" ? searchP.name : "Respondiente";

  return (
    <div>
      <ResponseForm token={token} respondentName={respondentName} />
    </div>
  );
}
