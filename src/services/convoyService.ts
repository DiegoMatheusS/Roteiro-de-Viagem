import { 
  ConvoySession, 
  ConvoyParticipant, 
  MeetingPoint, 
  RouteSharePayload, 
  TripPlan, 
  VehicleType 
} from '../types';

const STORAGE_KEYS = {
  CONVOYS: 'rdv_convoys_v1',
  ACTIVE_CONVOY_ID: 'rdv_active_convoy_id_v1'
};

// Seed an initial active convoy for testing (Requirement #10: Test scenarios)
const SEED_CONVOYS: ConvoySession[] = [
  {
    id: 'conv-mantiqueira-1',
    code: 'SERRA-500',
    title: 'Comboio Serra da Mantiqueira & Curvas',
    organizerId: 'user-pilot-1', // current user is organizer
    tripTitle: 'Passeio Serra da Mantiqueira',
    originName: 'São Paulo - SP',
    destinationName: 'Campos do Jordão - SP',
    routePath: [
      [-23.5505, -46.6333],
      [-23.2237, -45.9009],
      [-22.9511, -45.4523],
      [-22.7562, -45.5781],
      [-22.7394, -45.5914]
    ],
    meetingPoints: [
      {
        id: 'mp-1',
        title: 'Posto Graal 125 (Rod. Ayrton Senna)',
        category: 'posto',
        coords: [-23.2237, -45.9009],
        description: 'Primeiro abastecimento e café da manhã do grupo (08:30)',
        order: 1,
        confirmedArrivedParticipantIds: ['p-part-2', 'p-part-3'] // Lucas and Juliana already arrived
      },
      {
        id: 'mp-2',
        title: 'Mirante da Vista Chinesa',
        category: 'mirante',
        coords: [-22.7562, -45.5781],
        description: 'Reagrupamento antes da descida para a Vila Capivari',
        order: 2,
        confirmedArrivedParticipantIds: []
      }
    ],
    participants: [
      {
        id: 'user-pilot-1',
        name: 'Diego Mendes',
        vehicleType: 'motorcycle',
        vehicleNickname: 'Bicuda 500X',
        isOrganizer: true,
        isSharingLocation: false, // Default false per specification!
        joinedAt: '2026-10-13T08:00:00Z'
      },
      {
        id: 'p-part-2',
        name: 'Lucas Rossi',
        vehicleType: 'motorcycle',
        vehicleNickname: 'Yamaha MT-07',
        isOrganizer: false,
        isSharingLocation: true, // Authorized
        coords: [-23.2240, -45.9015],
        lastLocationTimestamp: '08:42 (há 1 min)',
        isStale: false,
        distanceToMeetingPointKm: 0.1,
        joinedAt: '2026-10-13T08:05:00Z'
      },
      {
        id: 'p-part-3',
        name: 'Juliana Costa',
        vehicleType: 'car',
        vehicleNickname: 'Polo TSI',
        isOrganizer: false,
        isSharingLocation: true, // Authorized but lost recent signal (stale indicator)
        coords: [-23.3100, -46.0200],
        lastLocationTimestamp: '08:34 (há 9 min)',
        isStale: true, // Outdated GPS signal per requirement #3 & #8
        distanceToMeetingPointKm: 14.2,
        joinedAt: '2026-10-13T08:10:00Z'
      },
      {
        id: 'p-part-4',
        name: 'Carlos Oliveira',
        vehicleType: 'motorcycle',
        vehicleNickname: 'BMW GS 1250',
        isOrganizer: false,
        isSharingLocation: false, // Did not authorize location (appears in list, NOT on map)
        joinedAt: '2026-10-13T08:15:00Z'
      }
    ],
    status: 'active',
    createdAt: '2026-10-13T07:45:00Z',
    updatedAt: '2026-10-13T08:40:00Z',
    notes: 'Manter distância segura nas curvas. Chuva leve prevista na chegada.'
  }
];

export const convoyService = {
  getConvoys(): ConvoySession[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CONVOYS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CONVOYS, JSON.stringify(SEED_CONVOYS));
      return SEED_CONVOYS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return SEED_CONVOYS;
    }
  },

  saveConvoys(convoys: ConvoySession[]) {
    localStorage.setItem(STORAGE_KEYS.CONVOYS, JSON.stringify(convoys));
  },

  getActiveConvoy(): ConvoySession | null {
    const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_CONVOY_ID);
    if (!activeId) return null;
    const convoys = this.getConvoys();
    const match = convoys.find(c => c.id === activeId && c.status === 'active');
    return match || null;
  },

  setActiveConvoyId(id: string | null) {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CONVOY_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVOY_ID);
    }
  },

  // 1. COMPARTILHAR ROTA (Somente dados públicos do trajeto, sem localização e sem endereço privado)
  generateRouteSharePayload(trip: TripPlan, isPublicOrigin: boolean = true): RouteSharePayload {
    // Sanitizes residential address if it starts from home (Requirement #1 & #28)
    const sanitizedOrigin = isPublicOrigin ? trip.originName.split('-')[0].trim() : trip.originName;

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
        description: s.description
      })),
      scenicHighlights: trip.stops.map(s => s.name),
      createdAt: new Date().toISOString(),
      shareableUrl: `${window.location.origin}/#roteiro=${trip.id}`
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
      `✨ *Paradas sugeridas:* ${payload.stops.map(s => s.name).slice(0, 3).join(', ')}\n\n` +
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
    if (!convoy) return null;

    const participant = convoy.participants.find(p => p.id === participantId);
    if (!participant) return null;

    participant.isSharingLocation = enable;
    if (enable && coords) {
      participant.coords = coords;
      participant.lastLocationTimestamp = 'agora';
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

    const currentActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_CONVOY_ID);
    if (!currentActive || currentActive === convoyId) {
      this.setActiveConvoyId(null);
    }
    return true;
  },

  // 8. ENCERRAR COMBOIO (Organizador ou Encerramento Geral)
  endConvoy(convoyId?: string): boolean {
    const convoys = this.getConvoys();
    convoys.forEach(c => {
      if (!convoyId || c.id === convoyId) {
        c.status = 'completed';
        // Immediately terminate all location sharing (Requirement #3)
        c.participants.forEach(p => {
          p.isSharingLocation = false;
          p.coords = undefined;
        });
        c.updatedAt = new Date().toISOString();
      }
    });

    this.saveConvoys(convoys);
    this.setActiveConvoyId(null);
    return true;
  }
};
