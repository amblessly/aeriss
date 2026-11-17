import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// Maragondon, Cavite, Philippines (operational area)
// Max camera zoom. The HQ operational archive (aeris-hq.pmtiles, Maragondon/Cavite bbox)
// provides genuine tiles through z16; the nationwide fallback archive provides z0–15 only and
// the camera is clamped to the archive's real maxzoom via /api/map/status on both map views.
export const AERIS_DEFAULT_CENTER: [number, number] = [120.7408, 14.3045];
export const AERIS_DEFAULT_ZOOM = 13;
export const AERIS_MIN_ZOOM = 0;
export const AERIS_MAX_ZOOM = 16;

export const AERIS_STYLE_URL = '/api/map/style.json';
export const AERIS_MAP_STATUS_URL = '/api/map/status';

let protocolRegistered = false;

/** Register the pmtiles:// protocol with MapLibre exactly once. */
export function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;
}

export interface MapStatusInfo {
  ready: boolean;
  format: string;
  attribution: string;
  min_zoom: number;
  max_zoom: number;
  default_zoom: number;
  default_center: { lat: number; lng: number; zoom?: number };
  bounds: number[] | null; // [west, south, east, north]
  size_bytes: number | null;
  offline_only: boolean;
  satellite_available: boolean;
}

export async function fetchMapStatus(signal?: AbortSignal): Promise<MapStatusInfo> {
  const res = await fetch(AERIS_MAP_STATUS_URL, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`map status ${res.status}`);
  return (await res.json()) as MapStatusInfo;
}

export function inBounds(lat: number, lng: number, bounds: number[] | null): boolean | null {
  if (!bounds || bounds.length !== 4) return null; // unknown
  const [w, s, e, n] = bounds;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** GeoJSON circle (Polygon, 48 points) around a point. Used for GPS/accuracy ring and cones. */
export function circlePolygonFC(lat: number, lng: number, radiusM: number, steps = 48) {
  const R = 6378137;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(lat);
  const lon1 = toRad(lng);
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const br = (i * 2 * Math.PI) / steps;
    const ang = radiusM / R;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br));
    const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(ang) * Math.cos(lat1), Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2));
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [coords] } }],
  };
}

export { maplibregl };
