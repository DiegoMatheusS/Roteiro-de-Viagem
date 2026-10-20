import React, {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AlertTriangle,Cctv,CarFront,ChevronRight,Construction,Waves,X} from 'lucide-react';
import {PoliceOfficerIcon,PotholeIcon,RobberyIcon,TollBoothIcon} from './RoadAlertIcons';
import {ROAD_ALERT_TYPES,type RoadAlertType} from '../types/roadAlerts';
import type {DeviceLocation} from '../services/locationService';
import {getCurrentDeviceLocation} from '../services/locationService';
import {submitRoadAlert} from '../hooks/useRoadAlerts';
import '../role-road-alert.css';

const alertIcons:Record<RoadAlertType,React.ElementType>={
  pothole:PotholeIcon,
  broken_vehicle:CarFront,
  speed_camera:Cctv,
  road_obstruction:Construction,
  flooded_road:Waves,
  police_presence:PoliceOfficerIcon,
  robbery:RobberyIcon
};

interface SwipeState {
  pointerId:number;
  startX:number;
  width:number;
  progress:number;
}

/** Alerta rápido: seleção no topo + confirmação deliberada por deslize, somente parado. */
export function RoadAlertReporter({
  location,speedKmH,onSubmitted
}:{
  location:DeviceLocation|null;
  speedKmH:number|null;
  onSubmitted?:()=>void;
  menuPlacement?:'above'|'below'; // Compatibilidade com chamadas anteriores.
}){
  const [menuOpen,setMenuOpen]=useState(false);
  const [open,setOpen]=useState(false);
  const [tollInfo,setTollInfo]=useState(false);
  const [kind,setKind]=useState<RoadAlertType>('pothole');
  const [slide,setSlide]=useState(0);
  const swipe=useRef<SwipeState|null>(null);
  const sending=useRef(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const moving=speedKmH!=null&&speedKmH>5;
  const unableToSend=moving||!location||busy;

  useEffect(()=>{
    if(!menuOpen&&!open&&!tollInfo)return;
    const onEscape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      if(open)setOpen(false);
      else if(tollInfo)setTollInfo(false);
      else setMenuOpen(false);
    };
    document.addEventListener('keydown',onEscape);
    return()=>document.removeEventListener('keydown',onEscape);
  },[menuOpen,open,tollInfo]);

  const submit=async()=>{
    if(sending.current)return;
    setMessage('');setError('');setSlide(0);
    if(moving||!location){
      setError('Pare em segurança e aguarde o GPS para enviar.');return;
    }
    sending.current=true;
    setBusy(true);
    try {
      const fresh=await getCurrentDeviceLocation();
      if(fresh.speedMetersPerSecond!=null&&fresh.speedMetersPerSecond*3.6>5)
        throw new Error('Você está em movimento. Pare em segurança antes de enviar.');
      await submitRoadAlert(kind,fresh,'');
      setMessage('Enviado para análise. O alerta só aparece depois da aprovação.');
      onSubmitted?.();
    }catch(err){
      setError((err as Error).message);
    }finally{
      sending.current=false;
      setBusy(false);
    }
  };
  const selectKind=(selected:RoadAlertType)=>{
    setKind(selected);
    setMenuOpen(false);
    setError('');setMessage('');setSlide(0);
    setOpen(true);
  };
  const beginSwipe=(event:React.PointerEvent<HTMLButtonElement>)=>{
    if(unableToSend||event.button!==0)return;
    const rect=event.currentTarget.getBoundingClientRect();
    // Somente iniciar arrastando a alça, nunca tocando no fim da trilha.
    if(event.clientX>rect.left+71)return;
    swipe.current={pointerId:event.pointerId,startX:event.clientX,width:Math.max(1,rect.width-60),progress:0};
    setSlide(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveSwipe=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const active=swipe.current;
    if(!active||active.pointerId!==event.pointerId)return;
    const progress=Math.max(0,Math.min(1,(event.clientX-active.startX)/active.width));
    active.progress=progress;
    setSlide(progress);
  };
  const endSwipe=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const active=swipe.current;
    if(!active||active.pointerId!==event.pointerId)return;
    swipe.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if(active.progress>=.9&&!unableToSend)void submit();
    else setSlide(0);
  };
  const cancelSwipe=()=>{
    swipe.current=null;
    setSlide(0);
  };
  const selected=ROAD_ALERT_TYPES.find(item=>item.id===kind);

  return <>
    <button type="button" aria-label="Reportar problema na estrada"
      aria-expanded={menuOpen} aria-haspopup="menu"
      onClick={()=>setMenuOpen(value=>!value)}
      className="w-12 h-12 rounded-full bg-white text-amber-700 border border-amber-200 flex items-center justify-center shadow-[0_4px_18px_rgba(15,23,42,.16)] active:scale-95 transition-transform">
      {menuOpen?<X size={23}/>:<AlertTriangle size={25} strokeWidth={2.3}/>}
    </button>

    {menuOpen&&createPortal(
      <div className="rdv-alert-menu-layer" role="presentation"
        onPointerDown={event=>{if(event.target===event.currentTarget)setMenuOpen(false);}}>
        <div role="menu" aria-label="Escolher ocorrência" data-testid="road-alert-balloon"
          className="rdv-alert-top-menu">
          <div className="rdv-alert-menu-header">
            <strong>Qual é o alerta?</strong>
            <button type="button" onClick={()=>setMenuOpen(false)} aria-label="Fechar opções de alerta"><X size={20}/></button>
          </div>
          <div className="rdv-alert-icon-grid">
            {ROAD_ALERT_TYPES.map(item=>{
              const Icon=alertIcons[item.id];
              return <button role="menuitem" key={item.id} type="button"
                aria-label={item.label} title={item.label}
                onClick={()=>selectKind(item.id)} className="rdv-alert-icon-option">
                <Icon size={25} strokeWidth={2} aria-hidden="true"/>
              </button>;
            })}
            <button role="menuitem" type="button" aria-label="Pedágio" title="Pedágio"
              onClick={()=>{setMenuOpen(false);setTollInfo(true);}}
              className="rdv-alert-icon-option rdv-alert-icon-toll">
              <TollBoothIcon size={25} strokeWidth={2} aria-hidden="true"/>
            </button>
          </div>
        </div>
      </div>,document.body
    )}

    {tollInfo&&createPortal(
      <div className="fixed inset-0 z-[110] bg-black/65 flex items-end justify-center"
        role="dialog" aria-modal="true" aria-label="Contribuir com pedágio">
        <section className="w-full max-w-md rounded-t-3xl bg-white p-5 space-y-3">
          <div className="flex justify-between">
            <h3 className="font-bold text-lg">Informar pedágio</h3>
            <button type="button" onClick={()=>setTollInfo(false)} aria-label="Fechar"><X/></button>
          </div>
          <p className="text-sm text-slate-600">Para indicar ou atualizar a tarifa, toque no marcador do pedágio no mapa e escolha a opção de contribuição. As informações passam pela aprovação do administrador.</p>
          <button type="button" className="rounded-xl p-3 bg-blue-600 text-white font-bold w-full"
            onClick={()=>setTollInfo(false)}>Voltar ao mapa</button>
        </section>
      </div>,document.body
    )}

    {open&&createPortal(
      <div className="fixed inset-0 z-[110] bg-black/65 flex items-end sm:items-center justify-center p-3"
        role="dialog" aria-modal="true" aria-label="Reportar ocorrência na via">
        <div className="rdv-alert-confirm bg-white rounded-3xl w-full max-w-md p-5 space-y-4 text-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Deseja fazer o alerta?</h3>
              <p className="text-sm text-slate-600 mt-1">{selected?.label}</p>
            </div>
            <button type="button" aria-label="Fechar ocorrência"
              onClick={()=>{setOpen(false);cancelSwipe();}}><X size={22}/></button>
          </div>
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Somente com o veículo parado em local seguro. Não use o celular dirigindo.
          </p>
          {!location&&<p role="alert" className="text-sm text-amber-800">GPS indisponível. Ative a localização precisa.</p>}
          {moving&&<p role="alert" className="text-sm text-rose-700">Veículo em movimento. Envio bloqueado.</p>}
          {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
          {message&&<p role="status" className="text-sm text-emerald-800">{message}</p>}
          <button type="button" aria-label="Deslize para alertar"
            disabled={unableToSend||Boolean(message)}
            className="rdv-alert-swipe-track" onPointerDown={beginSwipe}
            onPointerMove={moveSwipe} onPointerUp={endSwipe}
            onPointerCancel={cancelSwipe}
            onKeyDown={event=>{
              // Alternativa acessível ao gesto, apenas com GPS e veículo parado.
              if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!unableToSend)void submit();}
            }}>
            <span className="rdv-alert-swipe-copy">{busy?'Enviando…':'Deslize para alertar'}</span>
            <span className="rdv-alert-swipe-handle" style={{left:`calc(4px + ${slide*100}% - ${slide*60}px)`}}>
              <ChevronRight size={22}/>
            </span>
          </button>
        </div>
      </div>,document.body
    )}
  </>;
}
