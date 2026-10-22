import React,{useEffect,useRef,useState} from 'react';
import {HardDriveDownload,Trash2,RefreshCw} from 'lucide-react';
import {deleteOfflineRegion,listOfflineRegions} from '../services/offlineMapStorage';
import {offlineRegionReady,type OfflineRegion} from '../services/offlineMapRegions';
import {importOfflineMapPackage} from '../services/offlineMapPackageImport';
import {OFFLINE_REGIONS_CHANGED} from '../services/offlineMapSelection';

const formatBytes=(n:number)=>n<1_000_000
  ?`${Math.round(n/1000)} KB`
  :`${(n/1_000_000).toFixed(1)} MB`;
export function OfflineRegionsPanel(){
  const [regions,setRegions]=useState<OfflineRegion[]>([]);
  const [busy,setBusy]=useState(false);
  const [consent,setConsent]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [progress,setProgress]=useState<{done:number;total:number}|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const mounted=useRef(true);
  const refresh=async()=>{
    try{const items=await listOfflineRegions();if(mounted.current)setRegions(items);}
    catch(e){if(mounted.current)setError((e as Error).message);}
  };
  useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;};},[]);
  const importFile=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];
    if(!file)return;
    if(!consent){setError('Confirme que você tem autorização para armazenar o pacote.');event.target.value='';return;}
    setBusy(true);setError('');setSuccess('');setProgress(null);
    try{
      const result=await importOfflineMapPackage(file,(done,total)=>{
        if(mounted.current&&(done===total||done%5===0))setProgress({done,total});
      });
      if(mounted.current)setSuccess(`Pacote "${result.name}" salvo neste aparelho. Abra o mapa e selecione esta região nas camadas para visualizá-la sem internet.`);
      await refresh();
      window.dispatchEvent(new Event(OFFLINE_REGIONS_CHANGED));
    }catch(e){if(mounted.current){setError((e as Error).message);await refresh();}}
    finally{
      if(mounted.current){setBusy(false);setProgress(null);}
      if(fileRef.current)fileRef.current.value='';
    }
  };
  const remove=async(item:OfflineRegion)=>{
    if(!window.confirm(`Excluir o pacote "${item.name}" deste aparelho?`))return;
    setBusy(true);setError('');setSuccess('');
    try{
      await deleteOfflineRegion(item.id);
      window.dispatchEvent(new Event(OFFLINE_REGIONS_CHANGED));
      if(mounted.current)setSuccess(`Pacote "${item.name}" excluído do aparelho.`);
      await refresh();
    }catch(e){if(mounted.current)setError((e as Error).message);}
    finally{if(mounted.current)setBusy(false);}
  };
  return <section className="rounded-2xl border border-blue-100 bg-slate-50 p-4 space-y-4" aria-label="Mapas armazenados no aparelho">
    <div className="flex items-start gap-3">
      <HardDriveDownload className="h-5 w-5 text-blue-700 shrink-0 mt-0.5"/>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Mapas por região</h3>
        <p className="text-xs text-slate-600 mt-1">
          Armazene pacotes locais fornecidos com licença para uso offline. Ainda não é possível
          baixar regiões diretamente pelo Rolê nem recalcular rotas sem internet. Pacotes completos podem ser visualizados no MapLibre após selecionados.
        </p>
      </div>
    </div>
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-xs text-slate-800">Pacotes neste aparelho ({regions.length}/4)</strong>
        <button type="button" aria-label="Atualizar lista de mapas armazenados" onClick={()=>void refresh()} disabled={busy}
          className="p-2 rounded-lg text-blue-800 hover:bg-blue-50 disabled:opacity-50">
          <RefreshCw size={17}/>
        </button>
      </div>
      {regions.length===0&&<p className="text-xs text-slate-500">Nenhum pacote armazenado.</p>}
      {regions.map(item=><div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <strong className="block text-xs text-slate-900 break-words">{item.name}</strong>
          <p className="text-[11px] text-slate-500">
            {item.savedTiles}/{item.expectedTiles} tiles · {formatBytes(item.sizeBytes)} · zoom {item.minZoom}–{item.maxZoom}
          </p>
          <p className="text-[11px] text-slate-500 break-words">{item.attribution}</p>
          <span className="text-[11px] font-semibold text-blue-800">
            {offlineRegionReady(item)?'Armazenado (visualização ainda indisponível)':'Armazenamento incompleto'}
          </span>
        </div>
        <button type="button" aria-label={`Excluir mapa ${item.name}`} disabled={busy}
          onClick={()=>void remove(item)} className="p-3 rounded-xl border border-rose-200 text-rose-700 disabled:opacity-50">
          <Trash2 size={17}/>
        </button>
      </div>)}
    </div>
    <div className="border-t border-slate-200 pt-3 space-y-3">
      <p className="text-xs text-slate-600">
        Importação experimental: pacote JSON no formato <code>role-raster-region-v1</code>.
        Limites: até 3.000 imagens e 50 MB por região. Não funciona com MBTiles ou ZIP nesta etapa.
      </p>
      <label className="flex gap-2 text-xs text-slate-800 items-start">
        <input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}
          className="mt-0.5"/>
        Confirmo que o pacote foi obtido legalmente e que possuo autorização para armazená-lo offline.
      </label>
      <input ref={fileRef} type="file" accept=".json,application/json"
        aria-label="Selecionar pacote de mapa offline licenciado"
        disabled={!consent||busy||regions.length>=4} onChange={event=>void importFile(event)}
        className="block w-full text-xs text-slate-800 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white disabled:opacity-50"/>
      {busy&&<p role="status" className="text-xs text-blue-800">
        {progress?`Importando tiles: ${progress.done}/${progress.total}`:'Processando pacote local…'}
      </p>}
      {error&&<p role="alert" className="text-xs text-rose-800">{error}</p>}
      {success&&<p role="status" className="text-xs text-emerald-800">{success}</p>}
    </div>
  </section>;
}
