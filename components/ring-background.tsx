/**
 * The finalized concentric-ring background. `bright` controls which of the
 * two approved opacity curves is used: the strong version for the landing
 * page (rings are the hero), the dimmed version for content-heavy screens
 * like the hub, where the rings sit behind real UI and must stay legible.
 *
 * Renders two variants, swapped by viewport width via Tailwind's `md:`
 * breakpoint rather than JS measurement (avoids any flash of the wrong one
 * on load). A single viewBox cannot serve both shapes well: `xMidYMid
 * slice` on a viewBox tuned for a tall phone screen forces a wide desktop
 * screen to zoom in far more aggressively to "cover", which is what turned
 * clean concentric circles into wide, sparse arcs on desktop — not a random
 * glitch, just one fixed shape being asked to fit a very different one.
 * The phone variant here is untouched from the original, already-approved
 * version; only the new desktop variant is different.
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
  const strokeWidth = bright ? 0.35 : 0.22;

  return (
    <>
      {/* Phone / narrow viewports — original, already-approved version, unchanged. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full md:hidden"
        viewBox="0 0 100 200"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g fill="none" stroke="#FFFFFF" strokeWidth={strokeWidth}>
          {radii.map((r, i) => (
            <circle key={r} cx={50} cy={cyPercent * 2} r={r} opacity={opacities[i]} />
          ))}
        </g>
      </svg>

      {/* Desktop / wide viewports — same width unit (100) and radii so ring
          density matches the phone version; only the height changes, to a
          ~16:9-shaped viewBox so "slice" no longer has to zoom in hard to
          cover a wide screen. */}
      <svg
        className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
        viewBox="0 0 100 56"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g fill="none" stroke="#FFFFFF" strokeWidth={strokeWidth}>
          {radii.map((r, i) => (
            <circle key={r} cx={50} cy={cyPercent * 0.56} r={r} opacity={opacities[i]} />
          ))}
        </g>
      </svg>
    </>
  );
}
