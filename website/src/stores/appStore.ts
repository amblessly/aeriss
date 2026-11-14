import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UAVTelemetry, CommLinks, SurvivorDetection, Mission } from '../types';

export interface Settings {
  comm: {
    wifiSSID: string;
    wifiBandwidth: number;
    loraFrequency: number;
    loraSpreadingFactor: number;
    videoBitrate: number;
    autoReconnect: boolean;
  };
  mission: {
    autoAcknowledge: boolean;
    minConfidence: number;
    detectionCooldown: number;
    homeLat: number;
    homeLng: number;
    geofenceRadius: number;
  };
  alerts: {
    lowBatteryThreshold: number;
    lowSignalThreshold: number;
    maxAltitude: number;
    soundAlerts: boolean;
    popupsEnabled: boolean;
  };
}

export interface SystemState {
  timestamp?: number;
  device?: any;
  network?: any;
  wifi?: any;
  sensor?: any;
  thermal?: any;
  detection?: any;
  lora?: any;
  recent_detections?: any[];
}

interface AppState {
  activeTab: 'dashboard' | 'livefeed' | 'detections' | 'map' | 'settings';
  sidebarOpen: boolean;
  modalOpen: boolean;
  alertAcknowledged: boolean;
  missionTimeSeconds: number;

  wsConnected: boolean;
  system: SystemState | null;

  uav: UAVTelemetry;
  survivor: { lat: number | null; lng: number | null };
  home: { lat: number; lng: number };

  link: CommLinks;

  detections: SurvivorDetection[];
  mission: Mission;

  environment: {
    temperature: number | null;
    condition: string;
  };

  settings: Settings;
  updateSettings: (section: keyof Settings, data: Partial<Settings[keyof Settings]>) => void;
  resetSettings: () => void;

  endMission: () => void;
  startMission: (name: string) => void;
  updateEnvironment: (data: Partial<{ temperature: number | null; condition: string }>) => void;

  setActiveTab: (tab: AppState['activeTab']) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setModalOpen: (open: boolean) => void;
  acknowledgeAlert: () => void;
  incrementMissionTime: () => void;
  updateUAV: (data: Partial<UAVTelemetry>) => void;
  updateLink: (type: 'wifi' | 'lora', data: Partial<CommLinks['wifi']>) => void;
  addDetection: (detection: SurvivorDetection) => void;
  upsertDetection: (detection: SurvivorDetection) => void;
  setWsConnected: (connected: boolean) => void;
  setSystemState: (state: SystemState | null) => void;
}

const defaultSettings: Settings = {
  comm: {
    wifiSSID: 'AERIS-AP',
    wifiBandwidth: 20,
    loraFrequency: 433,
    loraSpreadingFactor: 7,
    videoBitrate: 0,
    autoReconnect: true,
  },
  mission: {
    autoAcknowledge: false,
    minConfidence: 50,
    detectionCooldown: 10,
    homeLat: 0,
    homeLng: 0,
    geofenceRadius: 500,
  },
  alerts: {
    lowBatteryThreshold: 30,
    lowSignalThreshold: -120,
    maxAltitude: 150,
    soundAlerts: true,
    popupsEnabled: true,
  },
};

function mapSystemToDetections(system: SystemState | null): SurvivorDetection[] {
  const events = system?.recent_detections || [];
  const mapped: SurvivorDetection[] = [];
  for (const ev of events) {
    if (!ev?.person_detected) continue;
    const ts = typeof ev.ts === 'number' ? new Date(ev.ts * 1000).toLocaleString() : String(ev.ts || '');
    mapped.push({
      id: String(ev.id ?? `DET-${ts}`),
      timestamp: ts,
      confidence: Math.round(Number(ev.confidence ?? 0) * 1000) / 10,
      lat: null,
      lng: null,
      altitude: null,
      distance: null,
      status: 'new',
      detection_type: ev.detection_type,
      thermal: {
        min_c: ev.min_c,
        max_c: ev.max_c,
        avg_c: ev.avg_c,
      },
      source: 'mlx90640',
    });
  }
  return mapped;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeTab: 'dashboard',
      sidebarOpen: false,
      modalOpen: false,
      alertAcknowledged: false,
      missionTimeSeconds: 0,

      wsConnected: false,
      system: null,

      uav: {
        altitude: null,
        speed: null,
        heading: null,
        battery: null,
        lat: null,
        lng: null,
      },
      survivor: {
        lat: null,
        lng: null,
      },
      home: {
        lat: 0,
        lng: 0,
      },

      link: {
        wifi: { latency: null, rssi: null, bitrate: null },
        lora: { latency: null, rssi: null, plr: null },
      },

      detections: [],

      mission: {
        id: 'local-mission',
        name: 'AERIS Local Monitoring',
        startedAt: '',
        status: 'active',
      },

      environment: {
        temperature: null,
        condition: 'Unavailable',
      },

      settings: defaultSettings,

      updateSettings: (section, data) =>
        set((s) => ({
          settings: {
            ...s.settings,
            [section]: { ...s.settings[section], ...data },
          },
        })),

      resetSettings: () => set({ settings: defaultSettings }),

      endMission: () => {
        const now = new Date();
        const endedAt = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        set((s) => ({
          mission: {
            ...s.mission,
            status: 'ended' as const,
            endedAt,
          },
        }));
      },

      startMission: (name: string) => {
        const now = new Date();
        const startedAt = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        set({
          mission: {
            id: `mission-${Date.now()}`,
            name,
            startedAt,
            status: 'active' as const,
          },
        });
      },

      setActiveTab: (tab) => set({ activeTab: tab, sidebarOpen: false }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setModalOpen: (open) => set({ modalOpen: open }),
      acknowledgeAlert: () => {
        set((s) => ({
          alertAcknowledged: true,
          detections: s.detections.map((d) =>
            d.status === 'new' ? { ...d, status: 'acknowledged' as const } : d
          ),
        }));
        setTimeout(() => {
          set({ modalOpen: false });
        }, 300);
      },
      incrementMissionTime: () => set((s) => ({ missionTimeSeconds: s.missionTimeSeconds + 1 })),

      updateUAV: (data) => set((s) => ({ uav: { ...s.uav, ...data } })),
      updateLink: (type, data) =>
        set((s) => ({ link: { ...s.link, [type]: { ...s.link[type], ...data } } })),
      addDetection: (detection) => set((s) => ({ detections: [detection, ...s.detections] })),
      upsertDetection: (detection) => set((s) => {
        const idx = s.detections.findIndex((d) => d.id === detection.id);
        if (idx >= 0) {
          const next = [...s.detections];
          next[idx] = { ...next[idx], ...detection };
          return { detections: next };
        }
        return { detections: [detection, ...s.detections].slice(0, 100) };
      }),
      updateEnvironment: (data) => set((s) => ({ environment: { ...s.environment, ...data } })),
      setWsConnected: (connected) => set({ wsConnected: connected }),
      setSystemState: (system) => set((s) => {
        const detections = mapSystemToDetections(system);
        const thermal = system?.thermal;
        const env = {
          temperature: typeof thermal?.avg_c === 'number' ? thermal.avg_c : (thermal?.available ? thermal?.avg_c ?? null : null),
          condition: system?.sensor?.connected ? 'Thermal sensor connected' : 'Sensor unavailable',
        };
        return {
          system,
          detections: detections.length ? detections : s.detections.filter((d) => d.source === 'mlx90640'),
          environment: env,
        };
      }),
    }),
    {
      name: 'aeris-settings-v2',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
