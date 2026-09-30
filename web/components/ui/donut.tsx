export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

const PALETTE = [
  "#6C63F0",
  "#14B8A6",
  "#22D3EE",
  "#F59E0B",
  "#F43F5E",
  "#22C55E",
  "#A855F7",
  "#3B82F6",
];

export function DonutChart({
  data,
  size = 180,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 0 ? 2 : 0;

  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribución">
          <g transform={`translate(${size / 2}, ${size / 2})`}>
            <circle
              r={radius}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth={thickness}
            />
            {total > 0 &&
              data.map((slice, index) => {
                const fraction = slice.value / total;
                const length = Math.max(fraction * circumference - gap, 0);
                const dash = `${length} ${circumference - length}`;
                const rotation = (offset / circumference) * 360 - 90;
                offset += fraction * circumference;
                return (
                  <circle
                    key={slice.label}
                    r={radius}
                    fill="none"
                    stroke={slice.color ?? PALETTE[index % PALETTE.length]}
                    strokeWidth={thickness}
                    strokeDasharray={dash}
                    strokeLinecap="round"
                    transform={`rotate(${rotation})`}
                  />
                );
              })}
          </g>
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          {centerValue !== undefined && (
            <p className="font-display text-2xl font-bold text-ink">{centerValue}</p>
          )}
          {centerLabel && (
            <p className="text-xs text-ink-muted">{centerLabel}</p>
          )}
        </div>
      </div>
      <ul className="space-y-2">
        {data.map((slice, index) => (
          <li key={slice.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: slice.color ?? PALETTE[index % PALETTE.length],
              }}
            />
            <span className="text-ink-soft">{slice.label}</span>
            <span className="ml-auto font-medium text-ink">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
