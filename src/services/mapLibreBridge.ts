import { setWorkerUrl } from 'maplibre-gl';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import type * as L from 'leaflet';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Executado só quando o mapa precisa de camada vetorial; compatível com Vite e Capacitor.
setWorkerUrl(workerUrl);

export {ROLE_VECTOR_STYLE,canRenderVectorMap,applyRoleVectorPalette} from './mapVectorStyle';
import {ROLE_VECTOR_STYLE} from './mapVectorStyle';

export function createRoleVectorLayer() {
  // O adaptador MapLibre/Leaflet agenda um requestAnimationFrame no resize
  // e assume que _map ainda existe. Ao trocar telas rapidamente, a camada
  // pode ser destruída antes do callback, gerando TypeError(getZoom).
  // Usamos um resize síncrono com verificação explícita do ciclo de vida.
  type SafeLayer = ReturnType<typeof maplibreGL> & {
    _map?: L.Map;
    _resizeContainer?: () => void;
    _update?: () => void;
    getEvents: () => Record<string, (...args: unknown[]) => void>;
  };
  const layer = maplibreGL({
    style: ROLE_VECTOR_STYLE,
    interactive: false, // Gestos e marcadores permanecem sincronizados pelo Leaflet.
    attributionControl: false,
    maxZoom: 19
  }) as SafeLayer;
  const originalEvents = layer.getEvents.bind(layer);
  layer.getEvents = () => ({
    ...originalEvents(),
    resize: () => {
      if (!layer._map) return;
      layer._resizeContainer?.();
      layer._update?.();
      layer.getMaplibreMap()?.resize();
    }
  });
  return layer;
}
