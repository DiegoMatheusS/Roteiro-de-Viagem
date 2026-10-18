import type {WeatherPoint} from '../types';

/** Previsões pontuais vindas do provedor. Sem posição válida, não há marcador. */
export function validWeatherPoint(point:WeatherPoint):boolean {
  const coords=point?.coords;
  return Boolean(coords && Array.isArray(coords) && coords.length===2 &&
    coords.every(Number.isFinite) && Math.abs(coords[0])<=90 && Math.abs(coords[1])<=180 &&
    typeof point.locationName==='string' && point.locationName.trim().length>0 &&
    Number.isFinite(point.rainProb) && point.rainProb>=0 && point.rainProb<=100 &&
    Number.isFinite(point.tempC) && Number.isFinite(point.windKmH) && point.windKmH>=0);
}
export function weatherPointKey(point:WeatherPoint):string {
  const coords=point.coords!;
  return JSON.stringify([coords[0],coords[1],point.forecastAt||point.passTime,point.locationName]);
}
export function visibleWeatherSamples(samples:readonly WeatherPoint[]):WeatherPoint[] {
  const seen=new Set<string>();
  return samples.filter(point=>{
    if(!validWeatherPoint(point))return false;
    const key=weatherPointKey(point);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
/** Forecast time can be an ISO timestamp OR a time-only string; never assume a date. */
export function weatherDisplayTime(point:WeatherPoint):string {
  const timestamp=point.forecastAt;
  if(timestamp && Number.isFinite(Date.parse(timestamp))){
    return new Date(timestamp).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(point.passTime))return point.passTime;
  return 'Horário não informado';
}
export function weatherDisplayLines(point:WeatherPoint):string[] {
  const direction=Number.isFinite(point.windDirectionDegrees) && point.windDirectionDegrees!>=0 &&
    point.windDirectionDegrees!<360 ? ` · direção ${Math.round(point.windDirectionDegrees!)}°`:'';
  return [
    point.locationName,
    `Previsão: ${point.condition} · ${point.tempC}°C`,
    `Chuva: ${point.rainProb}% · Vento: ${point.windKmH} km/h${direction}`,
    weatherDisplayTime(point),
    ...(point.warning?[point.warning]:[]),
    'Fonte: Open-Meteo (não é radar ao vivo)'
  ];
}
