/** User preference is device-local: no Railway API or account dependency. */
export type MapAppearanceMode = 'light' | 'dark' | 'system' | 'automatic';
export type MapTheme = 'light' | 'dark';
export const MAP_APPEARANCE_KEY = 'role:map-appearance:v1';
export const MAP_APPEARANCE_EVENT = 'role-map-appearance-change';

export function parseMapAppearance(value: unknown): MapAppearanceMode {
  return value === 'dark' || value === 'system' || value === 'automatic' ? value : 'light';
}
export function readMapAppearance(): MapAppearanceMode {
  if (typeof window === 'undefined') return 'light';
  try { return parseMapAppearance(window.localStorage.getItem(MAP_APPEARANCE_KEY)); }
  catch { return 'light'; }
}
export function writeMapAppearance(mode: MapAppearanceMode): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(MAP_APPEARANCE_KEY, mode); } catch { /* private mode */ }
  window.dispatchEvent(new Event(MAP_APPEARANCE_EVENT));
}
/** "Automático" follows local device time (18h–6h), without GPS/network access.
 * Exact solar sunset is deliberately not claimed. Light is always the default. */
export function resolveMapTheme(mode: MapAppearanceMode, date = new Date(), systemDark = false): MapTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  if (mode === 'automatic') {
    const hour = date.getHours();
    return hour >= 18 || hour < 6 ? 'dark' : 'light';
  }
  return 'light';
}
