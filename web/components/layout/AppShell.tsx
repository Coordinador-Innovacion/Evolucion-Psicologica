"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { signOut } from "@/lib/actions/auth";
import { canAccessPath } from "@/lib/permissions";
import { APP_NAME, APP_PHRASE, APP_TAGLINE } from "@/lib/app";
import { Icon } from "@/components/ui/icons";
import { Toaster } from "sonner";
import { CommandPalette } from "./CommandPalette";
import { LicenseBanner } from "./LicenseBanner";
import { NotificationsBell } from "./NotificationsBell";
import { ScopeSelector } from "./ScopeSelector";
import { UserMenu } from "./UserMenu";
import { useNavBadges } from "./nav-badges";
import {
  NAV_ITEMS,
  canSeeNavItem,
  pageTitleFor,
  type NavItem,
} from "./nav";

const PLAIN_PREFIXES = ["/auth/", "/encuesta/", "/403", "/404", "/500"];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  pathname,
  loading,
  role,
  badges,
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  pathname: string;
  loading: boolean;
  role: string | null | undefined;
  badges: Record<string, number>;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  const items = loading
    ? null
    : NAV_ITEMS.filter((item) => canSeeNavItem(item, role));

  return (
    <div className="sidebar-gradient relative flex h-full flex-col overflow-hidden">
      <Link
        href="/"
        onClick={onClose}
        className={`relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5 ${
          collapsed ? "justify-center px-0" : ""
        }`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-white backdrop-blur">
          <Icon name="pulse" className="h-5 w-5" />
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-bold text-white">
              {APP_NAME}
            </span>
            <span className="block text-[11px] text-white/60">{APP_TAGLINE}</span>
          </span>
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-white/60 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </Link>

      <nav className="relative z-10 flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {[6, 8, 7, 6, 8].map((w, i) => (
              <div
                key={i}
                className="h-9 rounded-lg bg-white/10"
                style={{ width: `${w * 10}%` }}
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {items?.map((item: NavItem) => {
              const active = isActivePath(pathname, item.href);
              const badge = badges[item.href];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={
                      active
                        ? "flex items-center gap-3 rounded-lg bg-white/20 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 backdrop-blur transition"
                        : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                    }
                  >
                    <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                    {!collapsed && typeof badge === "number" && (
                      <span className="ml-auto grid min-h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <svg
        aria-hidden="true"
        viewBox="0 0 200 40"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-14 left-0 h-16 w-full opacity-40"
      >
        <path
          d="M0 30 C 40 10, 80 44, 120 24 S 180 6, 200 26 L 200 40 L 0 40 Z"
          fill="rgba(255,255,255,0.12)"
        />
        <path
          d="M0 34 C 50 20, 90 42, 140 30 S 185 22, 200 32 L 200 40 L 0 40 Z"
          fill="rgba(255,255,255,0.16)"
        />
      </svg>

      <div
        className={`relative z-10 border-t border-white/10 px-5 py-4 ${
          collapsed ? "px-2 text-center" : ""
        }`}
      >
        {!collapsed && (
          <p className="mb-3 text-xs leading-relaxed text-white/60">
            {APP_PHRASE}
          </p>
        )}
        <div
          className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}
        >
          <button
            type="button"
            onClick={() => signOut()}
            aria-label="Cerrar sesión"
            className="flex items-center gap-2 text-xs font-medium text-white/60 transition hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && "Cerrar sesión"}
          </button>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
              className="ml-auto hidden rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white lg:block"
            >
              <ChevronLeft
                className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const visible = items.slice(0, 5);

  return (
    <nav
      aria-label="Navegación móvil"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {visible.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition ${
                  active ? "text-brand-600" : "text-ink-muted hover:text-ink-soft"
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const badges = useNavBadges(profile?.role ?? null);
  const [dateLabel] = useState(() =>
    new Date().toLocaleDateString("es-PE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setCollapsed(localStorage.getItem("sidebar_collapsed") === "1");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((current) => {
      localStorage.setItem("sidebar_collapsed", current ? "0" : "1");
      return !current;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isPlain = PLAIN_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isLanding = pathname === "/" && (loading || !profile);

  const role = profile?.role ?? null;

  const needsLogin = !loading && !profile && !isPlain && !isLanding;

  useEffect(() => {
    if (needsLogin) {
      router.replace("/auth/login");
    }
  }, [needsLogin, router]);

  const authorized =
    loading || !profile ? true : canAccessPath(role, pathname);

  useEffect(() => {
    if (!loading && profile && !authorized) {
      router.replace("/403");
    }
  }, [loading, profile, authorized, router]);

  if (isPlain || isLanding) {
    return <>{children}</>;
  }

  if (needsLogin || !authorized) {
    return null;
  }

  const title = pageTitleFor(pathname);
  const navItems = NAV_ITEMS.filter((item) => canSeeNavItem(item, role));

  return (
    <div className="min-h-screen">
      <LicenseBanner institutionId={profile?.institution_id ?? null} />

      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:block ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
      >
        <SidebarContent
          pathname={pathname}
          loading={loading}
          role={role}
          badges={badges}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/50"
          />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-2xl">
            <SidebarContent
              pathname={pathname}
              loading={loading}
              role={role}
              badges={badges}
              collapsed={false}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      <div
        className={`flex min-h-screen flex-col pb-16 lg:pb-0 ${
          collapsed ? "lg:pl-[76px]" : "lg:pl-64"
        }`}
      >
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line px-4 sm:px-6">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-ink-muted transition hover:bg-primary-soft hover:text-brand-600 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-bold text-ink">
              {title}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink-muted shadow-sm transition hover:border-brand-500/40 hover:text-brand-600 md:flex"
          >
            <Search className="h-4 w-4" />
            <span>Buscar estudiante…</span>
            <kbd className="ml-2 rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-semibold">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            aria-label="Búsqueda global (⌘K)"
            onClick={() => setPaletteOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-sm transition hover:border-brand-500/40 hover:text-brand-600 md:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          {dateLabel && (
            <span className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted shadow-sm xl:inline-flex">
              <CalendarDays className="h-3.5 w-3.5 text-brand-600" />
              {dateLabel}
            </span>
          )}

          <ScopeSelector role={role} institutionId={profile?.institution_id} />
          <NotificationsBell role={role} />
          <UserMenu />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <MobileBar items={navItems} />

      <Toaster richColors position="top-right" closeButton />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        role={role}
      />
    </div>
  );
}
