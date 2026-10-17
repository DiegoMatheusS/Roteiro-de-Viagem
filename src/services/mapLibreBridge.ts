import { setWorkerUrl, type Map as GlMap } from 'maplibre-gl';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Executado só quando o mapa precisa de camada vetorial; compatível com Vite e Capacitor.
setWorkerUrl(workerUrl);

export const ROLE_VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';

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

export function createRoleVectorLayer() {
  return maplibreGL({
    style: ROLE_VECTOR_STYLE,
    interactive: false, // Gestos e marcadores permanecem sincronizados pelo Leaflet.
    attributionControl: false,
    maxZoom: 19
  });
}

/** Ajustes discretos na base de dados vetorial, sem alterar camadas de texto ou vias. */
export function applyRoleVectorPalette(map: GlMap): void {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    if (layer.type !== 'fill') continue;
    const name = layer.id.toLowerCase();
    let color: string | null = null;
    if (/water/.test(name)) color = '#b9ddf4';
    else if (/park|forest|wood|grass|green|landcover/.test(name)) color = '#cbe5ce';
    else if (/building/.test(name)) color = '#ffffff';
    if (color) {
      try { map.setPaintProperty(layer.id, 'fill-color', color); } catch { /* O estilo pode impedir sobrescrita de camadas individuais. */ }
    }
  }
}
