import type { Map as GlMap } from 'maplibre-gl';

export const ROLE_VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/**
 * Paleta clara do Rolê. Mantém as camadas, as larguras de vias e os níveis
 * de zoom do Positron/OpenFreeMap: só altera cores, sem gerar mais geometrias,
 * fontes, tiles ou trabalho durante as atualizações de GPS.
 */
export function roleVectorPaintForLayer(layer: { id: string; type: string }): Record<string, string> {
  const id = layer.id.toLowerCase();
  // As rotas, alertas e marcadores do Rolê nunca devem receber a paleta da base.
  if (id.startsWith('role-')) return {};

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
    if (id === 'highway_path') return { 'line-color': '#e2e8ed' };
    if (id === 'highway_minor') return { 'line-color': '#d5dee6' };
    if (id === 'highway_major_casing') return { 'line-color': '#b8c7d1' };
    if (id === 'highway_major_inner') return { 'line-color': '#f2f5f7' };
    if (id === 'highway_major_subtle') return { 'line-color': '#d0dbe3' };
    if (/^highway_motorway(_bridge)?_casing$/.test(id))
      return { 'line-color': '#aebfcb' };
    if (/^highway_motorway(_bridge)?_inner$/.test(id))
      return { 'line-color': '#edf2f5' };
    if (id === 'highway_motorway_subtle') return { 'line-color': '#cedae3' };
    if (id === 'tunnel_motorway_casing') return { 'line-color': '#c2cdd5' };
    if (id === 'tunnel_motorway_inner') return { 'line-color': '#e8eef2' };
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
export function applyRoleVectorPalette(map: GlMap): void {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    const paints = roleVectorPaintForLayer(layer);
    for (const [property, color] of Object.entries(paints)) {
      try {
        map.setPaintProperty(layer.id, property, color);
      } catch {
        // Atualizações do estilo externo podem retirar ou tornar imutável uma camada.
      }
    }
  }
}
