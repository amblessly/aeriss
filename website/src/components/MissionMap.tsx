import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AERIS_DEFAULT_CENTER,
  AERIS_DEFAULT_ZOOM,
  AERIS_MAX_ZOOM,
  AERIS_MIN_ZOOM,
  AERIS_STYLE_URL,
  AERIS_MAP_STATUS_URL,
  circlePolygonFC,
  ensurePmtilesProtocol,
  maplibregl,
  type MapStatusInfo,
} from '../map/aerisMap';
import { useAppStore } from '../stores/appStore';
import { useLaptopLocationStore, type LaptopFix } from '../stores/laptopLocationStore';
import { fetchLocalGnss, type LocalGnssStatus } from '../map/localGps';

const UAV_ICON_SVG =
  '<svg viewBox="0 0 256 256" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M230.14,25.86a16,16,0,0,0-16.64-3.95L33.9,94.37A16.08,16.08,0,0,0,35.23,124.7l79.36,26.45,26.45,79.36a16,16,0,0,0,15.14,11,16.23,16.23,0,0,0,3.09-.3,16,16,0,0,0,12.1-11.63L234.09,42.5A16,16,0,0,0,230.14,25.86ZM151.25,215.1,128.11,145.7l63.08-63.08Z"/></svg>';
const PERSON_ICON_SVG =
  '<svg viewBox="0 0 256 256" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M128,136a36,36,0,1,0-36-36A36,36,0,0,0,128,136Zm0,16c-41.4,0-76,20.66-76,52a12,12,0,0,0,12,12H192a12,12,0,0,0,12-12C204,172.66,169.4,152,128,152Z"/></svg>';
// Recognizable user/laptop location marker (person glyph — matches the laptop's user)
const MAP_PIN_SVG = (
  <svg viewBox="0 0 256 256" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M128,24a104,104,0,0,0-104,104c0,67.4,79.74,133.6,104,153.7 24.06-20,104-86.2,104-153.7A104,104,0,0,0,128,24Zm0,144a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z" />
  </svg>
);

// A laptop/device without a reliable positioning source (desktop, server, VM, VPN, offline hotspot)
// typically reports an IP/network-based position with very coarse accuracy. Treat fixes worse than
// this radius as non-fixes rather than presenting them as the user's location.
const MAX_ACCURACY_M = 1000;

// A GPS-quality fix should not jump backwards in time meaningfully.
const MAX_FIX_AGE_MS = 60_000;

function createHomeElement() {
  const el = document.createElement('div');
  el.className = 'aeris-map-marker';
  el.innerHTML =
    '<div class="w-6 h-6 bg-aeris rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-[10px] shadow-md">H</div>';
  return el;
}

function createSurvivorElement(onClick: () => void) {
  const el = document.createElement('button');
  el.className = 'aeris-map-marker cursor-pointer focus:outline-none rounded-full';
  el.setAttribute('aria-label', 'Survivor detected');
  el.innerHTML = `<div class="relative w-6 h-6"><div class="absolute inset-0 rounded-full bg-danger opacity-40 animate-ping"></div><div class="relative w-6 h-6 bg-danger rounded-full border-2 border-white flex items-center justify-center text-white shadow-md">${PERSON_ICON_SVG}</div></div>`;
  el.addEventListener('click', onClick);
  return el;
}

function createUavElement() {
  const el = document.createElement('div');
  el.className = 'aeris-map-marker';
  el.innerHTML = `<div class="aeris-uav-rotate w-6 h-6 bg-white rounded-full border-2 border-aeris flex items-center justify-center text-aeris shadow-md">${UAV_ICON_SVG}</div>`;
  return el;
}

function createLaptopElement() {
  const el = document.createElement('div');
  el.className = 'aeris-map-marker';
  // Map-pin style teardrop marker; tip sits exactly on the reported position (anchor: 'bottom')
  el.innerHTML = laptopPinHtml('live');
  return el;
}

// Live fixes use the existing green pin; a persisted last-known position is amber and
// visibly dimmer so it can never be mistaken for a live fix.
function laptopPinHtml(variant: 'live' | 'lastKnown') {
  const main = variant === 'live' ? '#059669' : '#b45309';
  const dash = variant === 'live' ? 'none' : '4 2.6';
  const opacity = variant === 'live' ? '1' : '0.82';
  return `<svg viewBox="0 0 48 56" width="34" height="40" aria-hidden="true" opacity="${opacity}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
    <path fill="${main}" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round" stroke-dasharray="${dash}" d="M24 1.5c-11.6 0-21 9.4-21 21 0 14.9 17.6 31 20.1 33.1a1.6 1.6 0 0 0 1.8 0C27.4 53.5 45 37.4 45 22.5c0-11.6-9.4-21-21-21z"/>
    <circle cx="24" cy="22.5" r="6.5" fill="#ffffff"/>
  </svg>`;
}

