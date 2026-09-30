"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, FileSearch, Search, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS, canSeeNavItem } from "./nav";

type StudentHit = {
  id: string;
  full_name: string;
  document_number: string;
};

export function CommandPalette({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: string | null | undefined;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const navResults = useMemo(
    () =>
      NAV_ITEMS.filter(
        (item) =>
          canSeeNavItem(item, role) &&
          (!query ||
            item.label.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase()))
      ),
    [query, role]
  );

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      setQuery("");
      setStudents([]);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(debounce.current);
    const q = query.trim();
    debounce.current = setTimeout(
      async () => {
        if (q.length < 2) {
          setStudents([]);
          setSearching(false);
          return;
        }
        setSearching(true);
        try {
          const safe = q.replace(/[%,()]/g, " ").trim();
          if (safe.length < 2) {
            setStudents([]);
            return;
          }
          const supabase = createClient();
          const { data, error } = await supabase
            .from("estudiantes")
            .select("id, first_names, last_names, document_number")
            .or(
              `first_names.ilike.%${safe}%,last_names.ilike.%${safe}%,document_number.ilike.%${safe}%`
            )
            .limit(6);
          if (error) throw error;
          setStudents(
            (data ?? []).map((row) => ({
              id: row.id,
              full_name: `${row.first_names} ${row.last_names}`.trim(),
              document_number: row.document_number,
            }))
          );
        } catch {
          setStudents([]);
        } finally {
          setSearching(false);
        }
      },
      q.length < 2 ? 0 : 250
    );
    return () => clearTimeout(debounce.current);
  }, [open, query]);

  function goTo(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/50 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            role="dialog"
            aria-label="Búsqueda global"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 shrink-0 text-ink-muted" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar estudiante por nombre o DNI…"
                className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
              />
              <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-muted sm:block">
                ESC
              </kbd>
            </div>

            <div className="max-h-72 overflow-y-auto p-2">
              {students.length > 0 && (
                <Section label="Estudiantes">
                  {students.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => goTo(`/casos?estudiante=${student.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-primary-soft"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {student.full_name}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          DNI {student.document_number}
                        </span>
                      </span>
                      <span className="text-xs text-ink-muted">Ver casos</span>
                      <CornerDownLeft className="h-3.5 w-3.5 text-ink-muted" />
                    </button>
                  ))}
                </Section>
              )}

              {navResults.length > 0 && (
                <Section label="Navegación">
                  {navResults.map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => goTo(item.href)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-primary-soft"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {item.label}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {item.description}
                        </span>
                      </span>
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                    </button>
                  ))}
                </Section>
              )}

              {students.length === 0 &&
                navResults.length === 0 &&
                (searching ? (
                  <p className="px-3 py-6 text-center text-sm text-ink-muted">
                    Buscando…
                  </p>
                ) : (
                  <div className="px-3 py-6 text-center">
                    <FileSearch className="mx-auto h-6 w-6 text-ink-muted" />
                    <p className="mt-2 text-sm text-ink-muted">
                      Sin resultados para “{query}”.
                    </p>
                  </div>
                ))}
            </div>

            <div className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">
              Solo ves estudiantes visibles para tu rol (RLS). La búsqueda nunca
              incluye contenido clínico.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      {children}
    </div>
  );
}
