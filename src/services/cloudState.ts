import type { FuelUser } from '../types/fuel';
import { fuelApi, FuelApiError } from './fuelApi';
import { storageService, emptyTravelerSnapshot, type TravelerSnapshot } from './storageService';
import { mergeTravelerState, type StateConflict } from './stateMerge';
interface AccountState { state:TravelerSnapshot|null; revision:number; updatedAt:string|null }
export type SyncState='loading'|'synced'|'pending'|'offline'|'error'|'conflict'|'guest';
type Notify=(state:SyncState,message?:string,conflicts?:StateConflict[])=>void;
let account:FuelUser|null=null, generation=0, revision=0, base:TravelerSnapshot|null=null;
let initialized=false, blocked=false, inFlight=false, failures=0;
let notify:Notify|null=null, timer:ReturnType<typeof setTimeout>|null=null, poll:ReturnType<typeof setInterval>|null=null;
const key=(id:string,suffix:string)=>`rdv_cloud_v1_${id}_${suffix}`;
const dirty=()=>!!account&&localStorage.getItem(key(account.id,'dirty'))==='true';
const status=(state:SyncState,message?:string,conflicts?:StateConflict[])=>notify?.(state,message,conflicts);
const changed=()=>window.dispatchEvent(new Event('rdv:remote-state'));
const backup=()=>{if(account)localStorage.setItem(key(account.id,'conflict_backup'),JSON.stringify(storageService.getSnapshot(account.displayName)));};
function stop(){generation++;if(timer)clearTimeout(timer);if(poll)clearInterval(poll);timer=null;poll=null;account=null;initialized=false;blocked=false;inFlight=false;revision=0;base=null;failures=0;storageService.setChangeListener(null);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);}
function schedule(delay=850){if(!account||blocked)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;void cloudState.retry();},delay);}
function watch(){storageService.setChangeListener(()=>{if(!account)return;localStorage.setItem(key(account.id,'dirty'),'true');status(blocked?'conflict':initialized?'pending':'offline',blocked?'Há alterações diferentes no mesmo registro. Escolha quais manter.':undefined);schedule();});}
function setBase(remote:AccountState){if(!account)return;revision=remote.revision;base=remote.state||emptyTravelerSnapshot(account.id,account.displayName);localStorage.setItem(key(account.id,'revision'),String(revision));localStorage.setItem(key(account.id,'base'),JSON.stringify(base));initialized=true;}
function reconcile(remote:AccountState,preference?:'server'|'device'){
  if(!account)return false;
  const local=storageService.getSnapshot(account.displayName), authoritative=remote.state||emptyTravelerSnapshot(account.id,account.displayName);
  const merged=mergeTravelerState(base,local,authoritative,preference);
  if(merged.conflicts.length){blocked=true;backup();if(local.activeTrip){const end=authoritative.trips.find(t=>t.id===local.activeTrip!.id);if(end&&['completed','cancelled'].includes(end.status)){storageService.setActiveTrip(null);changed();}else if(authoritative.activeTrip?.id===local.activeTrip.id&&authoritative.activeTrip.trackingDeviceId!==local.activeTrip.trackingDeviceId){storageService.setActiveTrip({...local.activeTrip,trackingDeviceId:authoritative.activeTrip.trackingDeviceId});changed();}}status('conflict','Há alterações diferentes no mesmo registro. As demais alterações serão preservadas.',merged.conflicts);return false;}
  setBase(remote);storageService.replaceSnapshot(merged.state);blocked=false;changed();
  const pending=JSON.stringify(merged.state)!==JSON.stringify(base);
  if(pending)localStorage.setItem(key(account.id,'dirty'),'true');else localStorage.removeItem(key(account.id,'dirty'));
  status(pending?'pending':'synced');return true;
}
async function flush(){
  if(!account||!initialized||blocked||inFlight||!dirty())return;
  const current=account,token=generation;inFlight=true;
  try{
    for(let attempt=0;attempt<3;attempt++){
      const snapshot=storageService.getSnapshot(current.displayName),serialized=JSON.stringify(snapshot);
      try{
        const result=await fuelApi<{revision:number}>('/me/state',{method:'PUT',body:JSON.stringify({state:snapshot,revision})});
        if(token!==generation)return;
        setBase({state:snapshot,revision:result.revision,updatedAt:null});failures=0;
        if(JSON.stringify(storageService.getSnapshot(current.displayName))===serialized){localStorage.removeItem(key(current.id,'dirty'));status('synced');}
        else{status('pending');schedule();}
        return;
      }catch(error){
        if(token!==generation)return;
        if(!(error instanceof FuelApiError)||error.status!==409)throw error;
        const remote=await fuelApi<AccountState>('/me/state');
        if(token!==generation||!reconcile(remote))return;
        if(!dirty())return;
      }
    }
    status('pending','Outro aparelho está salvando alterações. Nova tentativa em instantes.');schedule(2000);
  }catch(error){if(token!==generation)return;status('error',(error as Error).message);schedule(Math.min(60000,5000*2**failures++));}
  finally{if(token===generation)inFlight=false;}
}
async function pull(){
  if(!account||!initialized||blocked||inFlight)return;
  if(dirty()){await flush();return;}
  const token=generation;inFlight=true;
  try{
    const remote=await fuelApi<AccountState>('/me/state');if(token!==generation)return;
    if(dirty()){reconcile(remote);if(!blocked)schedule();return;}
    if(remote.revision!==revision){setBase(remote);storageService.replaceSnapshot(base!);changed();}
    status('synced');failures=0;
  }catch(error){if(token===generation)status('error','Não foi possível conferir atualizações. A cópia deste aparelho está preservada.');}
  finally{if(token===generation)inFlight=false;}
}
function resume(){if(!document.hidden)void cloudState.retry();}
function background(){if(!poll)poll=setInterval(()=>{if(!document.hidden)void cloudState.retry();},15000);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);}
export const cloudState={
  stop(){stop();notify=null;},
  async connect(user:FuelUser|null,onStatus:Notify){
    const previousFailures=account?.id===user?.id?failures:0;stop();failures=previousFailures;notify=onStatus;storageService.setScope(user?.id||null);
    if(!user){status('guest');return;}
    account=user;const token=generation;status('loading');
    try{base=JSON.parse(localStorage.getItem(key(user.id,'base'))||'null');}catch{base=null;}
    try{
      const remote=await fuelApi<AccountState>('/me/state');if(token!==generation)return;
      if(dirty()){if(reconcile(remote))schedule();}
      else{setBase(remote);storageService.replaceSnapshot(base!);status('synced');}
      watch();background();
    }catch{
      if(token!==generation)return;
      // A known account can keep using its cache; first sign-in still needs a server read.
      const known=!!base||Number(localStorage.getItem(key(user.id,'revision')))>0;
      if(known){watch();status('offline','Sem conexão. Alterações ficam neste aparelho e serão sincronizadas quando a conexão voltar.');}
      else status('error','Não foi possível carregar os dados da conta. Confira a conexão e tente novamente.');
      background();schedule(Math.min(60000,5000*2**failures++));
    }
  },
  async resolveConflict(preference:'server'|'device'){
    if(!account||!blocked||inFlight)return;
    const token=generation;inFlight=true;backup();
    try{const remote=await fuelApi<AccountState>('/me/state');if(token!==generation)return;if(reconcile(remote,preference)){watch();background();}}
    catch(error){if(token===generation)status('conflict',(error as Error).message);}
    finally{if(token===generation)inFlight=false;}
    if(token===generation&&!blocked)await flush();
  },
  async retry(){if(!account||blocked||inFlight)return;if(!initialized){const current=account,onStatus=notify;if(onStatus)await this.connect(current,onStatus);return;}if(dirty())await flush();else await pull();},
  async syncNow(){await this.retry();}
};
