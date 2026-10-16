import type L from 'leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { minimalMapStyle } from './minimalMapStyle';

setWorkerUrl(workerUrl);

export function addMinimalMap(map: L.Map, onFallback: () => void) {
  const layer = maplibreGL({ style: minimalMapStyle(), interactive: false });
  try { layer.addTo(map); } catch (error) {
    if (map.hasLayer(layer)) map.removeLayer(layer);
    throw error;
  }
  const attribution = '© OpenFreeMap · © OpenStreetMap colaboradores';
  map.attributionControl?.addAttribution(attribution);
  const gl = layer.getMaplibreMap();
  let points: [number, number][] = [];
  let disposed = false;
  let sourceErrors = 0;
  // Only highlight a real polygon under the registered coordinate. Never invent
  // a building/parcel around a point or paint a neighboring property.
  const updateAreas = () => {
    if (disposed || !gl.isStyleLoaded()) return;
    const features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
    const seen = new Set<string>();
    if (map.getZoom() >= 14) for (const point of points.slice(0, 80)) {
      if (!map.getBounds().contains(point)) continue;
      const candidate = gl.queryRenderedFeatures(gl.project([point[1], point[0]]), { layers: ['buildings', 'parks', 'landuse'] })
        .find(feature => feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon');
      if (!candidate) continue;
      // A landuse polygon may cover a whole neighborhood; keep only building or
      // park boundaries. Landuse is useful for stores only when a small area exists.
      const geometry = candidate.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
      const positions = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
      const latSpan = Math.max(...positions.map(p => p[1])) - Math.min(...positions.map(p => p[1]));
      const lngSpan = Math.max(...positions.map(p => p[0])) - Math.min(...positions.map(p => p[0]));
      if (candidate.layer.id === 'landuse' && (latSpan > 0.003 || lngSpan > 0.003)) continue;
      const key = JSON.stringify(geometry);
      if (!seen.has(key)) { seen.add(key); features.push({ type: 'Feature', properties: {}, geometry }); }
    }
    (gl.getSource('registered-areas') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features });
  };
  const fail = () => { if (!disposed) onFallback(); };
  const onError = () => { if (++sourceErrors >= 3 || !gl.isStyleLoaded()) fail(); };
  const loadTimer = setTimeout(() => { if (!gl.isStyleLoaded()) fail(); }, 18000);
  const canvas = gl.getCanvas();
  canvas.addEventListener('webglcontextlost', fail);
  gl.on('load', updateAreas);
  gl.on('sourcedata', event => { if ((event as {sourceId?: string}).sourceId === 'openmaptiles' && event.isSourceLoaded) updateAreas(); });
  gl.on('error', onError);
  map.on('moveend zoomend', updateAreas);
  return {
    setPlaces(next: [number, number][]) { points = next; updateAreas(); },
    remove() {
      disposed = true;
      clearTimeout(loadTimer);
      map.attributionControl?.removeAttribution(attribution);
      map.off('moveend zoomend', updateAreas);
      canvas.removeEventListener('webglcontextlost', fail);
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  };
}
