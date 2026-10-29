import type { Map as GlMap } from 'maplibre-gl';

export const ROLE_VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';
export const ROLE_ROAD_COLOR = '#bfc6ce';
export const ROLE_NIGHT_BACKGROUND = '#1b2d47';
export const ROLE_NIGHT_ROAD_COLOR = '#aebaca';

/**
 * Os dois temas usam as mesmas vias preenchidas e os mesmos nomes do Positron.
 * A paleta só é aplicada ao carregar/trocar o tema, nunca a cada atualização GPS.
 */
export function roleVectorPaintForLayer(layer: { id: string; type: string },theme:'light'|'dark'='light'): Record<string, string|number> {
  const id = layer.id.toLowerCase();
  // As rotas, alertas e marcadores do Rolê nunca devem receber a paleta da base.
  if (id.startsWith('role-')) return {};
  // Matching inner/casing colours keep avenues and motorways filled rather
  // than showing a pale centre surrounded by a thin grey outline.
  if(layer.type==='line'&&/^(highway_|(?:tunnel|bridge)_(?:motorway|trunk|primary|secondary|tertiary|minor|service|street|path))/.test(id))
    return {'line-color':theme==='dark'?ROLE_NIGHT_ROAD_COLOR:ROLE_ROAD_COLOR};
  if(theme==='dark') {
    if(layer.type==='background')return {'background-color':ROLE_NIGHT_BACKGROUND};
    if(layer.type==='fill') {
      if(id==='water')return {'fill-color':'#11243e'};
      if(id==='park'||id==='landuse_park'||id==='landcover_wood')return {'fill-color':'#233e4b'};
      if(id==='building')return {'fill-color':'#293f5c','fill-outline-color':'#354d6b'};
      if(id==='landuse_residential')return {'fill-color':'#20324d'};
      // Includes ice, piers and airport areas, which otherwise stay almost white.
      return {'fill-color':'#263b54'};
    }
    if(layer.type==='line') {
      if(id==='waterway')return {'line-color':'#315678'};
      if(/^boundary_/.test(id))return {'line-color':'#51647d'};
      if(/^railway.*dashline$/.test(id))return {'line-color':'#263b54'};
      if(/^railway|^aeroway|^road_pier/.test(id))return {'line-color':'#75869a'};
    }
    if(layer.type==='symbol') {
      if(/^highway-name-/.test(id))return {
        'text-color':'#f1f5fa','text-halo-color':ROLE_NIGHT_BACKGROUND,
        'text-halo-width':1.5,'text-halo-blur':0.5,'text-opacity':1
      };
      if(/^water_(name|way)/.test(id))return {'text-color':'#9fc9eb','text-halo-color':'#11243e'};
      if(/^label_|^airport$/.test(id))return {'text-color':'#d8e4f3','text-halo-color':ROLE_NIGHT_BACKGROUND};
    }
    return {};
  }

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
    if(layer.type==='symbol'&&/^highway-name-/.test(layer.id)) {
      // Show local street names at city zoom as well as during tilted navigation.
      // Keep collision detection so nearby names do not pile on top of each other.
      try {
        map.setLayerZoomRange(layer.id,Math.min(layer.minzoom??0,
          layer.id==='highway-name-minor'?14:layer.id==='highway-name-major'?12:15.5),layer.maxzoom??24);
        map.setLayoutProperty(layer.id,'visibility','visible');
        map.setLayoutProperty(layer.id,'text-field',['coalesce',['get','name'],['get','name:latin'],['get','name_en']]);
        map.setLayoutProperty(layer.id,'text-size',['interpolate',['linear'],['zoom'],13,13,16,15,19,16]);
        map.setLayoutProperty(layer.id,'text-pitch-alignment','viewport');
        map.setLayoutProperty(layer.id,'text-allow-overlap',false);
      } catch { /* An external style update may remove a label layer. */ }
    }
  }
}
