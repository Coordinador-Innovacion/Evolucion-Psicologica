"use client";

import type { SurveyOptionData } from "@/types/encuestas";

interface Props {
  options: SurveyOptionData[];
  onUpdate: (optionId: string, label: string) => void;
  onDelete: (optionId: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function OptionEditor({
  options,
  onUpdate,
  onDelete,
  onReorder,
}: Props) {
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const ids = options.map((o) => o.id);
    const newIds = [...ids];
    [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
    onReorder(newIds);
  };

  const handleMoveDown = (index: number) => {
    if (index === options.length - 1) return;
    const ids = options.map((o) => o.id);
    const newIds = [...ids];
    [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
    onReorder(newIds);
  };

  return (
    <div className="space-y-2 ml-8 border-l-2 border-gray-100 pl-4">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
        Opciones
      </label>
      {options.map((opt, idx) => (
        <div key={opt.id} className="flex items-center space-x-2">
          <button
            onClick={() => handleMoveUp(idx)}
            disabled={idx === 0}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
            title="Mover arriba"
          >
            ▲
          </button>
          <button
            onClick={() => handleMoveDown(idx)}
            disabled={idx === options.length - 1}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
            title="Mover abajo"
          >
            ▼
          </button>
          <input
            type="text"
            value={opt.label}
            onChange={(e) => onUpdate(opt.id, e.target.value)}
            className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => onDelete(opt.id)}
            className="text-red-400 hover:text-red-600 text-xs"
            title="Eliminar opción"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
