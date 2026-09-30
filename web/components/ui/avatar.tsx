export function Avatar({
  name,
  size = "md",
  className = "",
}: {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-14 w-14 text-base",
    xl: "h-20 w-20 text-xl",
  } as const;

  const parts = (name ?? "").trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  const initials = (first + last).toUpperCase() || "…";

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6C63F0] to-[#5548E0] font-semibold text-white ${sizes[size]} ${className}`}
    >
      {initials}
    </span>
  );
}
