"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, inputClasses } from "@/components/ui/field";

interface Props {
  open: boolean;
  sourceTitle: string;
  copying: boolean;
  onClose: () => void;
  onCopy: (newTitle: string) => void;
}

export function CopySurveyDialog({
  open,
  sourceTitle,
  copying,
  onClose,
  onCopy,
}: Props) {
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() =>
      setTitle(`${sourceTitle} (copia)`)
    );
    return () => cancelAnimationFrame(raf);
  }, [open, sourceTitle]);

  const handleCopy = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCopy(trimmed);
  };

  return (
    <Modal open={open} onClose={onClose} title="Copiar encuesta">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          La copia es completamente independiente; los cambios no afectan a la
          original. No se crea una versión de la original.
        </p>

        <Field label="Nuevo título *">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClasses}
            required
            autoFocus
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={copying}>
            Cancelar
          </Button>
          <Button onClick={handleCopy} disabled={copying || !title.trim()}>
            {copying ? "Copiando..." : "Copiar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
