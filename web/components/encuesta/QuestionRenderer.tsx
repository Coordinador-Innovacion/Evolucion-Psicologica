"use client";

import { useState } from "react";
import type { SurveyQuestionData } from "@/types/encuestas";

interface Props {
  question: SurveyQuestionData;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

const EMOJI_FACES = ["😟", "😕", "😐", "🙂", "😀"];

function emojiForIndex(index: number, count: number): string {
  if (count <= 1) return EMOJI_FACES[4];
  const pos = Math.round((index * (EMOJI_FACES.length - 1)) / (count - 1));
  return EMOJI_FACES[pos];
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  disabled,
}: Props) {
  const { question_type: type, config, presentation, options } = question;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = config as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pres = presentation as any;

  const [optionQuery, setOptionQuery] = useState("");

  const mode = pres?.mode === "visual" ? "visual" : "normal";
  const escalaStyle: string =
    type === "escala" && mode === "visual" && pres?.style
      ? String(pres.style)
      : "segments";
  const optionIcons: Record<string, string> =
    pres?.option_icons && typeof pres.option_icons === "object"
      ? pres.option_icons
      : {};

  const labelBlock = (
    <div className="mb-2">
      <label className="block text-sm font-medium text-slate-900">
        {question.label}
        {question.is_required && (
          <span className="text-rose-500 ml-1">*</span>
        )}
      </label>
      {question.description && (
        <p className="mt-0.5 text-xs text-slate-500">{question.description}</p>
      )}
    </div>
  );

  const widthClass =
    pres?.width === "half" ? "max-w-md" : "max-w-2xl";

  const selectedCount = Array.isArray(value) ? value.length : 0;
  const multiMax =
    cfg?.max_selected !== null && cfg?.max_selected !== undefined
      ? Number(cfg.max_selected)
      : null;
  const multiReached = multiMax !== null && selectedCount >= multiMax;

  switch (type) {
    case "texto_corto":
      return (
        <div className={widthClass}>
          {labelBlock}
          <input
            type="text"
            value={(value as string) || ""}
            onChange={(e) => {
              const max = cfg?.max_length || 255;
              if (e.target.value.length <= max) onChange(e.target.value);
            }}
            disabled={disabled}
            maxLength={cfg?.max_length || 255}
            placeholder={cfg?.placeholder || ""}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
          />
        </div>
      );

    case "texto_largo":
      return (
        <div className={widthClass}>
          {labelBlock}
          <textarea
            value={(value as string) || ""}
            onChange={(e) => {
              const max = cfg?.max_length || 2000;
              if (e.target.value.length <= max) onChange(e.target.value);
            }}
            disabled={disabled}
            maxLength={cfg?.max_length || 2000}
            rows={4}
            placeholder={cfg?.placeholder || ""}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 resize-y"
          />
          <p className="mt-1 text-xs text-slate-400 text-right">
            {((value as string) || "").length}/{cfg?.max_length || 2000}
          </p>
        </div>
      );

    case "opcion_unica": {
      if (mode === "visual") {
        return (
          <div className={widthClass}>
            {labelBlock}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((opt) => {
                const icon = optionIcons[opt.id];
                const selected = value === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(opt.id)}
                    disabled={disabled}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 text-sm font-medium transition-colors ${
                      selected
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-700 hover:border-slate-300"
                    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {icon && <span className="text-2xl leading-none">{icon}</span>}
                    <span className="text-center">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <div className={widthClass}>
          {labelBlock}
          <div className="space-y-2">
            {options.map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                  value === opt.id
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 hover:border-slate-300"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={opt.id}
                  checked={value === opt.id}
                  onChange={() => onChange(opt.id)}
                  disabled={disabled}
                  className="h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <span className="ml-3 text-sm text-slate-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    case "seleccion_multiple": {
      const selected = (value as string[]) || [];
      if (mode === "visual") {
        return (
          <div className={widthClass}>
            {labelBlock}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((opt) => {
                const icon = optionIcons[opt.id];
                const active = selected.includes(opt.id);
                const blocked = disabled || (!active && multiReached);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    disabled={blocked}
                    onClick={() => {
                      const next = active
                        ? selected.filter((id) => id !== opt.id)
                        : [...selected, opt.id];
                      onChange(next);
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 text-sm font-medium transition-colors ${
                      active
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-700 hover:border-slate-300"
                    } ${blocked ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {icon && <span className="text-2xl leading-none">{icon}</span>}
                    <span className="text-center">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {multiMax !== null && (
              <p className="mt-1 text-xs text-slate-400">
                Selecciona hasta {multiMax} {multiMax === 1 ? "opción" : "opciones"}
              </p>
            )}
          </div>
        );
      }
      return (
        <div className={widthClass}>
          {labelBlock}
          <div className="space-y-2">
            {options.map((opt) => {
              const active = selected.includes(opt.id);
              const blocked = disabled || (!active && multiReached);
              return (
                <label
                  key={opt.id}
                  className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                    active
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 hover:border-slate-300"
                  } ${blocked ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="checkbox"
                    value={opt.id}
                    checked={active}
                    disabled={blocked}
                    onChange={() => {
                      const next = active
                        ? selected.filter((id) => id !== opt.id)
                        : [...selected, opt.id];
                      onChange(next);
                    }}
                    className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <span className="ml-3 text-sm text-slate-700">{opt.label}</span>
                </label>
              );
            })}
          </div>
          {multiMax !== null && (
            <p className="mt-1 text-xs text-slate-400">
              Selecciona hasta {multiMax} {multiMax === 1 ? "opción" : "opciones"}
            </p>
          )}
        </div>
      );
    }

    case "si_no": {
      if (mode === "visual") {
        return (
          <div className={widthClass}>
            {labelBlock}
            <div className="flex gap-3">
              <button
                type="button"
                aria-pressed={value === true}
                onClick={() => onChange(true)}
                disabled={disabled}
                className={`flex-1 rounded-xl border p-4 text-base font-semibold transition-colors ${
                  value === true
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-700 hover:border-slate-300"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className="block text-2xl leading-none">✓</span>
                <span className="mt-1 block">Sí</span>
              </button>
              <button
                type="button"
                aria-pressed={value === false}
                onClick={() => onChange(false)}
                disabled={disabled}
                className={`flex-1 rounded-xl border p-4 text-base font-semibold transition-colors ${
                  value === false
                    ? "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-slate-200 text-slate-700 hover:border-slate-300"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className="block text-2xl leading-none">✕</span>
                <span className="mt-1 block">No</span>
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className={widthClass}>
          {labelBlock}
          <div className="flex space-x-4">
            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors flex-1 justify-center ${
                value === true
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-200 hover:border-slate-300"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name={question.id}
                checked={value === true}
                onChange={() => onChange(true)}
                disabled={disabled}
                className="h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
              />
              <span className="ml-2 text-sm font-medium text-slate-700">
                Sí
              </span>
            </label>
            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors flex-1 justify-center ${
                value === false
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-200 hover:border-slate-300"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name={question.id}
                checked={value === false}
                onChange={() => onChange(false)}
                disabled={disabled}
                className="h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
              />
              <span className="ml-2 text-sm font-medium text-slate-700">
                No
              </span>
            </label>
          </div>
        </div>
      );
    }

    case "numero": {
      const decimals =
        cfg?.decimal_places !== null && cfg?.decimal_places !== undefined
          ? Number(cfg.decimal_places)
          : 0;
      const step = decimals > 0 ? Math.pow(10, -decimals) : 1;
      const round = (n: number) => {
        const factor = Math.pow(10, decimals);
        return Math.round(n * factor) / factor;
      };
      const clampNum = (n: number) => {
        if (cfg?.min !== null && cfg?.min !== undefined && n < cfg.min)
          return round(Number(cfg.min));
        if (cfg?.max !== null && cfg?.max !== undefined && n > cfg.max)
          return round(Number(cfg.max));
        return round(n);
      };

      if (mode === "visual") {
        const current = typeof value === "number" ? value : null;
        const handleStep = (dir: 1 | -1) => {
          const base = current ?? (typeof cfg?.min === "number" ? cfg.min : 0);
          onChange(clampNum(base + dir * step));
        };
        return (
          <div className={widthClass}>
            {labelBlock}
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Disminuir"
                onClick={() => handleStep(-1)}
                disabled={
                  disabled ||
                  (current !== null &&
                    cfg?.min !== null &&
                    cfg?.min !== undefined &&
                    current <= cfg.min)
                }
                className="h-11 w-11 rounded-lg border border-slate-300 text-xl font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                −
              </button>
              <span className="min-w-[5rem] rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-sm font-semibold tabular-nums text-slate-900">
                {current === null ? "—" : current}
              </span>
              <button
                type="button"
                aria-label="Aumentar"
                onClick={() => handleStep(1)}
                disabled={
                  disabled ||
                  (current !== null &&
                    cfg?.max !== null &&
                    cfg?.max !== undefined &&
                    current >= cfg.max)
                }
                className="h-11 w-11 rounded-lg border border-slate-300 text-xl font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className={widthClass}>
          {labelBlock}
          <input
            type="number"
            value={value !== null && value !== undefined ? String(value) : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                onChange(null);
              } else {
                const num = Number(v);
                if (!isNaN(num)) {
                  if (cfg?.min !== null && cfg?.min !== undefined && num < cfg.min)
                    return;
                  if (cfg?.max !== null && cfg?.max !== undefined && num > cfg.max)
                    return;
                  onChange(num);
                }
              }
            }}
            disabled={disabled}
            min={cfg?.min ?? undefined}
            max={cfg?.max ?? undefined}
            step={decimals > 0 ? step : 1}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
          />
        </div>
      );
    }

    case "fecha":
      return (
        <div className={widthClass}>
          {labelBlock}
          <input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            min={typeof cfg?.min_date === "string" ? cfg.min_date : undefined}
            max={typeof cfg?.max_date === "string" ? cfg.max_date : undefined}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
          />
        </div>
      );

    case "escala": {
      const min = cfg?.min ?? 1;
      const max = cfg?.max ?? 5;
      const minLabel = cfg?.min_label || String(min);
      const maxLabel = cfg?.max_label || String(max);
      const steps: number[] = [];
      for (let i = min; i <= max; i++) steps.push(i);
      const currentValue =
        typeof value === "number" ? value : null;

      if (escalaStyle === "stars") {
        return (
          <div className={widthClass}>
            {labelBlock}
            <div className="flex items-center gap-1" role="radiogroup">
              {steps.map((step) => {
                const active = currentValue !== null && step <= currentValue;
                return (
                  <button
                    key={step}
                    type="button"
                    aria-label={`${step} de ${max}`}
                    aria-pressed={currentValue === step}
                    onClick={() => onChange(step)}
                    disabled={disabled}
                    className={`px-1 text-3xl leading-none transition ${
                      active ? "text-amber-400" : "text-slate-300"
                    } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-110"}`}
                  >
                    ★
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between px-1">
              <span className="text-xs text-slate-400">{minLabel}</span>
              <span className="text-xs text-slate-400">{maxLabel}</span>
            </div>
          </div>
        );
      }

      if (escalaStyle === "emojis") {
        return (
          <div className={widthClass}>
            {labelBlock}
            <div className="flex justify-between gap-1">
              {steps.map((step, idx) => (
                <button
                  key={step}
                  type="button"
                  aria-label={`${step} de ${max}`}
                  aria-pressed={currentValue === step}
                  onClick={() => onChange(step)}
                  disabled={disabled}
                  className={`flex-1 rounded-lg py-2 text-2xl leading-none transition ${
                    currentValue === step
                      ? "bg-indigo-50 ring-2 ring-indigo-400"
                      : "hover:bg-slate-50"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {emojiForIndex(idx, steps.length)}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between px-1">
              <span className="text-xs text-slate-400">{minLabel}</span>
              <span className="text-xs text-slate-400">{maxLabel}</span>
            </div>
          </div>
        );
      }

      if (escalaStyle === "slider") {
        return (
          <div className={widthClass}>
            {labelBlock}
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={currentValue ?? min}
              onChange={(e) => onChange(Number(e.target.value))}
              disabled={disabled}
              className="w-full accent-indigo-600"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-slate-400">{minLabel}</span>
              <span className="text-sm font-semibold text-slate-700">
                {currentValue ?? "—"}
              </span>
              <span className="text-xs text-slate-400">{maxLabel}</span>
            </div>
          </div>
        );
      }

      return (
        <div className={widthClass}>
          {labelBlock}
          <div className="flex justify-between items-center space-x-2">
            {steps.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => onChange(step)}
                disabled={disabled}
                className={`flex-1 py-3 border rounded-lg text-sm font-medium transition-colors ${
                  value === step
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {step}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1 px-1">
            <span className="text-xs text-slate-400">{minLabel}</span>
            <span className="text-xs text-slate-400">{maxLabel}</span>
          </div>
        </div>
      );
    }

    case "seleccion_opciones": {
      const selected = (value as string[]) || [];
      const allowMultiple =
        cfg?.allow_multiple !== undefined ? cfg.allow_multiple : false;

      if (allowMultiple) {
        const visible = options.filter((opt) =>
          opt.label.toLowerCase().includes(optionQuery.trim().toLowerCase())
        );
        return (
          <div className={widthClass}>
            {labelBlock}
            {options.length > 8 && (
              <input
                type="text"
                value={optionQuery}
                onChange={(e) => setOptionQuery(e.target.value)}
                disabled={disabled}
                placeholder="Buscar opción..."
                className="mb-3 w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
              />
            )}
            <div className="flex flex-wrap gap-2">
              {visible.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    const next = selected.includes(opt.id)
                      ? selected.filter((id) => id !== opt.id)
                      : [...selected, opt.id];
                    onChange(next);
                  }}
                  disabled={disabled}
                  className={`px-4 py-2 border rounded-full text-sm font-medium transition-colors ${
                    selected.includes(opt.id)
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        );
      }

      const selectedId = typeof value === "string" ? value : "";
      const selectedOption = options.find((o) => o.id === selectedId);
      const filtered = options.filter((opt) =>
        opt.label.toLowerCase().includes(optionQuery.trim().toLowerCase())
      );

      return (
        <div className={widthClass}>
          {labelBlock}
          <input
            type="text"
            list={`opts-${question.id}`}
            value={
              optionQuery ||
              (selectedOption ? selectedOption.label : "")
            }
            onChange={(e) => {
              const raw = e.target.value;
              setOptionQuery(raw);
              const found = options.find(
                (o) => o.label.trim().toLowerCase() === raw.trim().toLowerCase()
              );
              if (found) {
                onChange(found.id);
                setOptionQuery("");
              } else if (raw === "") {
                onChange(null);
              }
            }}
            disabled={disabled}
            placeholder={
              options.length > 8
                ? `Buscar entre ${options.length} opciones...`
                : "Seleccionar..."
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
          />
          <datalist id={`opts-${question.id}`}>
            {(optionQuery ? filtered : options).map((opt) => (
              <option key={opt.id} value={opt.label} />
            ))}
          </datalist>
          {selectedOption && !optionQuery && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOptionQuery("");
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
              >
                {selectedOption.label} ✕
              </button>
            </div>
          )}
        </div>
      );
    }

    default:
      return (
        <div className={widthClass}>
          {labelBlock}
          <p className="text-sm text-slate-400 italic">
            Tipo de pregunta no soportado: {type}
          </p>
        </div>
      );
  }
}
