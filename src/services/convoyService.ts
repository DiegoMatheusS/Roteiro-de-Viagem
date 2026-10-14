import { 
  ConvoySession, 
  ConvoyParticipant, 
  MeetingPoint, 
  RouteSharePayload, 
  TripPlan, 
  VehicleType 
} from '../types';
import { storageService } from './storageService';

export const convoyService = {
  getConvoys(): ConvoySession[] { return storageService.getConvoys(); },
  saveConvoys(convoys: ConvoySession[]) { storageService.saveConvoys(convoys); },
  getActiveConvoy(): ConvoySession | null {
    const id = storageService.getActiveConvoyId();
    return id ? this.getConvoys().find(convoy => convoy.id === id && convoy.status === 'active') || null : null;
  },
  setActiveConvoyId(id: string | null) { storageService.setActiveConvoyId(id); },

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

  // 2. CRIAR COMBOIO DE VIAGEM
  createConvoy(params: {
    title: string;
    trip: TripPlan;
    organizerUser: { id: string; name: string; vehicleType: VehicleType; vehicleNickname?: string };
    meetingPoints: MeetingPoint[];
    notes?: string;
  }): ConvoySession {
    const convoys = this.getConvoys();
    const randomCode = `ROTA-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    const newConvoy: ConvoySession = {
      id: `convoy-${Date.now()}`,
      code: randomCode,
      title: params.title.trim() || `Comboio para ${params.trip.destinationName}`,
      organizerId: params.organizerUser.id,
      tripId: params.trip.id,
      tripTitle: params.trip.title,
      originName: params.trip.originName,
      destinationName: params.trip.destinationName,
      routePath: params.trip.routePath,
      meetingPoints: params.meetingPoints,
      participants: [
        {
          id: params.organizerUser.id,
          name: params.organizerUser.name,
          vehicleType: params.organizerUser.vehicleType,
          vehicleNickname: params.organizerUser.vehicleNickname,
          isOrganizer: true,
          isSharingLocation: false, // Default FALSE per specification!
          joinedAt: now
        }
      ],
      status: 'active',
      createdAt: now,
      updatedAt: now,
      notes: params.notes
    };

    convoys.unshift(newConvoy);
    this.saveConvoys(convoys);
    this.setActiveConvoyId(newConvoy.id);
    return newConvoy;
  },

  // 3. ENTRAR NO COMBOIO POR CÓDIGO OU CONVITE
  joinConvoyByCode(
    code: string,
    user: { id: string; name: string; vehicleType: VehicleType; vehicleNickname?: string }
  ): { success: boolean; convoy?: ConvoySession; message: string } {
    const convoys = this.getConvoys();
    const cleanCode = code.trim().toUpperCase();
    const convoy = convoys.find(c => c.code.toUpperCase() === cleanCode && c.status === 'active');

    if (!convoy) {
      return { success: false, message: 'Código de comboio inválido ou comboio já finalizado.' };
    }

    const alreadyJoined = convoy.participants.find(p => p.id === user.id);
    if (!alreadyJoined) {
      convoy.participants.push({
        id: user.id,
        name: user.name,
        vehicleType: user.vehicleType,
        vehicleNickname: user.vehicleNickname,
        isOrganizer: false,
        isSharingLocation: false, // Default FALSE
        joinedAt: new Date().toISOString()
      });
      convoy.updatedAt = new Date().toISOString();
      this.saveConvoys(convoys);
    }

    this.setActiveConvoyId(convoy.id);
    return { success: true, convoy, message: 'Você entrou no comboio com sucesso!' };
  },

  // 4. ATIVAR / DESATIVAR COMPARTILHAMENTO DE LOCALIZAÇÃO DO PARTICIPANTE
  toggleParticipantLocation(
    convoyId: string, 
    participantId: string, 
    enable: boolean, 
    coords?: [number, number]
  ): ConvoySession | null {
    const convoys = this.getConvoys();
    const convoy = convoys.find(c => c.id === convoyId);
    if (!convoy || convoy.status !== 'active') return null;

    const participant = convoy.participants.find(p => p.id === participantId);
    if (!participant) return null;

    participant.isSharingLocation = enable;
    if (enable && coords) {
      participant.coords = coords;
      participant.lastLocationTimestamp = new Date().toISOString();
      participant.isStale = false;
    } else if (!enable) {
      participant.coords = undefined;
      participant.lastLocationTimestamp = undefined;
      participant.isStale = false;
    }

    convoy.updatedAt = new Date().toISOString();
    this.saveConvoys(convoys);
    return convoy;
  },

  updateParticipantLocation(convoyId: string, participantId: string, coords: [number, number]): ConvoySession | null {
    const convoys = this.getConvoys();
    const convoy = convoys.find(c => c.id === convoyId && c.status === 'active');
    const participant = convoy?.participants.find(p => p.id === participantId && p.isSharingLocation);
    if (!convoy || !participant) return null;
    participant.coords = coords;
    participant.lastLocationTimestamp = new Date().toISOString();
    participant.isStale = false;
    convoy.updatedAt = new Date().toISOString();
    this.saveConvoys(convoys);
    return convoy;
  },

  // 5. CONFIRMAR CHEGADA AO PONTO DE ENCONTRO
  checkInMeetingPoint(convoyId: string, meetingPointId: string, participantId: string): ConvoySession | null {
    const convoys = this.getConvoys();
    const convoy = convoys.find(c => c.id === convoyId);
    if (!convoy) return null;

    const mp = convoy.meetingPoints.find(m => m.id === meetingPointId);
    if (!mp) return null;

    if (!mp.confirmedArrivedParticipantIds.includes(participantId)) {
      mp.confirmedArrivedParticipantIds.push(participantId);
    } else {
      // Toggle off if already checked in
      mp.confirmedArrivedParticipantIds = mp.confirmedArrivedParticipantIds.filter(id => id !== participantId);
    }

    convoy.updatedAt = new Date().toISOString();
    this.saveConvoys(convoys);
    return convoy;
  },

  // 6. ADICIONAR PONTO DE ENCONTRO (Organizador)
  addMeetingPoint(convoyId: string, mp: Omit<MeetingPoint, 'id' | 'confirmedArrivedParticipantIds'>): ConvoySession | null {
    const convoys = this.getConvoys();
    const convoy = convoys.find(c => c.id === convoyId);
    if (!convoy) return null;

    const newMp: MeetingPoint = {
      ...mp,
      id: `mp-${Date.now()}`,
      confirmedArrivedParticipantIds: []
    };

    convoy.meetingPoints.push(newMp);
    convoy.updatedAt = new Date().toISOString();
    this.saveConvoys(convoys);
    return convoy;
  },

  // 7. SAIR DO COMBOIO (Participante)
  leaveConvoy(convoyId: string, participantId: string): boolean {
    const convoys = this.getConvoys();
    const convoy = convoys.find(c => c.id === convoyId);
    if (convoy) {
      convoy.participants = convoy.participants.filter(p => p.id !== participantId);
      // Remove from meeting point check-ins
      convoy.meetingPoints.forEach(mp => {
        mp.confirmedArrivedParticipantIds = mp.confirmedArrivedParticipantIds.filter(id => id !== participantId);
      });
      convoy.updatedAt = new Date().toISOString();
      this.saveConvoys(convoys);
    }

    const currentActive = storageService.getActiveConvoyId();
    if (!currentActive || currentActive === convoyId) {
      this.setActiveConvoyId(null);
    }
    return true;
  },

  // 8. ENCERRAR COMBOIO (Organizador ou Encerramento Geral)
  endConvoy(convoyId: string, actorId: string): boolean {
    const convoys = this.getConvoys();
    const target = convoys.find(c => c.id === convoyId);
    if (!target || target.organizerId !== actorId) return false;
    convoys.forEach(c => {
      if (c.id === convoyId) {
        c.status = 'completed';
        // Immediately terminate all location sharing (Requirement #3)
        c.participants.forEach(p => {
          p.isSharingLocation = false;
          p.coords = undefined;
          p.lastLocationTimestamp = undefined;
        });
        c.updatedAt = new Date().toISOString();
      }
    });

    this.saveConvoys(convoys);
    this.setActiveConvoyId(null);
    return true;
  }
};
