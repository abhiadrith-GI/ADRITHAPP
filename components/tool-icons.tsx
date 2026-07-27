export type ToolIconName =
  | "checklist"
  | "vastu"
  | "isometric"
  | "droplet"
  | "paint"
  | "building";

/** The six approved tool icons from the finalized hub design. */
export function ToolIcon({
  name,
  className = "h-5 w-5",
}: {
  name: ToolIconName;
  className?: string;
}) {
  const rust = "var(--adrith-rust)";
  const line = "var(--adrith-off-white)";

  switch (name) {
    case "checklist":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={line} strokeWidth={1.8} className={className}>
          <rect x={5} y={3} width={14} height={18} rx={2} />
          <path d="M8 9.5l2 2 4.5-4.5" stroke={rust} strokeWidth={2} />
          <path d="M8 14.5h8M8 17.5h5" strokeWidth={1.4} />
        </svg>
      );
    case "vastu":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={line} strokeWidth={1.8} className={className}>
          <circle cx={12} cy={12} r={9} />
          <path d="M12 5 L14 12 L12 19 L10 12 Z" fill={rust} stroke="none" />
        </svg>
      );
    case "isometric":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={line} strokeWidth={1.5} className={className}>
          <path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" />
          <path d="M12 3 L12 12 M12 12 L20 7.5 M12 12 L4 7.5" stroke={rust} strokeWidth={1.3} />
        </svg>
      );
    case "droplet":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={line} strokeWidth={1.7} className={className}>
          <path d="M12 2 C12 2 5 10 5 15 A7 7 0 0 0 19 15 C19 10 12 2 12 2 Z" />
          <circle cx={12} cy={14} r={1.3} fill={rust} stroke="none" />
        </svg>
      );
    case "paint":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={line} strokeWidth={1.7} className={className}>
          <rect x={4} y={4} width={16} height={7} rx={2} />
          <rect x={7} y={6} width={4} height={3} fill={rust} stroke="none" />
          <path d="M12 11 L12 16 L16 20" strokeWidth={1.6} />
        </svg>
      );
    case "building":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={line} strokeWidth={1.7} className={className}>
          <path d="M4 20V10L12 4L20 10V20H4Z" />
          <path d="M9.5 12.5l1.8 1.8L15 10.5" stroke={rust} strokeWidth={1.8} />
        </svg>
      );
  }
}
