import type {RoadAlert} from '../types/roadAlerts';

export function RadarAttribution({alert}:{alert:RoadAlert}){
  if(alert.source!=='pardal')return null;
  return <div className="mt-2 space-y-1 text-[11px] text-slate-500" data-testid="radar-source">
    <p>Fonte: <a href="https://github.com/murkiriel/pardal" target="_blank" rel="noreferrer" className="underline">Pardal</a>{alert.dataSource?` · ${alert.dataSource}`:''}.</p>
    {alert.datasetUpdatedAt&&<p>Base atualizada em {new Date(alert.datasetUpdatedAt).toLocaleDateString('pt-BR')}. A sinalização da via prevalece.</p>}
    <p>© colaboradores do OpenStreetMap e fontes públicas · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer" className="underline">ODbL 1.0</a></p>
  </div>;
}
