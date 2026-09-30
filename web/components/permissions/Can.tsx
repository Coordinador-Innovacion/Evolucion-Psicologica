"use client";

import type { ReactNode } from "react";
import { useUser } from "@/hooks/useUser";
import { can, canAll, canAny, type Capability } from "@/lib/permissions";

export function Can({
  capability,
  children,
  fallback = null,
}: {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { profile, loading } = useUser();
  if (loading) return fallback;
  return can(profile?.role, capability) ? children : fallback;
}

export function CanAll({
  capabilities,
  children,
  fallback = null,
}: {
  capabilities: readonly Capability[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { profile, loading } = useUser();
  if (loading) return fallback;
  return canAll(profile?.role, capabilities) ? children : fallback;
}

export function CanAny({
  capabilities,
  children,
  fallback = null,
}: {
  capabilities: readonly Capability[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { profile, loading } = useUser();
  if (loading) return fallback;
  return canAny(profile?.role, capabilities) ? children : fallback;
}
