import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useRoadAlerts} from '../../src/hooks/useRoadAlerts';

const first:[[number,number],[number,number]]=[[-23.5,-46.6],[-23.5,-46.59]];
const second:[[number,number],[number,number]]=[[-23.6,-46.5],[-23.6,-46.49]];

function Fixture(){
  const [path,setPath]=useState<[number,number][]>(first);
  const {alerts,error,reload}=useRoadAlerts(path);
  return <main>
    <output data-testid="road-alerts">{alerts.map(item=>item.id).join(',')}</output>
    <output data-testid="road-error">{error}</output>
    <button onClick={()=>{void reload();}}>Atualizar alertas</button>
    <button onClick={()=>setPath(second)}>Trocar rota</button>
    <button onClick={()=>setPath([])}>Parar navegação</button>
    <button onClick={()=>setPath(first)}>Retomar primeira rota</button>
    <button onClick={()=>document.dispatchEvent(new Event('visibilitychange'))}>Voltar ao primeiro plano</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
