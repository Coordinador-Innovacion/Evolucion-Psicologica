import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { buttonClass } from "./button";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <Icon name="spinner" className={`animate-spin ${className}`} />
  );
}

export function LoadingScreen({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="h-7 w-7 text-indigo-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white/60 px-6 py-14 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-indigo-50 text-indigo-600">
        <Icon name="clipboard" className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 ${className}`}
    >
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function RestrictedAccess({ message }: { message: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-card">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600">
          <Icon name="alert" className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold text-slate-900">
          Acceso restringido
        </h2>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <Link
          href="/"
          className={buttonClass("secondary", "md", "mt-6")}
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