// Displayability (coordinates sane) — used for last-known rendering. Deliberately does
// NOT check age: an old fix is shown, just clearly labeled as last-known.
function isDisplayableFix(fix: Pick<LaptopFix, 'lat' | 'lng'>): boolean {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return false;
  if (fix.lat < -90 || fix.lat > 90 || fix.lng < -180 || fix.lng > 180) return false;
  if (fix.lat === 0 && fix.lng === 0) return false; // "no signal" sentinel
  return true;
}

// Freshness + plausibility gate for LIVE fixes.
function isUsableFix(fix: LaptopFix, source: 'browser-geolocation' | 'usb-gnss-nmea'): boolean {
  if (!isDisplayableFix(fix)) return false;
  const acc = fix.accuracy;
  if (source === 'usb-gnss-nmea') {
    // Hardware GNSS: HDOP-derived estimate may be absent; only reject absurd values.
    if (acc != null && (!Number.isFinite(acc) || acc <= 0 || acc > MAX_ACCURACY_M)) return false;
  } else {
    // Browser fixes on non-GNSS hardware are often coarse IP/wifi estimates — reject them.
    if (acc == null || !Number.isFinite(acc) || acc <= 0 || acc > MAX_ACCURACY_M) return false;
  }
  if (Math.abs(Date.now() - fix.timestamp) > MAX_FIX_AGE_MS) return false;
  return true;
}

