export const VOICE_PREFERENCE_KEY='role:voice-guidance:v1';
export const VOICE_PREFERENCE_EVENT='role:voice-guidance-change';

export function readVoicePreference():boolean {
  try{return typeof window!=='undefined'&&window.localStorage.getItem(VOICE_PREFERENCE_KEY)==='true';}
  catch{return false;}
}
export function writeVoicePreference(enabled:boolean):void {
  if(typeof window==='undefined')return;
  try{window.localStorage.setItem(VOICE_PREFERENCE_KEY,String(enabled));}
  catch{/* The control remains usable for this session even if storage is blocked. */}
  window.dispatchEvent(new Event(VOICE_PREFERENCE_EVENT));
}
