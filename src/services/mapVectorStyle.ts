import type { Map as GlMap } from 'maplibre-gl';

export const ROLE_VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';
export const ROLE_DARK_VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const ROLE_ROAD_COLOR = '#bfc6ce';

/**
 * Paleta clara do Rolê. Mantém as camadas, as larguras de vias e os níveis
 * de zoom do Positron/OpenFreeMap: só altera cores, sem gerar mais geometrias,
 * fontes, tiles ou trabalho durante as atualizações de GPS.
 */
export function roleVectorPaintForLayer(layer: { id: string; type: string },theme:'light'|'dark'='light'): Record<string, string> {
  const id = layer.id.toLowerCase();
  // As rotas, alertas e marcadores do Rolê nunca devem receber a paleta da base.
  if (id.startsWith('role-')) return {};
  // Matching inner/casing colours keep avenues and motorways filled rather
  // than showing a pale centre surrounded by a thin grey outline.
  if(layer.type==='line'&&/^(highway_|(?:tunnel|bridge)_(?:motorway|trunk|primary|secondary|tertiary|minor|service|street|path))/.test(id))
    return {'line-color':theme==='dark'?'#7b8492':ROLE_ROAD_COLOR};
  if(theme==='dark')return {};

  if (layer.type === 'background' && id === 'background')
    return { 'background-color': '#f5f7f8' };

  if (layer.type === 'fill') {
    if (id === 'water') return { 'fill-color': '#b7def5' };
    if (id === 'park') return { 'fill-color': '#d7ecd9' };
    if (id === 'landcover_wood') return { 'fill-color': '#c9e5cf' };
    if (id === 'landuse_residential') return { 'fill-color': '#f0f3f5' };
    if (id === 'building')
      return { 'fill-color': '#ffffff', 'fill-outline-color': '#dbe3e9' };
    if (id === 'road_area_pier') return { 'fill-color': '#ebf0f3' };
    return {};
  }

  if (layer.type === 'line') {
    if (id === 'waterway') return { 'line-color': '#91c5e7' };
    if (id === 'road_pier') return { 'line-color': '#e4ebef' };
    if (/^railway.*dashline$/.test(id)) return { 'line-color': '#ffffff' };
    if (/^railway/.test(id)) return { 'line-color': '#c8d2da' };
    if (/^boundary_/.test(id)) return { 'line-color': '#bac8d1' };
    return {};
  }

  if (layer.type === 'symbol') {
    if (/^water_(name|way)/.test(id))
      return { 'text-color': '#397ba5', 'text-halo-color': '#edf8ff' };
    if (/^highway-name-/.test(id))
      return { 'text-color': '#536574', 'text-halo-color': '#f8fafc' };
    if (/^label_(city|city_capital|town|village|country_\d+)$/.test(id))
      return { 'text-color': '#2c4052', 'text-halo-color': '#f8fafc' };
    if (/^label_(other|state)$/.test(id))
      return { 'text-color': '#506476', 'text-halo-color': '#f8fafc' };
  }

  return {};
}

export function canRenderVectorMap(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

/**
 * Aplicada apenas ao carregar/trocar o estilo vetorial. Satélite, relevo,
 * fallback OSM, câmera e traçados de navegação permanecem inalterados.
 */
export function applyRoleVectorPalette(map: GlMap,theme:'light'|'dark'='light'): void {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    const paints = roleVectorPaintForLayer(layer,theme);
    for (const [property, color] of Object.entries(paints)) {
      try {
        // Os nomes das propriedades são constantes da paleta acima.
        map.setPaintProperty(layer.id, property as Parameters<GlMap['setPaintProperty']>[1], color);
      } catch {
        // Atualizações do estilo externo podem retirar ou tornar imutável uma camada.
      }
    }
  }
}
