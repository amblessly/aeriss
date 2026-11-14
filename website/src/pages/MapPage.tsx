import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

// Local/vendor marker icon assets (served by AERIS, no CDN)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

type LocationStatus =
  | 'Waiting for Permission'
  | 'Requesting Location'
  | 'Active'
  | 'Permission Denied'
  | 'Location Unavailable'
  | 'GPS Signal Unavailable';

type MapStatus = 'Offline Map Ready' | 'Loading Local Map' | 'Outside Available Map Coverage' | 'Map Data Missing';

interface MapInfo {
  ready: boolean;
  format: string;
  tile_url: string;
  attribution: string;
  min_zoom: number;
  max_zoom: number;
  default_zoom: number;
  default_center: { lat: number; lng: number; zoom?: number };
  bounds: number[] | null; // [w,s,e,n]
  name?: string | null;
  offline_only: boolean;
  satellite_available: boolean;
}

interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

// Ensure default Leaflet marker assets resolve locally when used
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function fmtCoord(v: number | null | undefined, pos: string, neg: string) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'N/A';
  const hemi = v >= 0 ? pos : neg;
  return `${Math.abs(v).toFixed(6)}° ${hemi}`;
}

function fmtTime(ts: number | null) {
  if (!ts) return 'N/A';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return 'N/A';
  }
}

