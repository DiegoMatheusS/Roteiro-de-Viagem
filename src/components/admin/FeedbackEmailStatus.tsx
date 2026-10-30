import React,{useEffect,useState} from 'react';
import {fuelApi} from '../../services/fuelApi';
export function FeedbackEmailStatus(){
  const [status,setStatus]=useState<{configured:boolean;recipient:string|null;pending:number}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{void fuelApi<typeof status>('/admin/feedback-email').then(setStatus).catch(error=>setError(error.message));},[]);
  return <section className="bg-white border rounded-2xl p-5 space-y-2 text-sm"><h2 className="font-bold text-lg">Avisos de estabelecimentos por e-mail</h2>
    {error&&<p role="alert" className="text-rose-700">{error}</p>}
    {status&&<><p>{status.configured?'Envio configurado.':'Envio por e-mail pendente de configuração.'}</p>
      {status.recipient&&<p>Destinatário: {status.recipient}</p>}
      <p>{status.pending} {status.pending===1?'aviso aguardando envio':'avisos aguardando envio'}.</p>
      {!status.configured&&<p className="text-slate-600">Os relatos continuam salvos em Solicitações → Denúncias.</p>}</>}
  </section>;
}
