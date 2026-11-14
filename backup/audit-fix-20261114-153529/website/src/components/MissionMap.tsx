import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useAppStore } from '../stores/appStore';

export function MissionMap() {
  const { uav, survivor, home, setModalOpen, alertAcknowledged } = useAppStore();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const uavMarker = useRef<L.Marker | null>(null);
  const survivorMarker = useRef<L.Marker | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!mapRef.current || initialized.current) return;

    const fallbackCenter: [number, number] = [0, 0];
    const center: [number, number] =
      uav.lat != null && uav.lng != null
        ? [uav.lat, uav.lng]
        : home.lat || home.lng
          ? [home.lat, home.lng]
          : fallbackCenter;

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: true }).setView(center, 16);

    // Offline street tiles only (served locally by AERIS backend). No satellite, no online fallback.
    L.tileLayer('/api/map/tiles/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      minZoom: 0,
      maxZoom: 19,
    }).addTo(map);

    const homeIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: '<div class="w-6 h-6 bg-aeris rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-[10px] shadow-md z-10">H</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    if (home.lat || home.lng) {
      L.marker([home.lat, home.lng], { icon: homeIcon }).addTo(map);
    }

    const survivorIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: '<button class="cursor-pointer focus:outline-none rounded-full"><div class="absolute inset-0 rounded-full bg-danger opacity-40 animate-ping"></div><div class="relative w-6 h-6 bg-danger rounded-full border-2 border-white flex items-center justify-center text-white shadow-md"><i class="ph-fill ph-person text-sm"></i></div></button>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    if (survivor.lat != null && survivor.lng != null) {
      survivorMarker.current = L.marker([survivor.lat, survivor.lng], { icon: survivorIcon }).addTo(map);
      survivorMarker.current.on('click', () => setModalOpen(true));
    }

    const uavIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div class="w-6 h-6 bg-white rounded-full border-2 border-aeris flex items-center justify-center text-aeris shadow-md" style="transform: rotate(${uav.heading ?? 0}deg)"><i class="ph-fill ph-navigation-arrow text-sm"></i></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    if (uav.lat != null && uav.lng != null) {
      uavMarker.current = L.marker([uav.lat, uav.lng], { icon: uavIcon }).addTo(map);
    }

    mapInstance.current = map;
    initialized.current = true;

    return () => {
      map.remove();
      mapInstance.current = null;
      initialized.current = false;
    };
  }, []);

  useEffect(() => {
    if (uavMarker.current && uav.lat != null && uav.lng != null) {
      uavMarker.current.setLatLng([uav.lat, uav.lng]);
    }
  }, [uav.lat, uav.lng, uav.heading]);

  useEffect(() => {
    if (survivorMarker.current && alertAcknowledged) {
      const el = survivorMarker.current.getElement();
      const ping = el?.querySelector('.animate-ping');
      if (ping) ping.remove();
    }
  }, [alertAcknowledged]);

  return (
    <div className="lg:col-span-5 panel-card p-0 relative min-h-[300px] lg:min-h-0">
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-slate-200 flex items-center gap-2">
        <h2 className="text-sm font-bold text-slate-800">MISSION MAP</h2>
        <span className="text-[10px] text-slate-500">Offline street map</span>
      </div>

      <div ref={mapRef} className="absolute inset-0 z-0 rounded-xl overflow-hidden bg-slate-100" />

      <div className="hidden sm:flex absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg border border-slate-200 shadow-sm text-[10px] text-slate-600 flex-col gap-2 z-10 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-aeris text-white flex items-center justify-center text-[8px]">H</div>
          Home (Base)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-aeris flex items-center justify-center text-aeris">
            <i className="ph-fill ph-navigation-arrow text-[10px]" />
          </div>
          UAV Position
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-danger flex items-center justify-center text-white">
            <i className="ph-fill ph-person text-[10px]" />
          </div>
          Survivor Detected
        </div>
      </div>
    </div>
  );
}
