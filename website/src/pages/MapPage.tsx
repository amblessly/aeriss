import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AERIS_DEFAULT_CENTER,
  AERIS_DEFAULT_ZOOM,
  AERIS_MIN_ZOOM,
  AERIS_MAX_ZOOM,
  AERIS_STYLE_URL,
  ensurePmtilesProtocol,
  fetchMapStatus,
  inBounds,
  maplibregl,
  type MapStatusInfo,
} from '../map/aerisMap';
import type { FeatureCollection, Polygon } from 'geojson';
import { fetchLocalGnss, type LocalGnssStatus } from '../map/localGps';

type LocationStatus =
  | 'Waiting for Permission'
  | 'Requesting Location'
  | 'Active'
  | 'Permission Denied'
  | 'Location Unavailable'
  | 'GPS Signal Unavailable';

type MapStatus = 'Offline Map Ready' | 'Loading Local Map' | 'Outside Available Map Coverage' | 'Map Data Missing';

interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

function emptyPolygonFC(): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: [] };
}

function circlePolygonFC(lat: number, lng: number, radiusM: number, steps = 48): FeatureCollection<Polygon> {
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
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }],
  };
}

function conePolygonFC(fix: Fix, heading: number, baseRadiusM: number): FeatureCollection<Polygon> {
  const spread = 25; // degrees
  const len = Math.max(baseRadiusM || 30, 30) * 1.6;
  const R = 6378137;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dest = (bearing: number, dist: number): [number, number] => {
    const br = toRad(bearing);
    const lat1 = toRad(fix.lat);
    const lon1 = toRad(fix.lng);
    const ang = dist / R;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br));
    const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(ang) * Math.cos(lat1), Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2));
    return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  };
  const p1 = dest(heading - spread, len);
  const p2 = dest(heading + spread, len);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[fix.lng, fix.lat], p1, p2, [fix.lng, fix.lat]]] },
      },
    ],
  };
}

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

function createBlueDotElement() {
  const el = document.createElement('div');
  el.className = 'aeris-blue-dot-icon';
  el.innerHTML = '<div class="aeris-blue-dot"><div class="aeris-blue-dot-core"></div></div>';
  return el;
}

