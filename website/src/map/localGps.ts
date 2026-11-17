// Local, offline-first positioning source: a USB/serial GNSS receiver (NMEA 0183)
// attached to the AERIS Raspberry Pi, exposed by the backend at /api/location/local.
// No internet, IP geolocation, or cloud location API is involved.
//
// Honesty rules enforced by the UI:
//   - coordinates are used as a live fix only when the backend reports `fresh: true`
//   - otherwise the persisted last-known fix is shown in a clearly labeled,
//     non-green style — never as a live position
//   - nothing is ever fabricated or interpolated

export interface LocalGnssFix {
  lat: number;
  lng: number;
  altitude_m: number | null;
  speed_mps: number | null;
  course_deg: number | null;
  hdop: number | null;
  accuracy_m: number | null; // estimate derived from HDOP
  satellites: number | null;
  fix_quality: number | null;
  fix_mode: number | null;
  nmea_utc: number | null; // unix seconds, NMEA UTC time of fix (null if receiver has no date)
  timestamp: number; // unix ms (NMEA UTC when available, else receipt time)
  age_s: number;
  source: 'usb-gnss-nmea';
}

export interface LocalGnssStatus {
  enabled: boolean;
  provider: string;
  port: string | null;
  baud: number;
  available: boolean;       // a receiver port is open and being read
  fix: LocalGnssFix | null; // null until a real valid fix is received
  fresh: boolean;           // fix younger than the freshness window
  age_s: number | null;
  reason: string | null;    // machine-readable when fix is null / stale
  checked_at: number;
}

export async function fetchLocalGnss(signal?: AbortSignal): Promise<LocalGnssStatus> {
  const res = await fetch('/api/location/local', { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`local gnss ${res.status}`);
  return (await res.json()) as LocalGnssStatus;
}
