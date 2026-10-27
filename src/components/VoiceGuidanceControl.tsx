import {useEffect,useRef,useState} from 'react';
import {Volume2,VolumeX} from 'lucide-react';

interface VoiceGuidanceProps {
  guidance: {text:string;road:string;meters:number}|null;
}

/** Optional spoken guidance: no tracking or microphone permission is required. */
export function VoiceGuidanceControl({guidance}:VoiceGuidanceProps){
  const supported=typeof window!=='undefined'&&
    'speechSynthesis' in window&&typeof SpeechSynthesisUtterance!=='undefined';
  const [enabled,setEnabled]=useState(false);
  const announced=useRef(new Set<string>());
  const say=(text:string)=>{
    if(!supported)return;
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang='pt-BR';
    utterance.rate=1;
    utterance.volume=1;
    window.speechSynthesis.speak(utterance);
  };
  const announce=(force:boolean)=>{
    if(!guidance || !supported) return;
    const band=guidance.meters>400?'far':guidance.meters>100?'near':guidance.meters>30?'now':'immediate';
    const key=`${guidance.text}|${guidance.road}|${band}`;
    if(!force && announced.current.has(key))return;
    announced.current.add(key);
    const meters=guidance.meters>=1000
      ?`${(guidance.meters/1000).toFixed(1).replace('.',',')} quilômetros`
      :`${guidance.meters} metros`;
    say(`Em ${meters}, ${guidance.text.toLowerCase()}${guidance.road?' na '+guidance.road:''}.`);
  };
  const guidanceKey=guidance?`${guidance.text}|${guidance.road}|${Math.floor(guidance.meters/10)}`:'';
  useEffect(()=>{
    if(!enabled||!guidance)return;
    announce(false);
    // next speech is allowed only when a maneuver/distance band changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[enabled,guidanceKey]);
  useEffect(()=>()=>{if(supported)window.speechSynthesis.cancel();},[supported]);
  return <div className="rdv-nav-voice-wrap">
    <button type="button"
      aria-label={supported?'Orientações por voz':'Orientações por voz indisponíveis'}
      aria-pressed={enabled} disabled={!supported}
      title={supported?(enabled?'Desligar voz':'Ativar instruções faladas'):undefined}
      onClick={()=>{
        if(!supported)return;
        if(enabled){window.speechSynthesis.cancel();setEnabled(false);}
        else{setEnabled(true);announce(true);}
      }}
      className={`rdv-nav-map-button ${enabled?'is-voice-enabled':''}`}>
      {enabled?<Volume2 size={21}/>:<VolumeX size={21}/>}
      <span>Voz</span>
    </button>
  </div>;
}