export function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const dotMarker = useRef<maplibregl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const orientationHandler = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const firstFixCentered = useRef(false);
  const sourceErrorCount = useRef(0);

  const [mapInfo, setMapInfo] = useState<MapStatusInfo | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>('Loading Local Map');
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('Waiting for Permission');
  const [tracking, setTracking] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [headingSource, setHeadingSource] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<string>('unknown');
  const [fixSource, setFixSource] = useState<'browser-geolocation' | 'usb-gnss-nmea' | null>(null);
  const [gnssStatus, setGnssStatus] = useState<LocalGnssStatus | null>(null);
  const localPollId = useRef<number | null>(null);
  // While a fresh local (USB GNSS) fix was seen recently, browser fixes are ignored
  const localFreshUntil = useRef(0);

  const secure = typeof window !== 'undefined' ? window.isSecureContext : false;
  const geoSupported = typeof navigator !== 'undefined' && !!navigator.geolocation;

  // Fetch local map status
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchMapStatus();
        if (cancelled) return;
        // Keep object identity stable so the map-init effect (dep [mapInfo]) doesn't re-fire
        setMapInfo((prev) => (prev && JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
        setMapStatus((prev) => (data.ready ? (prev === 'Loading Local Map' ? prev : prev) : 'Map Data Missing'));
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

  // Initialize MapLibre map (offline PMTiles archive)
  useEffect(() => {
    if (!mapRef.current || mapInstance.current || !mapInfo) return;

    const dc = mapInfo.default_center;
    const centerLng = Number.isFinite(dc?.lng) ? dc.lng : AERIS_DEFAULT_CENTER[0];
    const centerLat = Number.isFinite(dc?.lat) ? dc.lat : AERIS_DEFAULT_CENTER[1];
    const zoom = Number.isFinite(dc?.zoom) ? (dc.zoom as number) : mapInfo.default_zoom || AERIS_DEFAULT_ZOOM;

    let cancelled = false;
    let map: maplibregl.Map | null = null;

    (async () => {
      ensurePmtilesProtocol();
      let style: unknown = null;
      try {
        const res = await fetch(AERIS_STYLE_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('style');
        style = await res.json();
      } catch {
        if (!cancelled) setMapStatus('Map Data Missing');
        return;
      }
      if (cancelled || !mapRef.current) return;

      map = new maplibregl.Map({
        container: mapRef.current,
        style: style as maplibregl.StyleSpecification,
        center: [centerLng, centerLat],
        zoom,
        minZoom: mapInfo.min_zoom ?? AERIS_MIN_ZOOM,
        // PMTiles archive provides z0–15; nothing past z15 (no overzoom faking).
        maxZoom: mapInfo.max_zoom ?? AERIS_MAX_ZOOM,
        // Explicit: every zoom interaction enabled (wheel, trackpad pinch/ctrl+wheel,
        // pinch touch, double-click, keyboard). maxZoom above caps them all at z15.
        scrollZoom: true,
        touchZoomRotate: true,
        doubleClickZoom: true,
        keyboard: true,
        boxZoom: true,
        attributionControl: { compact: true },
      });
      mapInstance.current = map;
      (window as unknown as Record<string, unknown>).__aerisMapPageMap = map;

      map.on('load', () => {
        if (cancelled || !map) return;
        // GeoJSON layers for GPS accuracy ring and heading cone
        if (!map.getSource('fix-accuracy')) {
          map.addSource('fix-accuracy', { type: 'geojson', data: emptyPolygonFC() });
          map.addLayer({
            id: 'fix-accuracy-fill',
            type: 'fill',
            source: 'fix-accuracy',
            paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 },
          });
          map.addLayer({
            id: 'fix-accuracy-line',
            type: 'line',
            source: 'fix-accuracy',
            paint: { 'line-color': '#2563eb', 'line-opacity': 0.4, 'line-width': 1 },
          });
        }
        if (!map.getSource('heading-cone')) {
          map.addSource('heading-cone', { type: 'geojson', data: emptyPolygonFC() });
          map.addLayer({
            id: 'heading-cone-fill',
            type: 'fill',
            source: 'heading-cone',
            paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.18 },
          });
          map.addLayer({
            id: 'heading-cone-line',
            type: 'line',
            source: 'heading-cone',
            paint: { 'line-color': '#2563eb', 'line-opacity': 0.3, 'line-width': 1 },
          });
        }
        setMapStatus(mapInfo.ready ? 'Offline Map Ready' : 'Map Data Missing');
      });

      map.on('error', (e) => {
        const msg = (e as { error?: { message?: string } })?.error?.message ?? '';
        if (msg.includes('aeris') || msg.includes('pmtiles') || msg.includes('tile')) {
          sourceErrorCount.current += 1;
          if (fix) {
            const inside = inBounds(fix.lat, fix.lng, mapInfo.bounds);
            if (inside === false) setMapStatus('Outside Available Map Coverage');
          }
        }
      });

      const onResize = () => map?.resize();
      window.addEventListener('resize', onResize);
      map.once('remove', () => window.removeEventListener('resize', onResize));
    })();

    return () => {
      cancelled = true;
      dotMarker.current?.remove();
      dotMarker.current = null;
      map?.remove();
      mapInstance.current = null;
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

  const acceptFix = useCallback((next: Fix, source: 'browser-geolocation' | 'usb-gnss-nmea') => {
    setFix(next);
    setFixSource(source);
    setLocationStatus('Active');
    setErrorMsg(null);
    // smooth recenter on first fix
    if (!firstFixCentered.current && mapInstance.current) {
      mapInstance.current.flyTo({
        center: [next.lng, next.lat],
        zoom: Math.max(mapInstance.current.getZoom(), AERIS_MAX_ZOOM),
        speed: 1.2,
      });
      firstFixCentered.current = true;
    }
  }, []);

  const updateBlueDot = useCallback(
    (next: Fix) => {
      const map = mapInstance.current;
      if (!map) return;
      const acc = typeof next.accuracy === 'number' && Number.isFinite(next.accuracy) ? Math.max(next.accuracy, 0) : null;

      if (!dotMarker.current) {
        dotMarker.current = new maplibregl.Marker({ element: createBlueDotElement(), anchor: 'center' })
          .setLngLat([next.lng, next.lat])
          .addTo(map);
      } else {
        dotMarker.current.setLngLat([next.lng, next.lat]);
      }

      const accSource = map.getSource('fix-accuracy') as maplibregl.GeoJSONSource | undefined;
      if (accSource) {
        accSource.setData(acc != null ? circlePolygonFC(next.lat, next.lng, acc) : emptyPolygonFC());
      }

      const coneSource = map.getSource('heading-cone') as maplibregl.GeoJSONSource | undefined;
      const h = effectiveHeading.value;
      if (coneSource) {
        coneSource.setData(h != null && Number.isFinite(h) ? conePolygonFC(next, h, acc || 30) : emptyPolygonFC());
      }
    },
    [effectiveHeading.value]
  );

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
        // A fresh hardware GNSS fix outranks the browser's (often coarse) position
        if (Date.now() < localFreshUntil.current) return;
        acceptFix(next, 'browser-geolocation');
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
        maximumAge: 0,
        timeout: 15000,
      }
    );
  }, [geoSupported, secure, stopTracking, permissionState, acceptFix]);

  // One-shot probe of the local GNSS source so the panel can report it even before tracking starts
  useEffect(() => {
    let cancelled = false;
    fetchLocalGnss()
      .then((st) => { if (!cancelled) setGnssStatus(st); })
      .catch(() => { if (!cancelled) setGnssStatus(null); });
    return () => { cancelled = true; };
  }, []);

  // Poll the local USB GNSS receiver while tracking — genuine offline satellite positioning
  useEffect(() => {
    if (!tracking) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await fetchLocalGnss();
        if (cancelled) return;
        setGnssStatus(st);
        const f = st.fix;
        if (f && st.fresh) {
          if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return;
          if (Math.abs(f.lat) > 90 || Math.abs(f.lng) > 180) return;
          if (f.lat === 0 && f.lng === 0) return;
          const course = typeof f.course_deg === 'number' && Number.isFinite(f.course_deg) ? f.course_deg : null;
          const spd = typeof f.speed_mps === 'number' && Number.isFinite(f.speed_mps) ? f.speed_mps : null;
          const next: Fix = {
            lat: f.lat,
            lng: f.lng,
            accuracy: typeof f.accuracy_m === 'number' ? f.accuracy_m : null,
            heading: spd != null && spd > 0.5 ? course : null,
            speed: spd,
            timestamp: f.timestamp,
          };
          localFreshUntil.current = Date.now() + 5000;
          acceptFix(next, 'usb-gnss-nmea');
        }
      } catch {
        if (!cancelled) setGnssStatus(null);
      }
    };
    poll();
    localPollId.current = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (localPollId.current != null) {
        window.clearInterval(localPollId.current);
        localPollId.current = null;
      }
    };
  }, [tracking, acceptFix]);

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => {
      if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
      if (localPollId.current != null) window.clearInterval(localPollId.current);
      if (orientationHandler.current) {
        window.removeEventListener('deviceorientationabsolute' as any, orientationHandler.current as any);
        window.removeEventListener('deviceorientation', orientationHandler.current as any, true);
      }
    };
  }, []);

  const centerOnLocation = () => {
    if (fix && mapInstance.current) {
      mapInstance.current.flyTo({ center: [fix.lng, fix.lat], zoom: Math.max(mapInstance.current.getZoom(), AERIS_MAX_ZOOM), speed: 1.2 });
    }
  };
  const recenter = () => {
    if (fix && mapInstance.current) {
      mapInstance.current.panTo([fix.lng, fix.lat]);
    } else if (mapInstance.current && mapInfo) {
      const c = mapInfo.default_center;
      mapInstance.current.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom || mapInfo.default_zoom || AERIS_DEFAULT_ZOOM });
    }
  };
  const zoomIn = () => mapInstance.current?.zoomIn();
  const zoomOut = () => mapInstance.current?.zoomOut();

  const locationLabel = useMemo(() => locationStatus, [locationStatus]);
  // A fix older than 60 s is not presented as live (polls update every 2 s while active)
  const fixStale = fix != null && Date.now() - fix.timestamp > 60_000;
  const sourceLabel =
    fixSource === 'usb-gnss-nmea'
      ? `USB GNSS (NMEA, offline)${gnssStatus?.port ? ` · ${gnssStatus.port}` : ''}${gnssStatus?.fix?.satellites != null ? ` · ${gnssStatus.fix.satellites} sats` : ''}`
      : fixSource === 'browser-geolocation'
        ? 'Browser geolocation'
        : 'N/A';
  const canStart = !tracking && locationStatus !== 'Active';

  return (
    <div className="h-full flex flex-col">
      <div className="panel-card min-h-full flex flex-col">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 uppercase">Live GPS Map</h2>
            <p className="text-xs text-slate-500 mt-1">Offline OpenStreetMap vector map (PMTiles + MapLibre) with real-time browser location.</p>
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
            <div ref={mapRef} className="h-full w-full z-0" />
            {!mapInfo && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-600 bg-slate-100/80">Loading local map configuration...</div>
            )}
            {mapInfo && !mapInfo.ready && (
              <div className="absolute top-3 left-3 right-3 z-10 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md px-3 py-2">
                Offline map data is missing. Place aeris.pmtiles on the Raspberry Pi and reload. GPS coordinates may still be available, but street map details outside preloaded coverage or without local data cannot be shown.
              </div>
            )}
            <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2">
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
                {fixStale && (
                  <div className="text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                    Last update {fmtTime(fix.timestamp)} — stale fix (last-known position, not live).
                  </div>
                )}
                <div className="flex justify-between gap-2"><span className="text-slate-500">Latitude</span><span className="font-mono">{fmtCoord(fix?.lat, 'N', 'S')}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Longitude</span><span className="font-mono">{fmtCoord(fix?.lng, 'E', 'W')}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">GPS Accuracy</span><span>{fix?.accuracy != null ? `${Math.round(fix.accuracy)} m` : 'N/A'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Source</span><span className="text-right">{sourceLabel}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Local GNSS</span><span className="text-right">{gnssStatus === null ? 'unknown' : gnssStatus.available ? (gnssStatus.fix ? `receiver on ${gnssStatus.port}` : `receiver on ${gnssStatus.port} — no fix yet`) : 'not detected (no USB GNSS)'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Last Update</span><span className="text-right">{fmtTime(fix?.timestamp ?? null)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Heading</span><span>{effectiveHeading.value != null ? `${Math.round(effectiveHeading.value)}°` : 'N/A'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Heading Source</span><span className="text-right">{effectiveHeading.source || 'N/A'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Tracking</span><span>{tracking ? 'Active watch' : 'Stopped'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Permission</span><span className="capitalize">{permissionState}</span></div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Status &amp; Guidance</h3>
              {errorMsg && <div className="text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">{errorMsg}</div>}
              {!secure && (
                <div className="text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                  Secure context required for browser geolocation. Use HTTPS to access this dashboard (local trusted certificate or another supported secure-context method). Ordinary HTTP over LAN IP may not allow geolocation.
                </div>
              )}
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>Location comes only from real providers — never fabricated. Priority: a fresh fix from a locally attached USB GNSS receiver (backend endpoint /api/location/local, NMEA 0183, fully offline), otherwise the browser Geolocation API. The Raspberry Pi 4B has no built-in GNSS; without a USB GNSS receiver, browser geolocation usually cannot obtain a fix offline.</li>
                <li>To grant persistent access: choose <b>Allow</b> when prompted. To change later, use browser site settings (lock/info icon) → Location → Allow.</li>
                <li>Map uses only the locally hosted PMTiles vector archive served by AERIS (OpenStreetMap data). If outside preloaded coverage or map data is missing, street details may be unavailable; GPS coordinates can still be shown when available.</li>
                <li>Heading cone appears only when valid heading data is available (device orientation/compass or GPS course while moving). Stationary GPS direction is not treated as compass heading.</li>
              </ul>
              <div className="pt-1 border-t border-slate-200">
                <div><span className="font-semibold">Map source:</span> {mapInfo?.ready ? 'Offline PMTiles vector archive (OpenStreetMap)' : 'No local map data loaded'}</div>
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
        .maplibregl-map { font-family: inherit; background: #e5e7eb; }
        .aeris-map-marker { background: transparent; border: none; }
      `}</style>
    </div>
  );
}