export function MissionMap() {
  const { uav, survivor, home, setModalOpen, alertAcknowledged } = useAppStore();
  const { trackingEnabled, setLastKnown, setTrackingEnabled, lastKnown } = useLaptopLocationStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const uavMarker = useRef<maplibregl.Marker | null>(null);
  const survivorMarker = useRef<maplibregl.Marker | null>(null);
  const homeMarker = useRef<maplibregl.Marker | null>(null);
  const laptopMarker = useRef<maplibregl.Marker | null>(null);
  const laptopMarkerVariant = useRef<'live' | 'lastKnown'>('live');
  const laptopWatchId = useRef<number | null>(null);
  const firstFixCentered = useRef(false);
  const localPollId = useRef<number | null>(null);
  // While a fresh local (USB GNSS) fix was seen recently, browser-geolocation fixes
  // are ignored so a coarser/IP-based browser position cannot yank the pin.
  const localFreshUntil = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [mapMissing, setMapMissing] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [livePin, setLivePin] = useState(false); // true while a validated live fix is shown
  const [liveSource, setLiveSource] = useState<'browser-geolocation' | 'usb-gnss-nmea' | null>(null);
  const [localGnss, setLocalGnss] = useState<LocalGnssStatus | null>(null);
  const [showingLastKnown, setShowingLastKnown] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const uavAvailable =
    uav.lat != null && uav.lng != null && Number.isFinite(uav.lat) && Number.isFinite(uav.lng);
  const secure = typeof window !== 'undefined' ? window.isSecureContext : false;
  const geoSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  // Fetch map status (for data-missing notice); the map itself reads the local style/tiles.
  useEffect(() => {
    let cancelled = false;
    fetch(AERIS_MAP_STATUS_URL, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('status'))))
      .then((info: MapStatusInfo) => {
        if (!cancelled) setMapMissing(!info.ready);
      })
      .catch(() => {
        if (!cancelled) setMapMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const laptopEmptyFC = { type: 'FeatureCollection' as const, features: [] };

  const setLaptopMarkerVariant = (variant: 'live' | 'lastKnown') => {
    const el = laptopMarker.current?.getElement();
    if (!el || laptopMarkerVariant.current === variant) return;
    el.innerHTML = laptopPinHtml(variant);
    laptopMarkerVariant.current = variant;
  };

  const setRingColor = (color: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer('laptop-accuracy-fill')) map.setPaintProperty('laptop-accuracy-fill', 'fill-color', color);
    if (map.getLayer('laptop-accuracy-line')) map.setPaintProperty('laptop-accuracy-line', 'line-color', color);
  };

  const ensureLaptopMarker = (fix: LaptopFix) => {
    const map = mapRef.current;
    if (!map || laptopMarker.current) return;
    laptopMarker.current = new maplibregl.Marker({ element: createLaptopElement(), anchor: 'bottom' })
      .setLngLat([fix.lng, fix.lat])
      .addTo(map);
    laptopMarkerVariant.current = 'live';
    laptopMarker.current.getElement().style.display = '';
  };

  const updateAccuracyRing = (fix: LaptopFix, color: string) => {
    const map = mapRef.current;
    const src = map?.getSource('laptop-accuracy') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    setRingColor(color);
    if (fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy > 0) {
      src.setData(circlePolygonFC(fix.lat, fix.lng, Math.max(fix.accuracy, 1)));
    } else {
      // No accuracy estimate from the provider — show no ring rather than invent one
      src.setData(laptopEmptyFC);
    }
  };

  const flyOrEase = (fix: LaptopFix, mode: 'fly' | 'ease') => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'fly') {
      map.flyTo({ center: [fix.lng, fix.lat], zoom: AERIS_MAX_ZOOM, speed: 1.2 });
      return;
    }
    const c = map.getCenter();
    const dLat = (fix.lat - c.lat) * 111320;
    const dLng = (fix.lng - c.lng) * 111320 * Math.cos((fix.lat * Math.PI) / 180);
    if (Math.hypot(dLat, dLng) > 30) {
      map.easeTo({ center: [fix.lng, fix.lat], duration: 700, essential: true });
    }
  };

  // Fresh, validated fix from any real provider (USB GNSS or browser geolocation).
  // fly = first valid fix of a session, ease = subsequent fixes (skipped for sub-30 m jitter).
  const applyLaptopFix = (fix: LaptopFix, source: 'browser-geolocation' | 'usb-gnss-nmea', mode: 'fly' | 'ease') => {
    const map = mapRef.current;
    if (!map) return;
    ensureLaptopMarker(fix);
    setLaptopMarkerVariant('live');
    laptopMarker.current!.getElement().style.display = '';
    laptopMarker.current!.setLngLat([fix.lng, fix.lat]);
    updateAccuracyRing(fix, '#059669');
    setLastKnown(fix);
    setLivePin(true);
    setLiveSource(source);
    setShowingLastKnown(false);
    flyOrEase(fix, mode);
  };

  // Persisted last-known position: rendered with an unmistakable amber/dashed pin and a
  // "LAST KNOWN" banner. Never presented as live, never triggers camera movement.
  const renderLastKnownFix = (fix: LaptopFix) => {
    const map = mapRef.current;
    if (!map) return;
    ensureLaptopMarker(fix);
    setLaptopMarkerVariant('lastKnown');
    laptopMarker.current!.getElement().style.display = '';
    laptopMarker.current!.setLngLat([fix.lng, fix.lat]);
    updateAccuracyRing(fix, '#b45309');
    setLivePin(false);
    setLiveSource(null);
    setShowingLastKnown(true);
  };

  const hideLaptopMarker = () => {
    setLivePin(false);
    setLiveSource(null);
    setShowingLastKnown(false);
    if (laptopMarker.current) laptopMarker.current.getElement().style.display = 'none';
    const src = mapRef.current?.getSource('laptop-accuracy') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(laptopEmptyFC);
  };

  const clearLaptopPin = () => {
    // No fresh fix: fall back to the persisted last-known fix (clearly labeled) if usable
    const fallback = useLaptopLocationStore.getState().lastKnown;
    if (fallback && isDisplayableFix(fallback)) {
      renderLastKnownFix(fallback);
      return;
    }
    hideLaptopMarker();
  };

  const stopLaptopWatch = () => {
    if (laptopWatchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(laptopWatchId.current);
      laptopWatchId.current = null;
    }
  };

  const startLaptopWatch = (quick: boolean) => {
    if (!secure) {
      setLocationError('HTTPS required for browser location. Serve the dashboard over HTTPS, then try Enable.');
      return;
    }
    if (!geoSupported) {
      setLocationError('Browser geolocation is not supported on this device/browser.');
      return;
    }
    stopLaptopWatch();
    setLocationError(null);
    firstFixCentered.current = false;
    // Fresh fixes only: maximumAge 0 so stale cached fixes are never displayed as current
    laptopWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: LaptopFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
          timestamp: pos.timestamp || Date.now(),
          source: 'browser-geolocation',
        };
        if (!isUsableFix(fix, 'browser-geolocation')) {
          setLocationError(
            fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M
              ? `Location too approximate (±${Math.round(fix.accuracy)} m). This is a network/IP-based estimate — not a GPS fix. Plug in a USB GNSS receiver for offline satellite positioning.`
              : 'Location unavailable — no valid fix from the device/browser.'
          );
          // Keep whatever is already shown (live local fix, or last-known) rather than yank it
          if (!(laptopMarker.current && laptopMarkerVariant.current === 'live')) clearLaptopPin();
          return;
        }
        // A fresh hardware GNSS fix outranks the browser's (often coarse) position
        if (Date.now() < localFreshUntil.current) return;
        setLocationError(null);
        // Always-on follow: first fix flies to street level, later fixes ease along the path
        const shouldFly = quick || !firstFixCentered.current;
        applyLaptopFix(fix, 'browser-geolocation', shouldFly ? 'fly' : 'ease');
        firstFixCentered.current = true;
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setTrackingEnabled(false);
          stopLaptopWatch();
          clearLaptopPin();
          setLocationError('Permission denied. Allow location access for this site in browser settings, then Enable again.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationError('Location unavailable from the browser/OS provider. Browser geolocation generally cannot obtain a fix offline on hardware without GNSS — plug in a USB GNSS receiver for genuine offline satellite positioning.');
          clearLaptopPin();
        } else if (err.code === err.TIMEOUT) {
          // Keep waiting for a fix, but do not show anything in the meantime
          setLocationError('Waiting for a fix — this may never arrive offline without GNSS hardware. A USB GNSS receiver enables offline satellite positioning.');
        } else {
          setLocationError('Unable to determine location.');
          clearLaptopPin();
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  };

  const enableLocation = () => {
    setTrackingEnabled(true);
    startLaptopWatch(true);
  };

  // Initialize MapLibre map (offline, PMTiles-backed)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtilesProtocol();

    const center: [number, number] = uavAvailable
      ? [uav.lng as number, uav.lat as number]
      : home.lat || home.lng
        ? [home.lng, home.lat]
        : AERIS_DEFAULT_CENTER;

    let cancelled = false;
    let map: maplibregl.Map | null = null;

    (async () => {
      let style: unknown = null;
      let cameraMaxZoom = AERIS_MAX_ZOOM;
      try {
        const res = await fetch(AERIS_STYLE_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('style');
        style = await res.json();
        // Clamp the camera to the *effective* archive's real zoom ceiling:
        // z16 for the HQ operational archive, z15 for the nationwide fallback.
        try {
          const sres = await fetch(AERIS_MAP_STATUS_URL, { cache: 'no-store' });
          if (sres.ok) {
            const info = (await sres.json()) as MapStatusInfo;
            if (Number.isFinite(info.max_zoom)) cameraMaxZoom = Math.round(info.max_zoom);
          }
        } catch {
          /* status unavailable — keep AERIS_MAX_ZOOM */
        }
      } catch {
        if (!cancelled) setMapFailed(true);
        return;
      }
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: style as maplibregl.StyleSpecification,
        center,
        zoom: AERIS_DEFAULT_ZOOM,
        minZoom: AERIS_MIN_ZOOM,
        // Effective archive's real ceiling (status API: z16 HQ operational archive, z15 nationwide fallback).
        maxZoom: cameraMaxZoom,
        // Explicit: all zoom interactions enabled (mouse wheel, trackpad pinch / ctrl+wheel,
        // touch pinch, double-click, keyboard). maxZoom above caps them all at z15.
        scrollZoom: true,
        touchZoomRotate: true,
        doubleClickZoom: true,
        keyboard: true,
        boxZoom: true,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      // e2e/diagnostic handle (read-only usage; harmless in production)
      (window as unknown as Record<string, unknown>).__aerisMissionMap = map;

      map.on('load', () => {
        if (cancelled) return;
        setMapReady(true);

        if (home.lat || home.lng) {
          homeMarker.current = new maplibregl.Marker({ element: createHomeElement(), anchor: 'center' })
            .setLngLat([home.lng, home.lat])
            .addTo(map!);
        }

        if (survivor.lat != null && survivor.lng != null) {
          const el = createSurvivorElement(() => setModalOpen(true));
          survivorMarker.current = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([survivor.lng, survivor.lat])
            .addTo(map!);
        }

        // Laptop (browser) geolocation — accuracy ring; empty until a fix exists
        if (!map.getSource('laptop-accuracy')) {
          map.addSource('laptop-accuracy', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({
            id: 'laptop-accuracy-fill',
            type: 'fill',
            source: 'laptop-accuracy',
            paint: { 'fill-color': '#059669', 'fill-opacity': 0.12 },
          });
          map.addLayer({
            id: 'laptop-accuracy-line',
            type: 'line',
            source: 'laptop-accuracy',
            paint: { 'line-color': '#059669', 'line-opacity': 0.4, 'line-width': 1 },
          });
        }

        if (uavAvailable) {
          const el = createUavElement();
          uavMarker.current = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([uav.lng as number, uav.lat as number])
            .addTo(map!);
        }
      });

      map.on('error', () => {
        // Keep last good frame; surface failure only if the style/source never loaded.
        setMapReady((ready) => ready);
      });

      const onResize = () => map?.resize();
      window.addEventListener('resize', onResize);
      map.once('remove', () => window.removeEventListener('resize', onResize));
    })();

    return () => {
      cancelled = true;
      uavMarker.current?.remove();
      uavMarker.current = null;
      survivorMarker.current?.remove();
      survivorMarker.current = null;
      homeMarker.current?.remove();
      homeMarker.current = null;
      laptopMarker.current?.remove();
      laptopMarker.current = null;
      stopLaptopWatch();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update UAV marker position/heading when telemetry changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (uav.lat != null && uav.lng != null && Number.isFinite(uav.lat) && Number.isFinite(uav.lng)) {
      if (!uavMarker.current) {
        const el = createUavElement();
        uavMarker.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([uav.lng, uav.lat])
          .addTo(mapRef.current);
      } else {
        uavMarker.current.setLngLat([uav.lng, uav.lat]);
      }
      const inner = uavMarker.current.getElement().querySelector('.aeris-uav-rotate') as HTMLElement | null;
      if (inner) inner.style.transform = `rotate(${uav.heading ?? 0}deg)`;
    }
  }, [uav.lat, uav.lng, uav.heading]);

  // Remove survivor ping when alert acknowledged
  useEffect(() => {
    if (survivorMarker.current && alertAcknowledged) {
      survivorMarker.current.getElement().querySelector('.animate-ping')?.remove();
    }
  }, [alertAcknowledged]);

  // Resume tracking after refresh only if the user left it enabled AND the browser still grants it
  // (never auto-prompt on a fresh page load)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perms: any = (navigator as any).permissions;
        if (perms?.query) {
          const st = await perms.query({ name: 'geolocation' as PermissionName });
          if (cancelled) return;
          if (trackingEnabled && st.state === 'granted') {
            startLaptopWatch(false);
          }
          return;
        }
      } catch {
        // Permissions API unavailable; leave tracking off until the user presses Enable
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the persisted last-known position once the map is ready — shown only as a
  // clearly labeled LAST KNOWN marker (amber), never as a live fix, never moving the camera.
  useEffect(() => {
    if (!mapReady) return;
    const lk = useLaptopLocationStore.getState().lastKnown;
    if (lk && isDisplayableFix(lk) && laptopMarkerVariant.current !== 'live') {
      renderLastKnownFix(lk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // Local USB GNSS poll — active only while tracking is enabled.
  // A fresh local satellite fix outranks the browser's (often coarse/IP-based) position.
  useEffect(() => {
    if (!trackingEnabled || !mapReady) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await fetchLocalGnss();
        if (cancelled) return;
        setLocalGnss(st);
        const fga = st.fix;
        if (fga && st.fresh) {
          const fix: LaptopFix = {
            lat: fga.lat,
            lng: fga.lng,
            accuracy: fga.accuracy_m,
            timestamp: fga.timestamp,
            source: 'usb-gnss-nmea',
          };
          if (isUsableFix(fix, 'usb-gnss-nmea')) {
            localFreshUntil.current = Date.now() + 5000; // poll interval 2s + margin
            setLocationError(null);
            const shouldFly = !firstFixCentered.current;
            applyLaptopFix(fix, 'usb-gnss-nmea', shouldFly ? 'fly' : 'ease');
            firstFixCentered.current = true;
          }
        }
      } catch {
        if (!cancelled) setLocalGnss(null); // backend without local-GNSS support, or endpoint down
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingEnabled, mapReady]);

  // Watchdog: an ageing live fix must not keep looking live. Downgrade to LAST KNOWN.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (laptopMarkerVariant.current !== 'live') return;
      const lk = useLaptopLocationStore.getState().lastKnown;
      if (lk && isDisplayableFix(lk) && Math.abs(Date.now() - lk.timestamp) > MAX_FIX_AGE_MS) {
        renderLastKnownFix(lk);
      }
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop watcher on unmount
  useEffect(() => () => stopLaptopWatch(), []);

  return (
    <div className="lg:col-span-5 panel-card p-0 relative min-h-[300px] lg:min-h-0">
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-slate-200 flex items-center gap-2">
        <h2 className="text-sm font-bold text-slate-800">MISSION MAP</h2>
        <span className="text-[10px] text-slate-500">Street Map</span>
      </div>

      {/* LIVE chip — provider name; shown only while a validated live fix is displayed */}
      {livePin && (
        <div data-testid="live-fix-chip" className="absolute top-14 left-4 z-10 bg-emerald-50/95 border border-emerald-200 text-emerald-900 text-[10px] rounded-md px-2.5 py-1 leading-snug shadow-sm flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-semibold">LIVE</span>
          <span>— {liveSource === 'usb-gnss-nmea'
            ? `USB GNSS (NMEA)${localGnss?.port ? ` · ${localGnss.port}` : ''}${localGnss?.fix?.satellites != null ? ` · ${localGnss.fix.satellites} sats` : ''}${localGnss?.fix?.accuracy_m != null ? ` · ±${Math.round(localGnss.fix.accuracy_m)} m` : ''}`
            : `Browser geolocation${lastKnown?.accuracy != null ? ` · ±${Math.round(lastKnown.accuracy)} m` : ''}`}</span>
        </div>
      )}

      {/* LAST KNOWN position banner — amber, unmistakable, never a live claim */}
      {!livePin && showingLastKnown && lastKnown && (
        <div data-testid="last-known-banner" className="absolute top-14 left-4 right-4 z-10 bg-amber-50 border border-amber-300 text-amber-900 text-[10px] rounded-md px-3 py-1.5 leading-snug shadow-sm">
          <span className="font-bold">LAST KNOWN POSITION</span> — fix from {new Date(lastKnown.timestamp).toLocaleString()}
          {lastKnown.source ? ` · ${lastKnown.source === 'usb-gnss-nmea' ? 'USB GNSS (NMEA)' : 'Browser geolocation'}` : ''}.
          {' '}Not a live fix — no fresh position is available, and the device may have moved. A USB GNSS receiver enables genuine offline satellite positioning.
        </div>
      )}

      {/* Location error / accuracy hint — shown only when there is no usable fix and no last-known pin */}
      {locationError && !livePin && !showingLastKnown && (
        <div className="absolute top-14 left-4 right-4 z-10 bg-amber-50 border border-amber-200 text-amber-900 text-[10px] rounded-md px-3 py-1.5 leading-snug">
          {locationError}
        </div>
      )}

      {/* Single location button (bottom-left) — visible only without a live pin */}
      {!livePin && (
        <button
          onClick={enableLocation}
          aria-label="Enable location tracking"
          className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 h-9 pl-2 pr-3 text-[11px] font-semibold rounded-md shadow-sm border bg-aeris text-white border-aeris hover:bg-aeris-dark transition-colors"
        >
          {MAP_PIN_SVG}
          Enable
        </button>
      )}

      {/* Zoom controls (bottom-right) */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={() => mapRef.current?.zoomOut()}
          aria-label="Zoom out"
          className="w-8 h-8 text-base font-semibold leading-none rounded-md border shadow-sm bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50"
        >
          −
        </button>
        <button
          onClick={() => mapRef.current?.zoomIn()}
          aria-label="Zoom in"
          className="w-8 h-8 text-base font-semibold leading-none rounded-md border shadow-sm bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50"
        >
          +
        </button>
      </div>

      <div ref={containerRef} className="h-full w-full z-0 rounded-xl overflow-hidden bg-slate-100" />

      {mapMissing && (
        <div className="absolute top-16 left-4 right-4 z-10 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-md px-3 py-2">
          Offline map data missing. Place aeris.pmtiles in data/maps on the Raspberry Pi and reload. GPS coordinates may still be available.
        </div>
      )}
      {mapFailed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-600 bg-slate-100/80">
          Offline map failed to load (style unavailable). Check the local AERIS map assets.
        </div>
      )}
      {!mapReady && !mapFailed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-600 bg-slate-100/80 pointer-events-none">
          Loading offline map…
        </div>
      )}
    </div>
  );
}
