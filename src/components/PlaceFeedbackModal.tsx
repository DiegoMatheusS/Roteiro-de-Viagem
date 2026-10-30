import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Star,X} from 'lucide-react';
import {useAuth} from '../contexts/AuthContext';
import {useMapAppearance} from '../hooks/useMapAppearance';
import {useModalScrollLock} from '../hooks/useModalScrollLock';
import {fuelApi,FuelApiError} from '../services/fuelApi';
import type {RoleVectorMarker} from '../services/vectorPlaceData';
import {PLACE_FEEDBACK_QUESTIONS,type PlaceFeedbackAnswers,type PlaceRatingSummary} from '../types/placeFeedback';

export function PlaceFeedbackModal({place,onClose}:{place:RoleVectorMarker;onClose:()=>void}){
  const auth=useAuth(),{theme}=useMapAppearance();useModalScrollLock();
  const [answers,setAnswers]=useState<Partial<PlaceFeedbackAnswers>>({});
  const [rating,setRating]=useState<number|undefined>();
  const ratingEdited=useRef(false),section=useRef<HTMLElement>(null);
  const submissionId=useRef(crypto.randomUUID());
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    section.current?.querySelector<HTMLElement>('button')?.focus();
    return()=>{if(previous?.isConnected)previous.focus();};
  },[]);
  useEffect(()=>{
    const close=(event:Event)=>{
      // The account dialog can appear above this form when a guest submits.
      if(document.querySelector('[role="dialog"][aria-label="Conta do viajante"]'))return;
      event.preventDefault();event.stopImmediatePropagation();if(!busy)onClose();
    };
    window.addEventListener('rdv:close-overlay',close,true);
    return()=>window.removeEventListener('rdv:close-overlay',close,true);
  },[busy,onClose]);
  useEffect(()=>{
    const controller=new AbortController();
    void fuelApi<PlaceRatingSummary>(`/places/${encodeURIComponent(place.id)}/feedback`,{signal:controller.signal}).then(value=>{
      if(!controller.signal.aborted&&!ratingEdited.current&&value.myRating)setRating(value.myRating);
    }).catch(()=>{});return()=>controller.abort();
  },[place.id,auth.user?.id]);
  const complete=PLACE_FEEDBACK_QUESTIONS.every(question=>typeof answers[question.key]==='boolean');
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy||!complete||sent)return;
    if(!auth.user){auth.promptLogin();return;}
    setBusy(true);setError('');
    try{
      await fuelApi(`/places/${encodeURIComponent(place.id)}/feedback`,{method:'POST',
        body:JSON.stringify({...answers,...(rating?{rating}:{}),submissionId:submissionId.current})});
      setSent(true);window.dispatchEvent(new Event('rdv:place-feedback-sent'));
    }catch(error){setError((error as Error).message);if(error instanceof FuelApiError&&error.status===401)auth.promptLogin();}
    finally{setBusy(false);}
  };
  const dark=theme==='dark';
  return createPortal(<div role="presentation" className="fixed inset-0 z-80 bg-slate-950/60 flex items-end sm:items-center justify-center sm:p-4">
    <section ref={section} role="dialog" aria-modal="true" aria-label="Avaliar e informar sobre o estabelecimento"
      data-role-theme={theme} onKeyDown={event=>{
        if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}
        if(event.key==='Tab'){
          const nodes=section.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]');
          if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
      }} className={`w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl ${dark?'bg-slate-800 text-slate-100':'bg-white text-slate-900'}`}>
      <header className="flex justify-between gap-3 items-start"><div><h2 className="font-extrabold text-lg">Avaliar e informar</h2><p className={`text-sm mt-1 ${dark?'text-slate-300':'text-slate-600'}`}>{place.name}</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar avaliação" className="min-h-10 min-w-10 flex justify-center items-center rounded-full"><X size={23}/></button></header>
      {sent?<div className="mt-5 space-y-4"><p role="status" className={dark?'text-emerald-300':'text-emerald-800'}>Respostas enviadas.</p>
        <button type="button" onClick={onClose} className="w-full min-h-12 rounded-xl bg-blue-600 text-white font-bold">Concluir</button></div>
      :<form onSubmit={submit} className="mt-5 space-y-5">
        <fieldset disabled={busy}><legend className="font-bold mb-2">Sua avaliação</legend>
          <div role="radiogroup" aria-label="Sua avaliação" className="flex gap-1">
            {[1,2,3,4,5].map(value=><label key={value} className="relative h-11 w-11 flex items-center justify-center cursor-pointer">
              <input type="radio" name="rating" value={value} checked={rating===value}
                onChange={()=>{ratingEdited.current=true;setRating(value);}}
                aria-label={`${value} ${value===1?'estrela':'estrelas'}`} className="peer absolute opacity-0 inset-0 w-full h-full cursor-pointer"/>
              <Star size={32} aria-hidden="true" className={`pointer-events-none peer-focus-visible:outline-2 peer-focus-visible:outline-blue-500 rounded ${value<=(rating??0)?'fill-amber-400 text-amber-500':dark?'text-slate-400':'text-slate-400'}`}/>
            </label>)}
          </div>
        </fieldset>
        {PLACE_FEEDBACK_QUESTIONS.map(question=><fieldset key={question.key} disabled={busy} className={`border-t pt-4 ${dark?'border-slate-600':'border-slate-200'}`}>
          <legend className="font-semibold text-sm float-left w-full mb-2">{question.label}</legend>
          <div className="flex gap-3 clear-both">{[true,false].map(value=><label key={String(value)} className={`min-h-11 flex-1 rounded-xl border flex items-center justify-center gap-2 cursor-pointer text-sm font-semibold ${answers[question.key]===value?dark?'border-blue-400 bg-blue-950 text-blue-100':'border-blue-600 bg-blue-50 text-blue-800':dark?'border-slate-500':'border-slate-300'}`}>
            <input type="radio" required name={question.key} checked={answers[question.key]===value} value={String(value)}
              onChange={()=>setAnswers(current=>({...current,[question.key]:value}))} className="accent-blue-600"/>{value?'Sim':'Não'}
          </label>)}</div>
        </fieldset>)}
        {error&&<p role="alert" className={`text-sm ${dark?'text-rose-300':'text-rose-700'}`}>{error}</p>}
        <button type="submit" disabled={!complete||busy} className="w-full min-h-12 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">{busy?'Enviando…':'Enviar'}</button>
      </form>}
    </section>
  </div>,document.body);
}
