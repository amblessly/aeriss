import { Icon } from '../components/Icon';
import { useAppStore } from '../stores/appStore';

function tempColor(v: number, min: number, max: number) {
  const t = max <= min ? 0.5 : Math.max(0, Math.min(1, (v - min) / (max - min)));
  const r = Math.round(255 * Math.min(1, Math.max(0, t * 1.5 - 0.25)));
  const g = Math.round(255 * Math.min(1, Math.max(0, 1 - Math.abs(t - 0.5) * 2)));
  const b = Math.round(255 * Math.min(1, Math.max(0, 1 - t * 1.2)));
  return `rgb(${r},${g},${b})`;
}

export function LiveFeedPage() {
  const { system, wsConnected } = useAppStore();
  const thermal = system?.thermal;
  const sensor = system?.sensor;
  const heatmap = thermal?.heatmap as number[][] | null | undefined;
  const minC = typeof thermal?.min_c === 'number' ? thermal.min_c : undefined;
  const maxC = typeof thermal?.max_c === 'number' ? thermal.max_c : undefined;
  const available = !!(heatmap && minC != null && maxC != null);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">Live Thermal Feed (MLX90640)</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${sensor?.connected ? 'bg-green-400' : 'bg-amber-400'}`} />
          <span className={sensor?.connected ? 'text-aeris' : 'text-slate-500'}>
            {!wsConnected ? 'Backend disconnected' : sensor?.connected ? 'Sensor connected' : 'Sensor disconnected'}
          </span>
        </div>
      </div>

      <div className="flex-1 panel-card flex items-center justify-center bg-[#0d1b2a] relative overflow-hidden p-4">
        {available ? (
          <div className="w-full h-full max-w-4xl max-h-full flex flex-col">
            <div
              className="flex-1 grid"
              style={{
                gridTemplateColumns: `repeat(${heatmap![0]?.length || 32}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${heatmap!.length || 24}, minmax(0, 1fr))`,
                gap: '1px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {heatmap!.flatMap((row, y) => row.map((v, x) => (
                <div key={`${y}-${x}`} title={`${v.toFixed(1)} °C`} style={{ background: tempColor(v, minC!, maxC!) }} />
              )))}
            </div>
            <div className="mt-3 text-xs text-slate-300 flex justify-between">
              <span>Min: {minC!.toFixed(1)} °C</span>
              <span>Avg: {Number(thermal?.avg_c).toFixed(1)} °C</span>
              <span>Max: {maxC!.toFixed(1)} °C</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <Icon name="thermometer" className="text-4xl text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-300 mb-2">No Live Thermal Data</h3>
            <p className="text-sm text-slate-500 max-w-md mb-2">
              {!wsConnected ? 'Not connected to the local AERIS backend.' : (sensor?.error || 'MLX90640 sensor is not connected or has not produced a valid 32×24 frame yet.')}
            </p>
            <p className="text-xs text-slate-500">No simulated or fabricated thermal readings are displayed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
