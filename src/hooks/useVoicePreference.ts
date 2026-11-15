import {useSyncExternalStore} from 'react';
import {VOICE_PREFERENCE_EVENT,VOICE_PREFERENCE_KEY,readVoicePreference,writeVoicePreference} from '../services/voicePreference';

function subscribe(changed:()=>void){
  const storage=(event:StorageEvent)=>{
    if(event.key===VOICE_PREFERENCE_KEY||event.key===null)changed();
  };
  window.addEventListener(VOICE_PREFERENCE_EVENT,changed);
  window.addEventListener('storage',storage);
  return()=>{
    window.removeEventListener(VOICE_PREFERENCE_EVENT,changed);
    window.removeEventListener('storage',storage);
  };
}
export function useVoicePreference(){
  return {enabled:useSyncExternalStore(subscribe,readVoicePreference,()=>false),
    setEnabled:writeVoicePreference};
}
