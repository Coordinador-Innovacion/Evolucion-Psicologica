"use client";

import type { SurveyQuestionData } from "@/types/encuestas";

interface Props {
  question: SurveyQuestionData;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
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

    case "opcion_unica":
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

    case "seleccion_multiple": {
      const selected = (value as string[]) || [];
      return (
        <div className={widthClass}>
          {labelBlock}
          <div className="space-y-2">
            {options.map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                  selected.includes(opt.id)
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 hover:border-slate-300"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="checkbox"
                  value={opt.id}
                  checked={selected.includes(opt.id)}
                  onChange={() => {
                    const next = selected.includes(opt.id)
                      ? selected.filter((id) => id !== opt.id)
                      : [...selected, opt.id];
                    onChange(next);
                  }}
                  disabled={disabled}
                  className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <span className="ml-3 text-sm text-slate-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    case "si_no":
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

    case "numero":
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
            step={cfg?.decimal_places ? Math.pow(10, -cfg.decimal_places) : 1}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
          />
        </div>
      );

    case "fecha":
      return (
        <div className={widthClass}>
          {labelBlock}
          <input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
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
        return (
          <div className={widthClass}>
            {labelBlock}
            <div className="flex flex-wrap gap-2">
              {options.map((opt) => (
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

      return (
        <div className={widthClass}>
          {labelBlock}
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                disabled={disabled}
                className={`px-4 py-2 border rounded-full text-sm font-medium transition-colors ${
                  value === opt.id
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
