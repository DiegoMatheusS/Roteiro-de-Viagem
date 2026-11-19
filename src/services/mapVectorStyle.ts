import type { Map as GlMap } from 'maplibre-gl';

export const ROLE_VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';
// Identidade cartográfica do Rolê: vias locais claras, arteriais creme e
// rodovias âmbar. A rota azul permanece independente da base.
export const ROLE_ROAD_COLOR = '#ffffff';
export const ROLE_NIGHT_BACKGROUND = '#1b2d47';
export const ROLE_NIGHT_ROAD_COLOR = '#8795a9';

const ROAD_LAYER=/^(highway_|(?:tunnel|bridge)_(?:motorway|trunk|primary|secondary|tertiary|minor|service|street|path))/;
const isRoad=(id:string)=>ROAD_LAYER.test(id);
const isCasing=(id:string)=>/(casing|outline)/.test(id);
const isMotorway=(id:string)=>/motorway/.test(id);
const isArterial=(id:string)=>/(major|trunk|primary|secondary|tertiary)/.test(id);

function roleRoadStroke(id:string,theme:'light'|'dark',_navigation=false):string {
  // A cor de uma via não representa trânsito. Sem dados do provedor, vias
  // comuns, avenidas e rodovias nunca recebem amarelo, laranja ou vermelho.
  if(/(footway|steps|cycleway|pedestrian|highway_path)/.test(id))
    return theme==='dark'?'#65758a':'#c8d1d9';
  const casing=isCasing(id);
  if(theme==='dark')
    return casing?'#40536b':isMotorway(id)?'#a9b9cd':isArterial(id)?'#9aaabd':ROLE_NIGHT_ROAD_COLOR;
  return casing?'#b8c4cf':isMotorway(id)?'#f7fafc':isArterial(id)?'#ffffff':ROLE_ROAD_COLOR;
}

/** Ruas maiores em navegação, sem tornar becos ou caminhos de pedestres rodovias.
 * Casings são mais largos que os centros: evita o aspecto de linhas uniformes. */
export function roleNavigationRoadWidth(layer:{id:string;type:string}):readonly unknown[]|null {
  const id=layer.id.toLowerCase();
  if(layer.type!=='line'||!isRoad(id)||/(footway|steps|cycleway|pedestrian|highway_path)/.test(id))return null;
  const major=isArterial(id),motorway=isMotorway(id),casing=isCasing(id);
  const extra=casing?3:0;
  return ['interpolate',['linear'],['zoom'],
    11,(motorway?4:major?3:2)+extra,
    14,(motorway?11:major?9:6)+extra,
    16,(motorway?19:major?16:11)+extra,
    19,(motorway?30:major?26:20)+extra];
}

/** Durante direção, menos poluição visual que o Positron padrão, sem afetar
 * ruas, prédios e rótulos fora da navegação. */
export function roleNavigationPaintForLayer(layer:{id:string;type:string},theme:'light'|'dark'):Record<string,string> {
  if(theme==='dark'||layer.id.startsWith('role-'))return {};
  const id=layer.id.toLowerCase();
  if(layer.type==='background')return {'background-color':'#e9edf0'};
  if(layer.type==='line'&&isRoad(id))return {'line-color':roleRoadStroke(id,'light',true)};
  if(layer.type==='fill'){
    if(/(^water$|^water_)/.test(id))return {'fill-color':'#b8e2f4'};
    if(/(park|wood|forest|grass|garden|green|meadow)/.test(id))return {'fill-color':'#bce5b7'};
    if(id==='building')return {'fill-color':'#d9dee4','fill-outline-color':'#bec8d2'};
    if(/(residential|industrial|commercial)/.test(id))return {'fill-color':'#e2e7eb'};
    if(id==='road_area_pier')return {'fill-color':'#f8fafb'};
    return {'fill-color':'#e9edf0'};
  }
  if(layer.type==='symbol'){
    if(/^highway-name-/.test(id))return {'text-color':'#39495e','text-halo-color':'#f8fafb'};
    if(/^label_/.test(id))return {'text-color':'#46566a','text-halo-color':'#e9edf0'};
  }
  return {};
}

/** Paleta original do Rolê aplicada em qualquer mapa vetorial de ruas.
 * Satélite, relevo, camadas de rota e marcadores próprios não são alterados. */
