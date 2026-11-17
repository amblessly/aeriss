import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Laptop/user geolocation state. Intentionally separate from the Raspberry Pi's own
// telemetry/GPS data (useAppStore.uav) — the two sources must never overwrite each other.
// Persisted so the marker can be restored after a page refresh. Tracking is NOT
// automatically resumed on refresh unless the user left it enabled AND the browser
// still grants geolocation permission.
export interface LaptopFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
  /** Which real provider produced this fix. */
  source?: 'browser-geolocation' | 'usb-gnss-nmea';
}

interface LaptopLocationState {
  /** Last successfully obtained laptop fix (persisted). */
  lastKnown: LaptopFix | null;
  /** Whether the user wants tracking enabled (persisted). */
  trackingEnabled: boolean;
  setLastKnown: (fix: LaptopFix) => void;
  setTrackingEnabled: (enabled: boolean) => void;
  clearLaptopLocation: () => void;
}

export const useLaptopLocationStore = create<LaptopLocationState>()(
  persist(
    (set) => ({
      lastKnown: null,
      trackingEnabled: false,

      setLastKnown: (fix) => set({ lastKnown: fix }),
      setTrackingEnabled: (enabled) => set({ trackingEnabled: enabled }),
      clearLaptopLocation: () => set({ lastKnown: null, trackingEnabled: false }),
    }),
    {
      name: 'aeris-laptop-location-v1',
      partialize: (s) => ({ lastKnown: s.lastKnown, trackingEnabled: s.trackingEnabled }),
    }
  )
);
