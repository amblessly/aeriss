import { useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import { Icon } from './Icon';

type SensorUiState = 'connected' | 'disconnected' | 'initializing';

function tempColor(v: number, min: number, max: number) {
  const t = max <= min ? 0.5 : Math.max(0, Math.min(1, (v - min) / (max - min)));
  // blue -> cyan -> green -> yellow -> red
  const r = Math.round(255 * Math.min(1, Math.max(0, t * 1.5 - 0.25)));
  const g = Math.round(255 * Math.min(1, Math.max(0, 1 - Math.abs(t - 0.5) * 2)));
  const b = Math.round(255 * Math.min(1, Math.max(0, 1 - t * 1.2)));
  return `rgb(${r},${g},${b})`;
}

export function LiveFeed() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const sensor = useAppStore((s) => s.system?.sensor);
  const thermal = useAppStore((s) => s.system?.thermal);

  const sensorUiState: SensorUiState = useMemo(() => {
    const state = String(sensor?.state || '').toLowerCase();
    if (!wsConnected) return 'initializing';
    if (state === 'connected' || sensor?.connected === true) return 'connected';
    if (state === 'disconnected') return 'disconnected';
    if (state === 'initializing') return 'initializing';
    // Fallbacks based on available info
    if (sensor && sensor.frames_read > 0 && sensor.connected === false) return 'disconnected';
    return 'initializing';
  }, [wsConnected, sensor?.state, sensor?.connected, sensor?.frames_read]);

  const statusMessage =
    sensorUiState === 'connected'
      ? 'Thermal camera connected. Live thermal feed is available.'
      : sensorUiState === 'disconnected'
        ? 'Thermal camera is not connected.'
        : 'Connecting to thermal camera...';

  const badgeLabel =
    sensorUiState === 'connected' ? 'Connected' : sensorUiState === 'disconnected' ? 'Disconnected' : 'Connecting';
  const badgeColor =
    sensorUiState === 'connected' ? 'bg-green-400' : sensorUiState === 'disconnected' ? 'bg-red-500' : 'bg-amber-400';

  const heatmap = thermal?.heatmap as number[][] | null | undefined;
  const minC = typeof thermal?.min_c === 'number' ? thermal.min_c : undefined;
  const maxC = typeof thermal?.max_c === 'number' ? thermal.max_c : undefined;
  const hasFrame = sensorUiState === 'connected' && !!(heatmap && Array.isArray(heatmap) && heatmap.length > 0 && minC != null && maxC != null);

  const cells = useMemo(() => {
    if (!hasFrame || !heatmap) return null;
    return heatmap;
  }, [hasFrame, heatmap]);

  return (
    <div className="lg:col-span-4 panel-card p-0 overflow-hidden relative group min-h-[300px] lg:min-h-0">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
        <h2 className="text-sm font-bold text-white drop-shadow-md">THERMAL FEED (MLX90640)</h2>
        <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-xs text-white">
          <span className={`w-1.5 h-1.5 rounded-full ${badgeColor}`} />
          <span>{badgeLabel}</span>
        </div>
      </div>

      <div className="absolute inset-0 bg-[#0d1b2a]">
        {cells && minC != null && maxC != null ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 pt-14 pb-16">
            <div
              className="w-full h-full max-h-full grid"
              style={{
                gridTemplateColumns: `repeat(${cells[0]?.length || 32}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${cells.length || 24}, minmax(0, 1fr))`,
                gap: '1px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {cells.flatMap((row, y) => row.map((v, x) => (
                <div key={`${y}-${x}`} style={{ background: tempColor(v, minC, maxC) }} />
              )))}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 px-6 text-center">
            <Icon name="thermometer" className="text-5xl mb-3 opacity-70" />
            <div className="font-semibold max-w-xs">{statusMessage}</div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end z-10 text-white/90 text-xs">
          <div className="space-y-1">
            <div className="bg-black/40 backdrop-blur px-2 py-1 rounded inline-block">
              {hasFrame && thermal ? `32×24 • min ${thermal.min_c?.toFixed?.(1)}°C • avg ${thermal.avg_c?.toFixed?.(1)}°C • max ${thermal.max_c?.toFixed?.(1)}°C` : '32×24 thermal sensor'}
            </div>
            <div className="bg-black/40 backdrop-blur px-2 py-1 rounded block">
              {statusMessage}
            </div>
          </div>
          <button
            onClick={() => setActiveTab('livefeed')}
            className="bg-black/40 hover:bg-black/60 backdrop-blur p-2 rounded transition-colors"
          >
            <Icon name="corners-out" className="text-lg" />
          </button>
        </div>
      </div>
    </div>
  );
}
