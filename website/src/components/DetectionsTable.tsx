import { useAppStore } from '../stores/appStore';
import { Icon, IconFill } from './Icon';

function fmtCoord(v: number | null | undefined, suffixPos: string, suffixNeg: string) {
  if (v == null || Number.isNaN(v)) return 'N/A';
  const s = v >= 0 ? suffixPos : suffixNeg;
  return `${Math.abs(v).toFixed(4)}° ${s}`;
}

export function DetectionsTable() {
  const { detections, alertAcknowledged, setModalOpen, setActiveTab, system } = useAppStore();
  const newCount = detections.filter(d => d.status === 'new').length;

  return (
    <div className="lg:col-span-12 panel-card overflow-hidden flex flex-col">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Detection Events</h3>
          {!alertAcknowledged && newCount > 0 ? (
            <span className="bg-danger text-white text-xs px-2 py-0.5 rounded-full font-bold">{newCount} New</span>
          ) : (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-bold">
              {detections.length ? 'Logged' : 'No events'}
            </span>
          )}
        </div>
        <button
          onClick={() => setActiveTab('detections')}
          className="text-xs text-aeris font-semibold hover:text-aeris-dark flex items-center gap-1 transition-colors"
        >
          View All <Icon name="arrow-right" />
        </button>
      </div>

      <div className="flex-1 overflow-auto -mx-5 px-5">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="text-[10px] text-slate-400 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-sm">
            <tr>
              <th className="py-3 px-4 font-semibold">Source</th>
              <th className="py-3 px-4 font-semibold">Time</th>
              <th className="py-3 px-4 font-semibold">Type</th>
              <th className="py-3 px-4 font-semibold hidden md:table-cell">Thermal (min/avg/max)</th>
              <th className="py-3 px-4 font-semibold hidden sm:table-cell">Location</th>
              <th className="py-3 px-4 font-semibold hidden md:table-cell">Confidence</th>
              <th className="py-3 px-4 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {detections.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 px-4 text-center text-slate-500">
                  {system?.sensor?.connected ? 'No thermal presence events recorded yet.' : 'No detections. MLX90640 sensor is disconnected or unavailable.'}
                </td>
              </tr>
            ) : detections.map((detection) => (
              <tr
                key={detection.id}
                className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                  detection.status === 'new' && !alertAcknowledged ? 'bg-red-50' : ''
                }`}
                onClick={() => setModalOpen(true)}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Icon name="thermometer" />
                    <span className="font-mono text-[10px]">{detection.source || 'mlx90640'}</span>
                  </div>
                </td>
                <td className="py-3 px-4 font-medium">{detection.timestamp}</td>
                <td className="py-3 px-4 text-danger font-medium">
                  <IconFill name="person" className="inline mr-1" /> {detection.detection_type === 'thermal_presence' ? 'Thermal Presence' : 'Detection'}
                </td>
                <td className="py-3 px-4 font-mono text-slate-500 hidden md:table-cell">
                  {detection.thermal?.min_c != null ? `${Number(detection.thermal.min_c).toFixed(1)} / ${Number(detection.thermal.avg_c).toFixed(1)} / ${Number(detection.thermal.max_c).toFixed(1)} °C` : 'N/A'}
                </td>
                <td className="py-3 px-4 font-mono text-slate-500 hidden sm:table-cell">
                  {detection.lat != null && detection.lng != null ? `${fmtCoord(detection.lat, 'N', 'S')}, ${fmtCoord(detection.lng, 'E', 'W')}` : 'N/A'}
                </td>
                <td className="py-3 px-4 hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <span>{Number(detection.confidence || 0).toFixed(1)}%</span>
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full">
                      <div className="h-1.5 bg-aeris rounded-full" style={{ width: `${Math.max(0, Math.min(100, Number(detection.confidence || 0)))}%` }} />
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  {detection.status === 'new' && !alertAcknowledged ? (
                    <span className="inline-block px-2.5 py-1 bg-danger-light text-danger border border-danger/20 rounded font-bold text-[10px] uppercase tracking-wide animate-pulse">
                      New
                    </span>
                  ) : (
                    <span className="inline-block px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded font-bold text-[10px] uppercase tracking-wide">
                      Logged
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-2 px-1 text-[10px] text-slate-500">Note: Thermal presence heuristic (MLX90640). Not biometric human identification. GPS/distance unavailable unless a positioning source is connected.</div>
    </div>
  );
}
