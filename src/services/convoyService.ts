import type { ConvoySession, MeetingPoint, TripPlan, RouteSharePayload, VehicleType } from '../types';
import { isNativeApp, TravelNative } from './nativeApp';
import { fuelApi } from './fuelApi';
import { storageService } from './storageService';
import { getDeviceId } from './deviceIdentity';
import { FuelApiError } from './fuelApi';
export interface LocationSession { convoyId:string; locationToken:string }
let cache:ConvoySession[]=[],generation=0;
const closed=new Set<string>();
const sessionKey=()=>`rdv_convoy_gps_v1_${storageService.getScope()||'guest'}`;
const revokedKey=()=>sessionKey()+'_revoked';
const emit=()=>window.dispatchEvent(new Event('rdv:convoys-changed'));
const remember=(convoy:ConvoySession)=>{
  const previous=cache.find(c=>c.id===convoy.id);
  if(closed.has(convoy.id))return previous||convoy;
  if(previous&&(previous.revision||0)>(convoy.revision||0))return previous;
  cache=[convoy,...cache.filter(c=>c.id!==convoy.id)];emit();return convoy;
};
const request=async<T,>(path:string,options:RequestInit={})=>{const token=generation;const result=await fuelApi<T>(path,options);if(token!==generation)throw new Error('A conta foi alterada.');return result;};
const localSession=():LocationSession|null=>{try{return JSON.parse(localStorage.getItem(sessionKey())||'null');}catch{return null;}};
const queue=(session:LocationSession)=>{let pending:LocationSession[]=[];try{pending=JSON.parse(localStorage.getItem(revokedKey())||'[]');}catch{}localStorage.setItem(revokedKey(),JSON.stringify([...pending.filter(s=>s.locationToken!==session.locationToken),session].slice(-20)));};
export const convoyService={
  clear(){generation++;cache=[];closed.clear();emit();},
  getConvoys():ConvoySession[]{return cache;},
  getActiveConvoy():ConvoySession|null{return cache.find(c=>c.id===storageService.getActiveConvoyId()&&c.status==='active')||cache.find(c=>c.status==='active')||null;},
  getLocationSession:localSession,
  expireLocations(){let changed=false;cache=cache.map(c=>({...c,participants:c.participants.map(p=>{if(p.coords&&(!p.lastLocationTimestamp||Date.now()-new Date(p.lastLocationTimestamp).getTime()>180000)){changed=true;return {...p,coords:undefined,isStale:true};}return p;})}));if(changed)emit();},
  dropLocationSession(){localStorage.removeItem(sessionKey());emit();},
  setActiveConvoyId(id:string|null){storageService.setActiveConvoyId(id);},
  async refresh(){const r=await request<{convoys:ConvoySession[]}>('/convoys');const previous=cache;cache=r.convoys.filter(c=>!closed.has(c.id)).map(c=>previous.find(p=>p.id===c.id&&(p.revision||0)>(c.revision||0))||c);emit();return cache;},
  async getConvoy(id:string){return remember(await request<ConvoySession>(`/convoys/${id}`));},
  async retryRevocations(){
    const owner=storageService.getScope(),token=generation;let pending:LocationSession[]=[];try{pending=JSON.parse(localStorage.getItem(revokedKey())||'[]');}catch{}
    for(const session of pending){try{await request(`/convoys/${session.convoyId}/location`,{method:'PUT',body:JSON.stringify({enabled:false,locationToken:session.locationToken})});}catch(error){if(!(error instanceof FuelApiError)||![404,409].includes(error.status))continue;}
      if(owner!==storageService.getScope()||token!==generation)return;
      let latest:LocationSession[]=[];try{latest=JSON.parse(localStorage.getItem(revokedKey())||'[]');}catch{}localStorage.setItem(revokedKey(),JSON.stringify(latest.filter(s=>s.locationToken!==session.locationToken)));
    }
  },
  async stopSharing(){const session=localSession();if(!session)return;queue(session);this.dropLocationSession();if(isNativeApp())await TravelNative.setConvoy({convoyId:session.convoyId,enabled:false}).catch(()=>{});await this.retryRevocations();},
  // 1. COMPARTILHAR ROTA (Somente dados públicos do trajeto, sem localização e sem endereço privado)
  generateRouteSharePayload(trip: TripPlan, isPublicOrigin: boolean = true, shareableUrl?: string): RouteSharePayload {
    // Sanitizes residential address if it starts from home (Requirement #1 & #28)
    const sanitizedOrigin = isPublicOrigin ? 'Região de partida' : trip.originName;

    const payload: RouteSharePayload = {
      shareId: `share-${trip.id}-${Date.now().toString(36)}`,
      tripTitle: trip.title,
      originName: sanitizedOrigin,
      destinationName: trip.destinationName,
      distanceKm: trip.distanceKm,
      durationMinutes: trip.durationMinutes,
      modality: trip.modality,
      stops: trip.stops.map(s => ({
        name: s.name,
        category: s.category,
        description: s.description,
        type: s.type,
        stayMinutes: s.recommendedMinutes
      })),
      scenicHighlights: trip.stops.map(s => s.name),
      createdAt: new Date().toISOString(),
      shareableUrl: shareableUrl || `${window.location.origin}/#roteiro=${trip.id}`
    };

    return payload;
  },

  getWhatsAppShareUrl(payload: RouteSharePayload): string {
    const hours = Math.floor(payload.durationMinutes / 60);
    const mins = payload.durationMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

    const text = `🗺️ *Roteiro de Viagem:* ${payload.tripTitle}\n\n` +
      `📍 *De:* ${payload.originName} ➡️ *Para:* ${payload.destinationName}\n` +
      `📏 *Distância:* ${payload.distanceKm} km · *Tempo:* ${timeStr}\n` +
      `📍 *Paradas do percurso:*\n${payload.stops.map((s, i) => `${i + 1}. ${s.name}${s.type === 'mandatory' ? ' (obrigatória)' : ''} · ${s.stayMinutes || 0} min`).join('\n')}\n\n` +
      `📲 Acesse o roteiro completo aqui: ${payload.shareableUrl}\n` +
      `_O melhor da viagem também está no caminho._`;

    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  },


  async createConvoy(params: { title: string; trip: TripPlan; organizerUser: { id: string; name: string; vehicleType: VehicleType; vehicleNickname?: string }; meetingPoints: MeetingPoint[]; notes?: string }): Promise<ConvoySession> {
    const convoy = remember(await request<ConvoySession>('/convoys', { method: 'POST', body: JSON.stringify(params) }));
    this.setActiveConvoyId(convoy.id); return convoy;
  },
  async joinConvoyByCode(code: string, account: { id: string; name: string; vehicleType: VehicleType; vehicleNickname?: string }) {
    const convoy = remember(await request<ConvoySession>('/convoys/join', { method: 'POST', body: JSON.stringify({ code, ...account }) }));
    this.setActiveConvoyId(convoy.id); return { success: true, convoy, message: 'Você entrou no comboio.' };
  },
  async toggleParticipantLocation(convoyId:string,_participantId:string,enable:boolean){
    if(!enable){await this.stopSharing();return this.getConvoy(convoyId);}
    await this.stopSharing();
    const convoy=remember(await request<ConvoySession>(`/convoys/${convoyId}/location`,{method:'PUT',body:JSON.stringify({enabled:true,deviceId:getDeviceId()})}));
    if(!convoy.ownLocationToken)throw new Error('O servidor precisa ser atualizado para sincronizar o GPS deste aparelho.');
    localStorage.setItem(sessionKey(),JSON.stringify({convoyId,locationToken:convoy.ownLocationToken}));emit();
    if(isNativeApp())try{await TravelNative.setConvoy({convoyId,enabled:true,locationToken:convoy.ownLocationToken});}catch(error){await this.stopSharing();throw error;}
    return convoy;
  },
  async updateParticipantLocation(convoyId:string,_participantId:string,coords:[number,number],timestamp:number,accuracyMeters:number){
    const session=localSession();if(session?.convoyId!==convoyId)throw new Error('Ative o compartilhamento neste aparelho.');
    return remember(await request<ConvoySession>(`/convoys/${convoyId}/location`,{method:'PUT',body:JSON.stringify({enabled:true,coords,timestamp:new Date(timestamp).toISOString(),accuracyMeters,locationToken:session.locationToken})}));
  },
  async checkInMeetingPoint(convoyId:string,meetingPointId:string,participantId:string){
    const point=cache.find(c=>c.id===convoyId)?.meetingPoints.find(p=>p.id===meetingPointId);
    return remember(await request<ConvoySession>(`/convoys/${convoyId}/check-in`,{method:'POST',body:JSON.stringify({meetingPointId,arrived:!point?.confirmedArrivedParticipantIds.includes(participantId)})}));
  },
  async updateRoute(convoyId:string,trip:TripPlan,routeRevision:number){return remember(await request<ConvoySession>(`/convoys/${convoyId}/route`,{method:'PATCH',body:JSON.stringify({trip,routeRevision})}));},
  async removeMeetingPoint(convoyId:string,pointId:string,routeRevision:number){return remember(await request<ConvoySession>(`/convoys/${convoyId}/meeting-points/${pointId}`,{method:'DELETE',body:JSON.stringify({routeRevision})}));},
  async addMeetingPoint(convoyId: string, point: Omit<MeetingPoint, 'id' | 'confirmedArrivedParticipantIds'>) {
    return remember(await request<ConvoySession>(`/convoys/${convoyId}/meeting-points`, { method: 'POST', body: JSON.stringify(point) }));
  },
  async leaveConvoy(convoyId: string, _participantId: string) {
    if(localSession()?.convoyId===convoyId)await this.stopSharing();
    await request(`/convoys/${convoyId}/leave`, { method: 'POST' }); closed.add(convoyId); cache = cache.filter(c => c.id !== convoyId); this.setActiveConvoyId(null);emit(); return true;
  },
  async endConvoy(convoyId: string, _actorId: string) {
    if(localSession()?.convoyId===convoyId)await this.stopSharing();
    await request(`/convoys/${convoyId}/end`, { method: 'POST' }); closed.add(convoyId); cache = cache.filter(c => c.id !== convoyId); this.setActiveConvoyId(null);emit(); return true;
  }
};
