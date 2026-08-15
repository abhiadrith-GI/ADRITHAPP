/**
 * ADRITH brand mark. Replaces the previous minimal SVG truss mark with the
 * new photoreal metallic A/skyscraper logo (approved 2026-08-15) - a real
 * brand-direction change, not a tweak of the old geometry.
 *
 * Two source images because one raster lockup can't serve both jobs well:
 * "icon" is a tight crop of just the A/skyscraper mark for small, square-ish
 * nav-bar use; "lockup" is the full icon + wordmark + subtitle for hero use.
 * Both are feather-edged PNGs (soft alpha falloff, no hard rectangle) so
 * they sit cleanly on any of the page photo backgrounds.
 */
export function AdrithLogo({
  variant = "icon",
  className = "h-16 w-16",
}: {
  variant?: "icon" | "lockup";
  className?: string;
}) {
  const src = variant === "lockup" ? "/brand/adrith-lockup.png" : "/brand/adrith-icon.png";
  return (
    <img
      src={src}
      alt="ADRITH Designs and Constructions"
      className={`${className} object-contain`}
    />
  );
}

