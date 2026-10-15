export const ROAD_HAZARD_KINDS = {
  pothole: 'Buraco na pista',
  stopped_vehicle: 'Veículo parado',
  speed_camera: 'Radar informado',
  accident: 'Acidente',
  object: 'Objeto na pista',
  roadworks: 'Obras na pista',
  flooding: 'Alagamento'
} as const;
export type RoadHazardKind = keyof typeof ROAD_HAZARD_KINDS;
export interface RoadHazard {
  id: string;
  kind: RoadHazardKind;
  coords: [number, number];
  reportedAt: string;
  expiresAt: string;
  status: 'published';
  source: 'comunidade';
}
