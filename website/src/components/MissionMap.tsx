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
      html: '<button class="cursor-pointer focus:outline-none rounded-full"><div class="absolute inset-0 rounded-full bg-danger opacity-40 animate-ping"></div><div class="relative w-6 h-6 bg-danger rounded-full border-2 border-white flex items-center justify-center text-white shadow-md"><svg viewBox="0 0 256 256" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M128,136a36,36,0,1,0-36-36A36,36,0,0,0,128,136Zm0,16c-41.4,0-76,20.66-76,52a12,12,0,0,0,12,12H192a12,12,0,0,0,12-12C204,172.66,169.4,152,128,152Z"/></svg></div></button>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    if (survivor.lat != null && survivor.lng != null) {
      survivorMarker.current = L.marker([survivor.lat, survivor.lng], { icon: survivorIcon }).addTo(map);
      survivorMarker.current.on('click', () => setModalOpen(true));
    }

    const uavIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div class="w-6 h-6 bg-white rounded-full border-2 border-aeris flex items-center justify-center text-aeris shadow-md" style="transform: rotate(${uav.heading ?? 0}deg)"><svg viewBox="0 0 256 256" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M230.14,25.86a16,16,0,0,0-16.64-3.95L33.9,94.37A16.08,16.08,0,0,0,35.23,124.7l79.36,26.45,26.45,79.36a16,16,0,0,0,15.14,11,16.23,16.23,0,0,0,3.09-.3,16,16,0,0,0,12.1-11.63L234.09,42.5A16,16,0,0,0,230.14,25.86ZM151.25,215.1,128.11,145.7l63.08-63.08Z"/></svg></div>`,
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
            <svg viewBox="0 0 256 256" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M230.14,25.86a16,16,0,0,0-16.64-3.95L33.9,94.37A16.08,16.08,0,0,0,35.23,124.7l79.36,26.45,26.45,79.36a16,16,0,0,0,15.14,11,16.23,16.23,0,0,0,3.09-.3,16,16,0,0,0,12.1-11.63L234.09,42.5A16,16,0,0,0,230.14,25.86ZM151.25,215.1,128.11,145.7l63.08-63.08Z"/></svg>
          </div>
          UAV Position
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-danger flex items-center justify-center text-white">
            <svg viewBox="0 0 256 256" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M128,136a36,36,0,1,0-36-36A36,36,0,0,0,128,136Zm0,16c-41.4,0-76,20.66-76,52a12,12,0,0,0,12,12H192a12,12,0,0,0,12-12C204,172.66,169.4,152,128,152Z"/></svg>
          </div>
          Survivor Detected
        </div>
      </div>
    </div>
  );
}
