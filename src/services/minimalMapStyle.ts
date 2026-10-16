import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';

// OpenMapTiles data, with our own flat palette. No commercial POI labels.
export function minimalMapStyle(): StyleSpecification {
  const source = 'openmaptiles';
  const name: ExpressionSpecification = ['coalesce', ['get', 'name:pt'], ['get', 'name'], ['get', 'name:latin']];
  return {
    version: 8,
    name: 'Roteiro · minimalista',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [source]: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap colaboradores' },
      'registered-areas': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#edf0ef' } },
      { id: 'landuse', type: 'fill', source, 'source-layer': 'landuse', paint: { 'fill-color': '#e7ebe9' } },
      { id: 'vegetation', type: 'fill', source, 'source-layer': 'landcover', filter: ['in', 'class', 'wood', 'grass', 'scrub', 'farmland'], paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#9fc8a3', '#c4ddbb'] } },
      { id: 'parks', type: 'fill', source, 'source-layer': 'park', paint: { 'fill-color': '#b4d5ad', 'fill-opacity': 0.75 } },
      { id: 'water', type: 'fill', source, 'source-layer': 'water', paint: { 'fill-color': '#92cce9' } },
      { id: 'waterways', type: 'line', source, 'source-layer': 'waterway', paint: { 'line-color': '#92cce9', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 16, 5] } },
      { id: 'roads', type: 'line', source, 'source-layer': 'transportation', filter: ['!in', 'class', 'rail', 'transit', 'ferry'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
        'line-color': '#c0c6cb',
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 0.5, 12, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 3, 1.5], 18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 22, ['secondary', 'tertiary'], 16, ['path', 'track'], 3, 10]]
      } },
      { id: 'buildings', type: 'fill', source, 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': '#ffffff', 'fill-outline-color': '#d7dfdf' } },
      { id: 'registered-areas', type: 'fill', source: 'registered-areas', paint: { 'fill-color': '#78b8ef', 'fill-opacity': 0.85, 'fill-outline-color': '#3589d5' } },
      { id: 'street-names', type: 'symbol', source, 'source-layer': 'transportation_name', minzoom: 12, layout: { 'symbol-placement': 'line', 'text-field': [...name], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-max-angle': 30 }, paint: { 'text-color': '#66717b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } },
      { id: 'public-places', type: 'symbol', source, 'source-layer': 'poi', minzoom: 14, filter: ['in', 'class', 'park', 'museum', 'attraction', 'monument'], layout: { 'text-field': [...name], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-max-width': 9 }, paint: { 'text-color': '#497459', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } },
      { id: 'place-names', type: 'symbol', source, 'source-layer': 'place', layout: { 'text-field': [...name], 'text-font': ['Noto Sans Regular'], 'text-size': ['match', ['get', 'class'], ['country', 'state'], 13, 'city', 15, 12], 'text-max-width': 10 }, paint: { 'text-color': '#5c6771', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } }
    ]
  };
}
