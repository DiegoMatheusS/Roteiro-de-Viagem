/** The home sheet must grow upward from the bottom of the viewport.
 * Translating the whole panel creates an uncovered map strip below it.
 */
export type HomeSheetStage = 'collapsed' | 'resting' | 'expanded';
export const HOME_SHEET_EXPANDED_HEIGHT = '82dvh';

export function draggedHomeSheetHeight(stage: HomeSheetStage, dragOffset: number): string | undefined {
  if (!Number.isFinite(dragOffset) || dragOffset === 0) return undefined;
  const base = stage === 'collapsed' ? '74px' :
    stage === 'expanded' ? HOME_SHEET_EXPANDED_HEIGHT : 'max(37dvh, 300px)';
  const direction = dragOffset > 0 ? '-' : '+';
  return `clamp(74px, calc(${base} ${direction} ${Math.abs(dragOffset)}px), ${HOME_SHEET_EXPANDED_HEIGHT})`;
}
