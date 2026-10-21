/** GPS readings older than six seconds must not guide the driver or be shared.
 * A small allowance for device clock skew avoids accepting distant future fixes. */
export const GPS_FRESHNESS_MS = 6_000;
export const GPS_FUTURE_TOLERANCE_MS = 5_000;

export function isFreshGpsFix(timestamp: number | null | undefined, now = Date.now()): boolean {
  if (timestamp == null || !Number.isFinite(timestamp) || !Number.isFinite(now)) return false;
  const age = now - timestamp;
  return age >= -GPS_FUTURE_TOLERANCE_MS && age <= GPS_FRESHNESS_MS;
}
