import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';

function defaultWsUrl() {
  if (typeof window === 'undefined') return 'ws://localhost:5000/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export function useWebSocket(url?: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const setSystemState = useAppStore((s) => s.setSystemState);
  const setWsConnected = useAppStore((s) => s.setWsConnected);
  const upsertDetection = useAppStore((s) => s.upsertDetection);
  const resolvedUrl = url || defaultWsUrl();

  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (closed) return;
      try {
        const ws = new WebSocket(resolvedUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data?.type === 'system_state') {
              setSystemState(data);
            } else if (data?.type === 'detection') {
              // Only accept real detections from local system payloads
              if (data.source === 'mlx90640' || data.detection_type === 'thermal_presence') {
                upsertDetection({
                  id: String(data.id || `THERM-${Date.now()}`),
                  timestamp: typeof data.timestamp === 'string' ? data.timestamp : new Date().toLocaleTimeString(),
                  confidence: Number(data.confidence ?? 0),
                  lat: data.lat ?? null,
                  lng: data.lng ?? null,
                  altitude: data.altitude ?? null,
                  distance: data.distance ?? null,
                  status: 'new',
                  detection_type: data.detection_type,
                  thermal: data.thermal,
                  source: data.source || 'mlx90640',
                });
              }
            } else if (data?.type === 'telemetry') {
              // Legacy-compatible telemetry may carry system subfields
              if (data.sensor || data.thermal || data.lora || data.network) {
                setSystemState({
                  timestamp: data.timestamp,
                  device: data.device,
                  network: data.network,
                  sensor: data.sensor as any,
                  thermal: data.thermal as any,
                  detection: data.detection as any,
                  lora: data.lora as any,
                });
              }
            }
          } catch (err) {
            console.error('WS parse error:', err);
          }
        };

        ws.onerror = () => {
          setWsConnected(false);
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!closed) reconnectTimer = window.setTimeout(connect, 3000);
        };
      } catch {
        setWsConnected(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [resolvedUrl, setSystemState, setWsConnected, upsertDetection]);

  const send = (data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  return { send, ws: wsRef };
}
