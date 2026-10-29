/** Accept location references only from known map hosts; a map view is not proof of a named place. */
export type AdminLocationInput =
  | { type: 'coordinates'; lat: number; lng: number; origin: string }
  | { type: 'osm-object'; reference: string };

function pair(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(/\s+/g, '');
  const pieces = normalized.includes(';')
    ? normalized.split(';').map(value => value.replace(',', '.'))
    : normalized.split(',');
  if (pieces.length !== 2 || pieces.some(value => !/^[+-]?\d{1,3}(?:\.\d+)?$/.test(value))) return null;
  const lat = Number(pieces[0]), lng = Number(pieces[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

function coordinates(value: string | null, origin: string): AdminLocationInput | null {
  const found = pair(value);
  return found ? { type: 'coordinates', lat: found[0], lng: found[1], origin } : null;
}

export function parseAdminLocationInput(input: string): AdminLocationInput | null {
  const text = input.trim();
  if (!text) return null;
  const direct = coordinates(text, 'coordenadas digitadas');
  if (direct) return direct;
  const osmId = text.match(/^(?:osm:)?(node|way|relation)[:/](\d{1,16})$/i);
  if (osmId && Number.isSafeInteger(Number(osmId[2])) && Number(osmId[2]) > 0)
    return { type: 'osm-object', reference: 'https://www.openstreetmap.org/' + osmId[1].toLowerCase() + '/' + osmId[2] };
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (/^(?:www\.)?openstreetmap\.org$/.test(host)) {
    const point = url.pathname.match(/^\/(node|way|relation)\/(\d{1,16})\/?$/);
    if (point && Number.isSafeInteger(Number(point[2])) && Number(point[2]) > 0)
      return { type: 'osm-object', reference: 'https://www.openstreetmap.org/' + point[1] + '/' + point[2] };
    const marker = coordinates((url.searchParams.get('mlat') || '') + ',' + (url.searchParams.get('mlon') || ''), 'marcador do OpenStreetMap');
    if (marker) return marker;
    const hash = url.hash.match(/(?:^#|[&#])map=\d{1,2}\/([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)/);
    return hash ? coordinates(hash[1] + ',' + hash[2], 'visão do OpenStreetMap') : null;
  }
  if (host === 'maps.apple.com') {
    return coordinates(url.searchParams.get('ll') || url.searchParams.get('sll'), 'Apple Maps');
  }
  if (host === 'waze.com' || host.endsWith('.waze.com')) {
    return coordinates(url.searchParams.get('ll'), 'Waze');
  }
  if (host === 'google.com' || host.endsWith('.google.com')) {
    const marker = url.pathname.match(/@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/);
    const exact = url.href.match(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/);
    return coordinates(exact ? exact[1] + ',' + exact[2] :
      (url.searchParams.get('query') || url.searchParams.get('q') ||
       (marker ? marker[1] + ',' + marker[2] : null)), 'Google Maps');
  }
  return null;
}
