/** Alertas de trânsito enviados pela comunidade, publicados apenas após moderação. */
export const ROAD_ALERT_TYPES = [
  { id: 'pothole', label: 'Buraco na pista', icon: '🕳️' },
  { id: 'broken_vehicle', label: 'Veículo parado / quebrado', icon: '🚗' },
  { id: 'speed_camera', label: 'Radar de velocidade', icon: '📷' },
  { id: 'road_obstruction', label: 'Obstáculo na via', icon: '🚧' },
  { id: 'flooded_road', label: 'Alagamento', icon: '🌊' },
  { id: 'police_presence', label: 'Policiamento', icon: '👮' },
  { id: 'robbery', label: 'Roubo ou assalto', icon: '🦹' }
] as const;
export type RoadAlertType = typeof ROAD_ALERT_TYPES[number]['id'];
export type RoadAlertStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export interface RoadAlert {
  id: string;
  kind: RoadAlertType;
  lat: number;
  lng: number;
  note: string;
  createdAt: string;
  expiresAt: string;
  status?: RoadAlertStatus;
  submittedBy?: string;
  reviewedAt?: string | null;
}
export const ROAD_ALERT_TTL_MS: Record<RoadAlertType, number> = {
  pothole: 14 * 86400000,
  broken_vehicle: 2 * 3600000,
  speed_camera: 30 * 86400000,
  road_obstruction: 3 * 3600000,
  flooded_road: 6 * 3600000,
  police_presence: 2 * 3600000,
  robbery: 3 * 3600000
};
