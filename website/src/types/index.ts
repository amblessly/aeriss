export interface UAVTelemetry {
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  lat: number | null;
  lng: number | null;
}

export interface LinkHealth {
  latency: number | null;
  rssi: number | null;
  bitrate?: number | null;
  plr?: number | null;
  status?: string;
  detail?: string;
}

export interface CommLinks {
  wifi: LinkHealth;
  lora: LinkHealth;
}

export interface SurvivorDetection {
  id: string;
  timestamp: string;
  confidence: number;
  lat: number | null;
  lng: number | null;
  altitude: number | null;
  distance: number | null;
  status: 'new' | 'acknowledged';
  detection_type?: string;
  thermal?: {
    min_c?: number | null;
    max_c?: number | null;
    avg_c?: number | null;
  };
  source?: string;
  imageUrl?: string;
  thermalImageUrl?: string;
}

export interface Mission {
  id: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'ended' | 'degraded';
}

export interface DetectionPacket {
  timestamp: string;
  confidence: number;
  lat?: number | null;
  lng?: number | null;
  altitude?: number | null;
  distance?: number | null;
  frameNumber?: number;
}
