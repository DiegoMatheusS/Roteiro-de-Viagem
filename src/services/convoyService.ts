import type { ConvoySession, MeetingPoint, TripPlan, RouteSharePayload, VehicleType } from '../types';
import { isNativeApp, TravelNative } from './nativeApp';
import { fuelApi } from './fuelApi';
import { storageService } from './storageService';
let cache: ConvoySession[] = [];
const remember = (convoy: ConvoySession) => { cache = [convoy, ...cache.filter(c => c.id !== convoy.id)]; return convoy; };
export const convoyService = {
  clear() { cache = []; },
  getConvoys(): ConvoySession[] { return cache; },
  getActiveConvoy(): ConvoySession | null { return cache.find(c => c.id === storageService.getActiveConvoyId() && c.status === 'active') || cache.find(c => c.status === 'active') || null; },
  setActiveConvoyId(id: string | null) { storageService.setActiveConvoyId(id); },
  async refresh() { const r = await fuelApi<{ convoys: ConvoySession[] }>('/convoys'); cache = r.convoys; return cache; },
  async getConvoy(id: string) { return remember(await fuelApi<ConvoySession>(`/convoys/${id}`)); },
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
    const convoy = remember(await fuelApi<ConvoySession>('/convoys', { method: 'POST', body: JSON.stringify(params) }));
    this.setActiveConvoyId(convoy.id); return convoy;
  },
  async joinConvoyByCode(code: string, account: { id: string; name: string; vehicleType: VehicleType; vehicleNickname?: string }) {
    const convoy = remember(await fuelApi<ConvoySession>('/convoys/join', { method: 'POST', body: JSON.stringify({ code, ...account }) }));
    this.setActiveConvoyId(convoy.id); return { success: true, convoy, message: 'Você entrou no comboio.' };
  },
  async toggleParticipantLocation(convoyId: string, _participantId: string, enable: boolean) {
    const convoy = remember(await fuelApi<ConvoySession>(`/convoys/${convoyId}/location`, { method: 'PUT', body: JSON.stringify({ enabled: enable }) }));
    if (isNativeApp()) { try { await TravelNative.setConvoy({ convoyId, enabled: enable }); } catch (error) { await fuelApi(`/convoys/${convoyId}/location`, { method: 'PUT', body: JSON.stringify({ enabled: false }) }); throw error; } }
    return convoy;
  },
  async updateParticipantLocation(convoyId: string, _participantId: string, coords: [number, number], timestamp: number, accuracyMeters: number) {
    return remember(await fuelApi<ConvoySession>(`/convoys/${convoyId}/location`, { method: 'PUT', body: JSON.stringify({ enabled: true, coords, timestamp: new Date(timestamp).toISOString(), accuracyMeters }) }));
  },
  async checkInMeetingPoint(convoyId: string, meetingPointId: string, _participantId: string) {
    return remember(await fuelApi<ConvoySession>(`/convoys/${convoyId}/check-in`, { method: 'POST', body: JSON.stringify({ meetingPointId }) }));
  },
  async addMeetingPoint(convoyId: string, point: Omit<MeetingPoint, 'id' | 'confirmedArrivedParticipantIds'>) {
    return remember(await fuelApi<ConvoySession>(`/convoys/${convoyId}/meeting-points`, { method: 'POST', body: JSON.stringify(point) }));
  },
  async leaveConvoy(convoyId: string, _participantId: string) {
    if (isNativeApp()) await TravelNative.setConvoy({ convoyId, enabled: false });
    await fuelApi(`/convoys/${convoyId}/leave`, { method: 'POST' }); cache = cache.filter(c => c.id !== convoyId); this.setActiveConvoyId(null); return true;
  },
  async endConvoy(convoyId: string, _actorId: string) {
    if (isNativeApp()) await TravelNative.setConvoy({ convoyId, enabled: false });
    await fuelApi(`/convoys/${convoyId}/end`, { method: 'POST' }); cache = cache.filter(c => c.id !== convoyId); this.setActiveConvoyId(null); return true;
  }
};
