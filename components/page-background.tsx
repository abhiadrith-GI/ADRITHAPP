/**
 * Full-bleed photo background for a page, replacing RingBackground on pages
 * that now have a real photo. Same positioning contract as RingBackground
 * (absolute, inset-0, rendered before the z-10 content) so it's a drop-in
 * swap - the photo itself already carries its final dark grade (brightness,
 * contrast, and the top/bottom shadow gradient for text legibility) baked
 * in from the approved preview; this component does not add any further
 * darkening so the shipped page matches what was actually reviewed.
 */
export function PageBackground({ src }: { src: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full bg-black bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${src})` }}
    />
  );
}
