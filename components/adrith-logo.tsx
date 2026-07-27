/**
 * The approved ADRITH mark: outer triangle, inner truss, five connection
 * nodes, rust apex. This exact SVG is the finalized design — do not modify
 * the geometry or colors without re-approving the change first.
 */
export function AdrithLogo({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <path
        d="M 35 155 L 100 45 L 165 155 Z"
        fill="none"
        stroke="var(--adrith-dim)"
        strokeWidth={7}
        strokeLinejoin="round"
      />
      <path
        d="M 67.5 100 L 132.5 100 L 100 155 Z"
        fill="none"
        stroke="var(--adrith-dim)"
        strokeWidth={4}
        strokeLinejoin="round"
        opacity={0.75}
      />
      <circle cx={35} cy={155} r={6} fill="var(--adrith-off-white)" />
      <circle cx={165} cy={155} r={6} fill="var(--adrith-off-white)" />
      <circle cx={67.5} cy={100} r={5} fill="var(--adrith-off-white)" />
      <circle cx={132.5} cy={100} r={5} fill="var(--adrith-off-white)" />
      <circle cx={100} cy={155} r={5} fill="var(--adrith-off-white)" />
      <polygon points="100,34 111,45 100,56 89,45" fill="var(--adrith-rust)" />
    </svg>
  );
}
