/**
 * The finalized concentric-ring background. `bright` controls which of the
 * two approved opacity curves is used: the strong version for the landing
 * page (rings are the hero), the dimmed version for content-heavy screens
 * like the hub, where the rings sit behind real UI and must stay legible.
 *
 * Uses a percentage-space viewBox (0-100 wide) with `xMidYMid slice` so the
 * rings stay true circles and scale correctly across real device widths,
 * rather than a fixed pixel size tuned to one preview frame.
 */
export function RingBackground({
  cyPercent,
  bright = true,
}: {
  /** Vertical center of the rings, as a percent of viewBox height (0-100). */
  cyPercent: number;
  bright?: boolean;
}) {
  const radii = Array.from({ length: 22 }, (_, i) => 4 * (i + 1));

  const brightCurve = [
    0.07, 0.09, 0.11, 0.13, 0.15, 0.16, 0.16, 0.15, 0.14, 0.12, 0.11, 0.1,
    0.09, 0.08, 0.07, 0.06, 0.05, 0.045, 0.04, 0.03, 0.025, 0.02, 0.015,
  ];
  const dimCurve = [
    0.045, 0.06, 0.075, 0.09, 0.1, 0.1, 0.1, 0.095, 0.09, 0.08, 0.075, 0.065,
    0.06, 0.05, 0.045, 0.04, 0.035, 0.03, 0.025, 0.02, 0.015, 0.012, 0.01,
  ];
  const opacities = bright ? brightCurve : dimCurve;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="none" stroke="#FFFFFF" strokeWidth={bright ? 0.35 : 0.22}>
        {radii.map((r, i) => (
          <circle key={r} cx={50} cy={cyPercent * 2} r={r} opacity={opacities[i]} />
        ))}
      </g>
    </svg>
  );
}
