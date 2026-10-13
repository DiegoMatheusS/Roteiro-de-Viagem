export interface SharedRoute {
  title: string; originName: string; destinationName: string; originCoords: [number, number]; destinationCoords: [number, number];
  routePath: [number, number][]; distanceKm: number; durationMinutes: number; protectedOrigin: boolean;
  stops: { name: string; category: string; description: string; coords: [number, number]; type: 'mandatory' | 'suggested'; stayMinutes: number }[];
  routingSource?: 'OSRM'; expiresAt?: string;
}
