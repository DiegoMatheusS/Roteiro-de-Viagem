import type { Express } from 'express';
import type { WeatherPoint } from '../src/types';
import { ApiError, asyncRoute, now } from './http';
import { validateCoordinates, type MapFetch } from './maps';
import { sampleRoutePath } from '../src/types/itinerary';
import { distanceBetweenKm } from '../src/services/gpsTracking';

export function weatherCondition(code: number): WeatherPoint['condition'] {
  if (code === 0) return 'Ensolarado';
  if (code <= 2) return 'Parcialmente Nublado';
  if (code === 3) return 'Nublado';
  if (code === 45 || code === 48) return 'Neblina';
  if ([65, 67, 75, 82, 86, 95, 96, 99].includes(code)) return 'Chuva Forte';
  return 'Chuva Fraca';
}
export function registerWeatherRoutes(app: Express, fetcher: MapFetch,
  limit: (key: string, max: number, ms: number) => void) {
  const cache = new Map<string, { expires: number; data: unknown }>();
  app.post('/api/weather/route', asyncRoute(async (req, res) => {
    limit(`weather:${req.ip}`, 20, 60000);
    const path = req.body.routePath;
    if (!Array.isArray(path) || path.length < 2 || path.length > 2500) throw new ApiError('Percurso inválido.');
    for (const point of path) validateCoordinates([point]);
    const minutes = req.body.drivingMinutes;
    const departure = req.body.departureAt ? new Date(req.body.departureAt) : new Date();
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 14400 || !Number.isFinite(departure.getTime()) ||
      departure.getTime() < Date.now() - 3600000 || departure.getTime() + minutes * 60000 > Date.now() + 15 * 86400000)
      throw new ApiError('A previsão atende viagens com saída e chegada nos próximos 15 dias.');
    const points = sampleRoutePath(path, 5);
    const key = JSON.stringify([points.map(p => p.map((n: number) => n.toFixed(2))), Math.floor(departure.getTime() / 3600000), Math.round(minutes)]);
    const saved = cache.get(key);
    if (saved && saved.expires > Date.now()) { res.json(saved.data); return; }
    if (cache.size > 1000) cache.clear();
    const url = new URL(process.env.WEATHER_URL || 'https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', points.map(p => p[0]).join(','));
    url.searchParams.set('longitude', points.map(p => p[1]).join(','));
    url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m');
    url.searchParams.set('forecast_days', '16'); url.searchParams.set('timezone', 'UTC');
    if (process.env.WEATHER_API_KEY) url.searchParams.set('apikey', process.env.WEATHER_API_KEY);
    let payload: any;
    try { const response = await fetcher(url, { signal: AbortSignal.timeout(12000) }); if (!response.ok) throw new Error(); payload = await response.json(); }
    catch { throw new ApiError('Previsão do tempo indisponível. Tente novamente.', 503); }
    const forecasts = Array.isArray(payload) ? payload : [payload];
    const cumulative = [0]; for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1] + distanceBetweenKm(path[i - 1], path[i]));
    const weatherPoints: WeatherPoint[] = points.map((point, index) => {
      const pathIndex = index === points.length - 1 ? path.length - 1 : Math.round(index * (path.length - 1) / (points.length - 1));
      const fraction = cumulative[path.length - 1] > 0 ? cumulative[pathIndex] / cumulative[path.length - 1] : index / (points.length - 1);
      const passAt = departure.getTime() + fraction * minutes * 60000;
      const hourly = forecasts[index]?.hourly;
      if (!Array.isArray(hourly?.time) || !hourly.time.length) throw new ApiError('O provedor não retornou previsão para o percurso.', 503);
      let best = -1, delta = Infinity;
      hourly.time.forEach((time: string, j: number) => { const difference = Math.abs(new Date(time.endsWith('Z') ? time : time + 'Z').getTime() - passAt); if (difference < delta) { best = j; delta = difference; } });
      const values = [hourly.temperature_2m?.[best], hourly.precipitation_probability?.[best], hourly.weather_code?.[best], hourly.wind_speed_10m?.[best]];
      if (delta > 3600000 || values.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new ApiError('Previsão não disponível no horário de passagem.', 503);
      const [tempC, rainProb, code, windKmH] = values;
      if (rainProb < 0 || rainProb > 100 || windKmH < 0 || code < 0 || code > 99) throw new ApiError('Resposta meteorológica inválida.', 503);
      const forecastAt = new Date(passAt).toISOString();
      return { locationName: index === 0 ? 'Origem' : index === points.length - 1 ? 'Destino' : `Trecho ${index}`,
        coords: point, forecastAt, passTime: forecastAt, tempC, rainProb, condition: weatherCondition(code), windKmH,
        warning: rainProb >= 60 || windKmH >= 50 ? 'Possibilidade de chuva ou vento forte. Confira a previsão antes de sair.' : undefined };
    });
    const data = { weatherPoints, hasRainRisk: weatherPoints.some(p => p.rainProb >= 50 || p.condition.startsWith('Chuva')),
      source: 'Open-Meteo', updatedAt: now() };
    cache.set(key, { expires: Date.now() + 15 * 60000, data }); res.json(data);
  }));
}
