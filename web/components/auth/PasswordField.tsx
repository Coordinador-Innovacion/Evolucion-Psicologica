"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const inputClass =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2.5 pr-11 text-sm text-ink placeholder:text-ink-muted shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export function PasswordField({
  id,
  name = "password",
  label = "Contraseña",
  autoComplete = "current-password",
  placeholder = "••••••••",
  required = true,
  minLength,
  strength = false,
  onValueChange,
}: {
  id: string;
  name?: string;
  label?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  strength?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");

  const score = computeStrength(value);
  const strengthLabel = ["Muy débil", "Débil", "Aceptable", "Fuerte", "Muy fuerte"][score];

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onValueChange?.(event.target.value);
          }}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted transition hover:text-brand-600"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {strength && value.length > 0 && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1" role="presentation">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full transition ${
                  index < score
                    ? score <= 1
                      ? "bg-rose-500"
                      : score === 2
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    : "bg-line"
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Fortaleza: <span className="font-medium">{strengthLabel}</span>
            {minLength ? ` · mínimo ${minLength} caracteres` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function computeStrength(value: string): number {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}