function inBounds(lat: number, lng: number, bounds: number[] | null) {
  if (!bounds || bounds.length !== 4) return null; // unknown
  const [w, s, e, n] = bounds;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

export function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const headingRef = useRef<L.Polygon | null>(null);
  const watchId = useRef<number | null>(null);
  const orientationHandler = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const firstFixCentered = useRef(false);
  const tileErrorCount = useRef(0);
  const tileOkCount = useRef(0);

  const [mapInfo, setMapInfo] = useState<MapInfo | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>('Loading Local Map');
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('Waiting for Permission');
  const [tracking, setTracking] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [headingSource, setHeadingSource] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<string>('unknown');

  const secure = typeof window !== 'undefined' ? window.isSecureContext : false;
  const geoSupported = typeof navigator !== 'undefined' && !!navigator.geolocation;

  // Fetch local map info/status
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/map/status', { cache: 'no-store' });
        if (!res.ok) throw new Error('status');
        const data = (await res.json()) as MapInfo;
        if (cancelled) return;
        setMapInfo(data);
        setMapStatus(data.ready ? 'Loading Local Map' : 'Map Data Missing');
      } catch {
        if (!cancelled) {
          setMapInfo(null);
          setMapStatus('Map Data Missing');
        }
      }
    };
    load();
    const t = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // Query permission state when available (no prompt)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perms: any = (navigator as any).permissions;
        if (perms?.query) {
          const st = await perms.query({ name: 'geolocation' as PermissionName });
          if (cancelled) return;
          setPermissionState(st.state);
          st.onchange = () => setPermissionState(st.state);
          if (st.state === 'denied') setLocationStatus('Permission Denied');
        }
      } catch {
        // Permissions API not available; rely on geolocation callbacks
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize Leaflet map with local tiles only
  useEffect(() => {
    if (!mapRef.current || mapInstance.current || !mapInfo) return;

    const centerLat = Number.isFinite(mapInfo.default_center?.lat) ? mapInfo.default_center.lat : 0;
    const centerLng = Number.isFinite(mapInfo.default_center?.lng) ? mapInfo.default_center.lng : 0;
    const zoom = Number.isFinite(mapInfo.default_center?.zoom) ? (mapInfo.default_center.zoom as number) : mapInfo.default_zoom || 16;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
      minZoom: mapInfo.min_zoom ?? 0,
      maxZoom: mapInfo.max_zoom ?? 19,
    }).setView([centerLat, centerLng], zoom);

    const tileUrl = mapInfo.tile_url || '/api/map/tiles/{z}/{x}/{y}.png';
    const layer = L.tileLayer(tileUrl, {
      attribution: mapInfo.attribution || '&copy; OpenStreetMap contributors',
      minZoom: mapInfo.min_zoom ?? 0,
      maxZoom: mapInfo.max_zoom ?? 19,
      crossOrigin: true,
      errorTileUrl: '',
    });

    layer.on('loading', () => {
      setMapStatus((prev) => (prev === 'Map Data Missing' ? prev : prev === 'Outside Available Map Coverage' && tileOkCount.current > 0 ? prev : 'Loading Local Map'));
    });
    layer.on('load', () => {
      if (!mapInfo.ready) {
        setMapStatus('Map Data Missing');
      } else if (tileErrorCount.current > 0 && tileOkCount.current === 0) {
        setMapStatus('Outside Available Map Coverage');
      } else {
        setMapStatus('Offline Map Ready');
      }
    });
    layer.on('tileerror', () => {
      tileErrorCount.current += 1;
      if (!mapInfo.ready) {
        setMapStatus('Map Data Missing');
      } else if (fix) {
        const inside = inBounds(fix.lat, fix.lng, mapInfo.bounds);
        if (inside === false) setMapStatus('Outside Available Map Coverage');
      } else if (tileOkCount.current === 0 && tileErrorCount.current >= 4) {
        setMapStatus('Outside Available Map Coverage');
      }
    });
    layer.on('tileload', () => {
      tileOkCount.current += 1;
      if (mapInfo.ready) setMapStatus('Offline Map Ready');
    });

    layer.addTo(map);
    tileLayer.current = layer;
    mapInstance.current = map;

    // controls placed in UI; keep Leaflet zoom but we also add custom buttons
    map.zoomControl.setPosition('bottomright');

    return () => {
      map.remove();
      mapInstance.current = null;
      tileLayer.current = null;
      markerRef.current = null;
      accuracyRef.current = null;
      headingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInfo]);

  const effectiveHeading = useMemo(() => {
    if (typeof deviceHeading === 'number' && Number.isFinite(deviceHeading)) {
      return { value: deviceHeading, source: headingSource || 'Device orientation' };
    }
    // GPS course over ground only when moving (not reliable when stationary)
    if (fix && typeof fix.heading === 'number' && Number.isFinite(fix.heading) && typeof fix.speed === 'number' && fix.speed > 0.5) {
      return { value: fix.heading, source: 'GPS course over ground' };
    }
    return { value: null as number | null, source: null as string | null };
  }, [deviceHeading, headingSource, fix]);

  const updateBlueDot = useCallback((next: Fix) => {
    const map = mapInstance.current;
    if (!map) return;
    const latlng: [number, number] = [next.lat, next.lng];
    const acc = typeof next.accuracy === 'number' && Number.isFinite(next.accuracy) ? Math.max(next.accuracy, 0) : null;

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: 'aeris-blue-dot-icon',
        html: '<div class="aeris-blue-dot"><div class="aeris-blue-dot-core"></div></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      markerRef.current = L.marker(latlng, { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
    }

    if (acc != null) {
      if (!accuracyRef.current) {
        accuracyRef.current = L.circle(latlng, {
          radius: acc,
          color: '#2563eb',
          weight: 1,
          opacity: 0.35,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          interactive: false,
        }).addTo(map);
      } else {
        accuracyRef.current.setLatLng(latlng);
        accuracyRef.current.setRadius(acc);
      }
    } else if (accuracyRef.current) {
      map.removeLayer(accuracyRef.current);
      accuracyRef.current = null;
    }

    // Heading cone
    const h = effectiveHeading.value;
    if (h != null && Number.isFinite(h)) {
      const len = Math.max(acc || 30, 30); // meters (visual)
      const spread = 25; // degrees
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dest = (bearing: number, dist: number): [number, number] => {
        const R = 6378137;
        const br = toRad(bearing);
        const lat1 = toRad(next.lat);
        const lon1 = toRad(next.lng);
        const ang = dist / R;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br));
        const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(ang) * Math.cos(lat1), Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2));
        return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
      };
      const p1 = dest(h - spread, len * 1.6);
      const p2 = dest(h + spread, len * 1.6);
      const pts: [number, number][] = [latlng, p1, p2];
      if (!headingRef.current) {
        headingRef.current = L.polygon(pts, {
          color: '#2563eb',
          weight: 1,
          opacity: 0.25,
          fillColor: '#3b82f6',
          fillOpacity: 0.18,
          interactive: false,
        }).addTo(map);
      } else {
        headingRef.current.setLatLngs(pts);
      }
    } else if (headingRef.current) {
      map.removeLayer(headingRef.current);
      headingRef.current = null;
    }
  }, [effectiveHeading.value]);

  // Update dot when heading changes
  useEffect(() => {
    if (fix) updateBlueDot(fix);
  }, [fix, effectiveHeading.value, updateBlueDot]);

  // Coverage status relative to current fix
  useEffect(() => {
    if (!mapInfo || !fix) return;
    const inside = inBounds(fix.lat, fix.lng, mapInfo.bounds);
    if (!mapInfo.ready) setMapStatus('Map Data Missing');
    else if (inside === false) setMapStatus('Outside Available Map Coverage');
  }, [fix, mapInfo]);

  const stopTracking = useCallback(() => {
    if (watchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (orientationHandler.current) {
      window.removeEventListener('deviceorientationabsolute' as any, orientationHandler.current as any);
      window.removeEventListener('deviceorientation', orientationHandler.current as any, true);
      orientationHandler.current = null;
    }
    setTracking(false);
    setDeviceHeading(null);
    setHeadingSource(null);
    if (locationStatus === 'Active' || locationStatus === 'Requesting Location') {
      setLocationStatus(permissionState === 'denied' ? 'Permission Denied' : 'Waiting for Permission');
    }
  }, [locationStatus, permissionState]);

  const startTracking = useCallback(async () => {
    setErrorMsg(null);
    if (!secure) {
      setLocationStatus('Location Unavailable');
      setErrorMsg('Browser geolocation requires a secure context (HTTPS). Access the AERIS Dashboard over HTTPS with a trusted local certificate, or another supported secure-context method.');
      return;
    }
    if (!geoSupported) {
      setLocationStatus('Location Unavailable');
      setErrorMsg('Browser geolocation is not supported in this browser/device.');
      return;
    }

    setLocationStatus('Requesting Location');
    setTracking(true);

    // Heading from device orientation when available
    const onOrient = (e: DeviceOrientationEvent) => {
      let heading: number | null = null;
      let src = 'Device orientation';
      const anyE = e as any;
      if (typeof anyE.webkitCompassHeading === 'number' && Number.isFinite(anyE.webkitCompassHeading)) {
        heading = anyE.webkitCompassHeading; // iOS: degrees from north
        src = 'Device compass';
      } else if (e.absolute && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
        heading = (360 - e.alpha) % 360;
        src = 'Device orientation (absolute)';
      } else if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
        // relative; still show but less reliable
        heading = (360 - e.alpha) % 360;
        src = 'Device orientation';
      }
      if (heading != null) {
        setDeviceHeading(heading);
        setHeadingSource(src);
      }
    };
    orientationHandler.current = onOrient;
    try {
      window.addEventListener('deviceorientationabsolute' as any, onOrient as any);
      window.addEventListener('deviceorientation', onOrient as any, true);
    } catch {
      // ignore
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next: Fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
          heading: typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: typeof pos.coords.speed === 'number' && Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
          timestamp: pos.timestamp || Date.now(),
        };
        setFix(next);
        setLocationStatus('Active');
        setErrorMsg(null);
        // smooth recenter on first fix
        if (!firstFixCentered.current && mapInstance.current) {
          mapInstance.current.setView([next.lat, next.lng], Math.max(mapInstance.current.getZoom(), 16), { animate: true });
          firstFixCentered.current = true;
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus('Permission Denied');
          setErrorMsg('Location permission denied. Enable location access for this site in your browser settings (Allow), then try again.');
          stopTracking();
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationStatus('Location Unavailable');
          setErrorMsg('Location unavailable from the device/location provider. Ensure location services are enabled.');
        } else if (err.code === err.TIMEOUT) {
          setLocationStatus('GPS Signal Unavailable');
          setErrorMsg('Location request timed out. Waiting for a valid GPS/location fix...');
        } else {
          setLocationStatus('Location Unavailable');
          setErrorMsg('Unable to determine location.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      }
    );
  }, [geoSupported, secure, stopTracking, permissionState]);

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => {
      if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
      if (orientationHandler.current) {
        window.removeEventListener('deviceorientationabsolute' as any, orientationHandler.current as any);
        window.removeEventListener('deviceorientation', orientationHandler.current as any, true);
      }
    };
  }, []);

  const centerOnLocation = () => {
    if (fix && mapInstance.current) {
      mapInstance.current.setView([fix.lat, fix.lng], Math.max(mapInstance.current.getZoom(), 17), { animate: true });
    }
  };
  const recenter = () => {
    if (fix && mapInstance.current) {
      mapInstance.current.panTo([fix.lat, fix.lng], { animate: true });
    } else if (mapInstance.current && mapInfo) {
      const c = mapInfo.default_center;
      mapInstance.current.setView([c.lat, c.lng], c.zoom || mapInfo.default_zoom || 16);
    }
  };
  const zoomIn = () => mapInstance.current?.zoomIn();
  const zoomOut = () => mapInstance.current?.zoomOut();

  const locationLabel = useMemo(() => locationStatus, [locationStatus]);
  const canStart = !tracking && (locationStatus !== 'Active');

  return (
    <div className="h-full flex flex-col">
      <div className="panel-card min-h-full flex flex-col">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 uppercase">Live GPS Map</h2>
            <p className="text-xs text-slate-500 mt-1">Offline street map with real-time browser location (no satellite, no online tiles).</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="px-2.5 py-1 rounded border bg-slate-50 border-slate-200 text-slate-700">
              <span className="font-semibold">LOCATION STATUS:</span> {locationLabel}
            </div>
            <div className="px-2.5 py-1 rounded border bg-slate-50 border-slate-200 text-slate-700">
              <span className="font-semibold">MAP STATUS:</span> {mapStatus}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 flex-1 min-h-0">
          <div className="relative rounded-xl overflow-hidden min-h-[420px] border border-slate-200 bg-slate-100">
            <div ref={mapRef} className="absolute inset-0 z-0" />
            {!mapInfo && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-600 bg-slate-100/80">Loading local map configuration...</div>
            )}
            {mapInfo && !mapInfo.ready && (
              <div className="absolute top-3 left-3 right-3 z-[500] bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md px-3 py-2">
                Offline street map data is missing. Add local tiles (XYZ directory or MBTiles) on the Raspberry Pi and reload. GPS coordinates may still be available, but street map details outside preloaded coverage or without local data cannot be shown.
              </div>
            )}
            <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2">
              <button onClick={zoomIn} className="px-2.5 py-1.5 text-xs font-medium bg-white/95 border border-slate-200 rounded shadow-sm hover:bg-slate-50">Zoom In</button>
              <button onClick={zoomOut} className="px-2.5 py-1.5 text-xs font-medium bg-white/95 border border-slate-200 rounded shadow-sm hover:bg-slate-50">Zoom Out</button>
              <button onClick={recenter} className="px-2.5 py-1.5 text-xs font-medium bg-white/95 border border-slate-200 rounded shadow-sm hover:bg-slate-50">Recenter Map</button>
              <button onClick={centerOnLocation} disabled={!fix} className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white border border-blue-700 rounded shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Center on My Location</button>
            </div>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800">Live Location</h3>
                {tracking ? (
                  <button onClick={stopTracking} className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100">Stop Tracking</button>
                ) : (
                  <button onClick={startTracking} disabled={!canStart} className="text-xs px-2 py-1 rounded border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Start / Allow Location</button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-1.5 text-xs text-slate-700">
                <div className="flex justify-between gap-2"><span className="text-slate-500">Latitude</span><span className="font-mono">{fmtCoord(fix?.lat, 'N', 'S')}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Longitude</span><span className="font-mono">{fmtCoord(fix?.lng, 'E', 'W')}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">GPS Accuracy</span><span>{fix?.accuracy != null ? `${Math.round(fix.accuracy)} m` : 'N/A'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Last Update</span><span className="text-right">{fmtTime(fix?.timestamp ?? null)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Heading</span><span>{effectiveHeading.value != null ? `${Math.round(effectiveHeading.value)}°` : 'N/A'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Heading Source</span><span className="text-right">{effectiveHeading.source || 'N/A'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Tracking</span><span>{tracking ? 'Active watch' : 'Stopped'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Permission</span><span className="capitalize">{permissionState}</span></div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Status & Guidance</h3>
              {errorMsg && <div className="text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">{errorMsg}</div>}
              {!secure && (
                <div className="text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                  Secure context required for browser geolocation. Use HTTPS to access this dashboard (local trusted certificate or another supported secure-context method). Ordinary HTTP over LAN IP may not allow geolocation.
                </div>
              )}
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>Location is requested when you start tracking and comes from your device’s actual location provider (not fabricated). Raspberry Pi 4B has no built-in GPS; laptop/browser uses laptop location services.</li>
                <li>To grant persistent access: choose <b>Allow</b> when prompted. To change later, use browser site settings (lock/info icon) → Location → Allow.</li>
                <li>Map uses only locally hosted street tiles served by AERIS. If outside preloaded coverage or tiles are missing, street details may be unavailable; GPS coordinates can still be shown when available.</li>
                <li>Heading cone appears only when valid heading data is available (device orientation/compass or GPS course while moving). Stationary GPS direction is not treated as compass heading.</li>
              </ul>
              <div className="pt-1 border-t border-slate-200">
                <div><span className="font-semibold">Map source:</span> {mapInfo?.ready ? `Offline local tiles (${mapInfo.format})` : 'No local map data loaded'}</div>
                <div><span className="font-semibold">Coverage bounds:</span> {mapInfo?.bounds ? mapInfo.bounds.map((n) => n.toFixed(4)).join(', ') : 'Not specified'}</div>
                <div><span className="font-semibold">Attribution:</span> <span dangerouslySetInnerHTML={{ __html: mapInfo?.attribution || '© OpenStreetMap contributors' }} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .aeris-blue-dot { position: relative; width: 22px; height: 22px; }
        .aeris-blue-dot-core {
          position: absolute; left: 50%; top: 50%; width: 14px; height: 14px;
          transform: translate(-50%, -50%);
          background: #2563eb; border: 2.5px solid #fff; border-radius: 9999px;
          box-shadow: 0 0 0 2px rgba(37,99,235,0.25), 0 1px 4px rgba(0,0,0,0.25);
        }
        .leaflet-container { font-family: inherit; background: #e5e7eb; }
      `}</style>
    </div>
  );
}