export function roleVectorPaintForLayer(layer:{id:string;type:string},theme:'light'|'dark'='light'):Record<string,string|number> {
  const id=layer.id.toLowerCase();
  if(id.startsWith('role-'))return {};
  if(layer.type==='line'&&isRoad(id))return {'line-color':roleRoadStroke(id,theme)};
  if(theme==='dark'){
    if(layer.type==='background')return {'background-color':ROLE_NIGHT_BACKGROUND};
    if(layer.type==='fill'){
      if(id==='water')return {'fill-color':'#173956'};
      if(/(park|wood|forest|grass|garden|green|meadow)/.test(id))return {'fill-color':'#254c49'};
      if(id==='building')return {'fill-color':'#293f56','fill-outline-color':'#364f68'};
      if(id==='landuse_residential')return {'fill-color':'#23354b'};
      return {'fill-color':'#263b54'};
    }
    if(layer.type==='line'){
      if(id==='waterway')return {'line-color':'#3b7293'};
      if(/^boundary_/.test(id))return {'line-color':'#566981'};
      if(/^railway.*dashline$/.test(id))return {'line-color':'#263b54'};
      if(/^railway|^aeroway|^road_pier/.test(id))return {'line-color':'#75869a'};
    }
    if(layer.type==='symbol'){
      if(/^highway-name-/.test(id))return {
        'text-color':'#f1f5fa','text-halo-color':ROLE_NIGHT_BACKGROUND,
        'text-halo-width':1.7,'text-halo-blur':0.5,'text-opacity':1
      };
      if(/^water_(name|way)/.test(id))return {'text-color':'#abd9f0','text-halo-color':'#173956'};
      if(/^label_|^airport$/.test(id))return {'text-color':'#d8e4f3','text-halo-color':ROLE_NIGHT_BACKGROUND};
    }
    return {};
  }
  if(layer.type==='background'&&id==='background')return {'background-color':'#edf0f2'};
  if(layer.type==='fill'){
    if(id==='water')return {'fill-color':'#b8e2f4'};
    if(/(park|wood|forest|grass|garden|green|meadow)/.test(id))return {'fill-color':'#c2e9bd'};
    if(id==='landuse_residential')return {'fill-color':'#e9edef'};
    if(id==='building')return {'fill-color':'#e0e4e9','fill-outline-color':'#c5cfd7'};
    if(id==='road_area_pier')return {'fill-color':'#f7fafb'};
    return {};
  }
  if(layer.type==='line'){
    if(id==='waterway')return {'line-color':'#83c5e7'};
    if(id==='road_pier')return {'line-color':'#e5ebf0'};
    if(/^railway.*dashline$/.test(id))return {'line-color':'#ffffff'};
    if(/^railway/.test(id))return {'line-color':'#adb9c7'};
    if(/^boundary_/.test(id))return {'line-color':'#a7b6c4'};
    return {};
  }
  if(layer.type==='symbol'){
    if(/^water_(name|way)/.test(id))return {'text-color':'#347ea1','text-halo-color':'#e6f6ff'};
    if(/^highway-name-/.test(id))return {'text-color':'#405269','text-halo-color':'#f8fafb','text-halo-width':1.6};
    if(/^label_(city|city_capital|town|village|country_\d+)$/.test(id))
      return {'text-color':'#304459','text-halo-color':'#f7f9fa'};
    if(/^label_(other|state)$/.test(id))return {'text-color':'#586879','text-halo-color':'#f7f9fa'};
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
export function applyRoleVectorPalette(map: GlMap,theme:'light'|'dark'='light',navigationMode=false,roadStyle=false): void {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    const paints = {...roleVectorPaintForLayer(layer,theme),...(navigationMode?roleNavigationPaintForLayer(layer,theme):{})};
    for (const [property, color] of Object.entries(paints)) {
      try {
        // Os nomes das propriedades são constantes da paleta acima.
        map.setPaintProperty(layer.id, property as Parameters<GlMap['setPaintProperty']>[1], color);
      } catch {
        // Atualizações do estilo externo podem retirar ou tornar imutável uma camada.
      }
    }
    if(navigationMode||roadStyle){
      const width=roleNavigationRoadWidth(layer);
      if(width){try{map.setPaintProperty(layer.id,'line-width',width as unknown as number);}catch{/* style may have removed layer */}}
    }
    // Na navegação, os pontos de interesse do mapa-base e números de porta
    // cedem espaço às ruas e aos alertas próprios do Rolê.
    if(navigationMode&&layer.type==='symbol'&&/^(poi_|housenumber$|label_other$)/.test(layer.id)){
      try{map.setLayoutProperty(layer.id,'visibility','none');}catch{/* camada opcional */}
    }
    if(layer.type==='symbol'&&/^highway-name-/.test(layer.id)) {
      // Show local street names at city zoom as well as during tilted navigation.
      // Keep collision detection so nearby names do not pile on top of each other.
      try {
        map.setLayerZoomRange(layer.id,Math.min(layer.minzoom??0,
          layer.id==='highway-name-minor'?14:layer.id==='highway-name-major'?12:15.5),layer.maxzoom??24);
        map.setLayoutProperty(layer.id,'visibility','visible');
        map.setLayoutProperty(layer.id,'text-field',['coalesce',['get','name'],['get','name:latin'],['get','name_en']]);
        map.setLayoutProperty(layer.id,'text-size',['interpolate',['linear'],['zoom'],13,13,16,16,19,18]);
        map.setLayoutProperty(layer.id,'text-pitch-alignment','viewport');
        map.setLayoutProperty(layer.id,'text-allow-overlap',false);
      } catch { /* An external style update may remove a label layer. */ }
    }
  }
}
