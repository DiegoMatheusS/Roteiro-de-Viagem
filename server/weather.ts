import type { Express } from 'express';
import type { WeatherPoint } from '../src/types';
import { clientIp, ApiError, asyncRoute, now } from './http';
import { validateCoordinates, type MapFetch, type Coordinates } from './maps';
import { distanceBetweenKm } from '../src/services/gpsTracking';

export const WEATHER_CODES = new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
export function weatherCondition(code: number): WeatherPoint['condition'] {
  if (code === 0) return 'Ensolarado';
  if (code <= 2) return 'Parcialmente Nublado';
  if (code === 3) return 'Nublado';
  if (code === 45 || code === 48) return 'Neblina';
  if ([56,57,66,67].includes(code)) return 'Chuva Congelante';
  if ([71,73,75,77,85,86].includes(code)) return 'Neve';
  if ([95,96,99].includes(code)) return 'Trovoada';
  if ([65,82].includes(code)) return 'Chuva Forte';
  return 'Chuva Fraca';
}
export interface WeatherStop { coords: Coordinates; stayMinutes: number }
export function weatherSamples(path: Coordinates[], drivingMinutes: number, stops: WeatherStop[], departureMs: number) {
  const along = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i-1] + distanceBetweenKm(path[i-1], path[i]));
  const total = along.at(-1)!;
  let lastStopIndex = 0;
  const stays = stops.map(stop => {
    let index = lastStopIndex, closest = Infinity;
    for (let i = lastStopIndex; i < path.length; i++) { const d = distanceBetweenKm(path[i], stop.coords); if (d < closest) { closest = d; index = i; } }
    lastStopIndex = index;
    return { index, minutes: stop.stayMinutes };
  });
  const indices = total > 0 ? Array.from({ length: Math.min(5, path.length) }, (_, i) => {
    const target = total * i / (Math.min(5, path.length)-1);
    let index = along.findIndex(km => km >= target); if (index < 0) index = path.length-1;
    if (index > 0 && target - along[index-1] < along[index] - target) index--;
    return index;
  }) : [0, path.length-1];
  return [...new Set(indices)].map((index, position, chosen) => {
    const fraction = total > 0 ? along[index] / total : position / Math.max(1, chosen.length-1);
    const stay = stays.filter(stop => stop.index < index).reduce((sum, stop) => sum+stop.minutes,0);
    return { coords: path[index], passAt: departureMs + (fraction*drivingMinutes + stay)*60000,
      name: position === 0 ? 'Origem' : position === chosen.length-1 ? 'Destino' : `Trecho ${position}` };
  });
}
export function registerWeatherRoutes(app: Express, fetcher: MapFetch,
  limit: (key: string, max: number, ms: number) => void) {
  // Cache provider series, not another traveler's passage times or coordinates.
  const cache = new Map<string, { expires: number; payload: any }>();
  app.post('/api/weather/route', asyncRoute(async (req, res) => {
    limit(`weather:${clientIp(req)}`, 20, 60000);
    const path = req.body.routePath;
    if (!Array.isArray(path) || path.length < 2 || path.length > 2500) throw new ApiError('Percurso inválido.');
    path.forEach((point: unknown) => validateCoordinates([point]));
    const minutes = req.body.drivingMinutes, stops = req.body.stops ?? [];
    if (!Array.isArray(stops) || stops.length > 80 || stops.some(s => !Number.isFinite(s?.stayMinutes) || s.stayMinutes < 0 || s.stayMinutes > 1440)) throw new ApiError('Permanências inválidas.');
    stops.forEach(s => validateCoordinates([s.coords]));
    const departure = req.body.departureAt ? new Date(req.body.departureAt) : new Date();
    const totalMinutes = minutes + stops.reduce((sum,s) => sum+s.stayMinutes,0);
    if (!Number.isFinite(minutes) || minutes < 0 || totalMinutes > 14400 || !Number.isFinite(departure.getTime()) ||
      departure.getTime() < Date.now()-3600000 || departure.getTime()+totalMinutes*60000 > Date.now()+15*86400000)
      throw new ApiError('A previsão atende viagens com saída e chegada nos próximos 15 dias.');
    const samples = weatherSamples(path,minutes,stops,departure.getTime());
    const url = new URL(process.env.WEATHER_URL || 'https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',samples.map(p => p.coords[0]).join(',')); url.searchParams.set('longitude',samples.map(p => p.coords[1]).join(','));
    url.searchParams.set('hourly','temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m');
    url.searchParams.set('temperature_unit','celsius'); url.searchParams.set('wind_speed_unit','kmh');
    url.searchParams.set('forecast_days','16'); url.searchParams.set('timezone','UTC');
    if (process.env.WEATHER_API_KEY) url.searchParams.set('apikey',process.env.WEATHER_API_KEY);
    const key = url.toString(), saved = cache.get(key);
    let payload: any = saved && saved.expires > Date.now() ? saved.payload : undefined;
    if (!payload) {
      try { const response = await fetcher(url,{ signal: AbortSignal.timeout(12000) }); if (!response.ok) throw new Error(); payload = await response.json(); }
      catch { throw new ApiError('Previsão do tempo indisponível. Tente novamente.',503); }
    }
    const forecasts = Array.isArray(payload) ? payload : [payload];
    const weatherPoints: WeatherPoint[] = samples.map((sample,index) => {
      const { hourly, hourly_units: units } = forecasts[index] || {};
      if (!Array.isArray(hourly?.time) || !hourly.time.length || units?.temperature_2m && units.temperature_2m !== '°C' || units?.wind_speed_10m && units.wind_speed_10m !== 'km/h') throw new ApiError('O provedor não retornou previsão válida para o percurso.',503);
      let best = -1, delta = Infinity;
      hourly.time.forEach((time: unknown,j: number) => { if (typeof time !== 'string') return; const d = Math.abs(new Date(time.endsWith('Z') ? time : time+'Z').getTime()-sample.passAt); if (d < delta) { best=j; delta=d; } });
      const values = [hourly.temperature_2m?.[best],hourly.precipitation_probability?.[best],hourly.weather_code?.[best],hourly.wind_speed_10m?.[best]];
      if (delta > 3600000 || values.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new ApiError('Previsão não disponível no horário de passagem.',503);
      const [tempC,rainProb,code,windKmH] = values;
      if (rainProb < 0 || rainProb > 100 || windKmH < 0 || !WEATHER_CODES.has(code)) throw new ApiError('Resposta meteorológica inválida.',503);
      const condition = weatherCondition(code), forecastAt = new Date(sample.passAt).toISOString();
      const rawWindDirection = hourly.wind_direction_10m?.[best];
      const windDirectionDeg = typeof rawWindDirection === 'number' && Number.isFinite(rawWindDirection) &&
        rawWindDirection >= 0 && rawWindDirection <= 360 ? rawWindDirection : undefined;
      return { locationName: sample.name, coords: sample.coords, forecastAt, passTime: forecastAt, tempC,rainProb,condition,windKmH,windDirectionDeg,
        warning: ['Neve','Trovoada','Chuva Congelante','Neblina'].includes(condition) ? `Previsão de ${condition.toLowerCase()} no percurso. Confira as condições antes de sair.` : rainProb >= 60 || windKmH >= 50 ? 'Possibilidade de chuva ou vento forte. Confira a previsão antes de sair.' : undefined };
    });
    if (cache.size > 1000) cache.clear();
    if (!saved || saved.expires <= Date.now()) cache.set(key,{ expires: Date.now()+15*60000,payload });
    res.json({ weatherPoints,hasRainRisk: weatherPoints.some(p => p.rainProb >= 50 || p.condition.startsWith('Chuva') || ['Neve','Trovoada'].includes(p.condition)),source:'Open-Meteo',updatedAt:now() });
  }));
}
