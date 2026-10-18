/** Keep the map explorer pinned to the viewport bottom while dragging.
 * Reserve space above it for GPS, road alert and speed controls.
 */
export const MAP_EXPANDED_HEIGHT='min(65dvh, calc(100dvh - 220px))';

export function mapSheetHeight(expanded:boolean,hasSearchError:boolean,dragOffset=0):string {
  const base=expanded?MAP_EXPANDED_HEIGHT:hasSearchError?'170px':'116px';
  if(!Number.isFinite(dragOffset)||dragOffset===0)return base;
  const sign=dragOffset<0?'+':'-';
  return `clamp(116px, calc(${base} ${sign} ${Math.abs(dragOffset)}px), ${MAP_EXPANDED_HEIGHT})`;
}
