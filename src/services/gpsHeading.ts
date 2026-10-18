/** Angle carried by GPS in degrees clockwise from true north (not phone orientation). */
export function validGpsHeading(value: unknown, speedMetersPerSecond?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 360) return null;
  // Slow/stationary GPS course is noisy. Keep the previous known direction instead.
  if (speedMetersPerSecond != null && (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond < 1.4)) return null;
  return value;
}

/** Closest equivalent angle avoids the 359° -> 1° full-circle spinning glitch. */
export function shortestHeadingTransition(previousDegrees: number | null, headingDegrees: number): number {
  if (previousDegrees === null || !Number.isFinite(previousDegrees)) return headingDegrees;
  const previousNormalized = ((previousDegrees % 360) + 360) % 360;
  const delta = ((headingDegrees - previousNormalized + 540) % 360) - 180;
  return previousDegrees + delta;
}

export function arrowHeadingStyle(
  svg: SVGElement | null,
  lastDegrees: number | null,
  headingDegrees: number | null | undefined,
  speedMetersPerSecond?: number | null,
  reducedMotion = false
): number | null {
  const current = validGpsHeading(headingDegrees, speedMetersPerSecond);
  if (current === null || !svg) return lastDegrees;
  const angle = shortestHeadingTransition(lastDegrees, current);
  (svg as SVGElement & {style:CSSStyleDeclaration}).style.transition = reducedMotion ? 'none' : 'transform 260ms ease-out';
  (svg as SVGElement & {style:CSSStyleDeclaration}).style.transform = `rotate(${angle}deg)`;
  (svg as SVGElement & {style:CSSStyleDeclaration}).style.transformOrigin = '50% 50%';
  return angle;
}
