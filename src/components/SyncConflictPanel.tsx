import type { StateConflict } from '../services/stateMerge';
export function SyncConflictPanel({conflicts,onChoose}:{conflicts:StateConflict[];onChoose:(preference:'server'|'device')=>void}){
  return <div className="space-y-2 text-xs"><p>Somente as alterações conflitantes precisam de escolha. Os demais registros dos dois aparelhos serão mantidos.</p>
    <ul className="max-h-48 overflow-y-auto space-y-2">{conflicts.map((c,i)=><li key={i} className="p-2 bg-white border rounded-lg"><strong>{c.label}</strong><p>Neste aparelho: {c.device}</p><p>No servidor: {c.server}</p></li>)}</ul>
    <div className="flex flex-wrap gap-2"><button onClick={()=>onChoose('device')} className="p-2 border rounded-lg font-bold">Manter minhas alterações conflitantes</button><button onClick={()=>onChoose('server')} className="p-2 border rounded-lg font-bold">Manter alterações do outro aparelho</button></div>
  </div>;
}
