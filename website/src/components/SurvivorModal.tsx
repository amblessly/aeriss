import { useAppStore } from '../stores/appStore';
import { Icon, IconFill } from './Icon';

export function SurvivorModal() {
  const { modalOpen, setModalOpen, acknowledgeAlert, alertAcknowledged, detections, system } = useAppStore();

  if (!modalOpen) return null;

  const currentDetection = detections.find((d) => d.status === 'new') || detections[0];
  const thermal = currentDetection?.thermal || {
    min_c: system?.thermal?.min_c,
    avg_c: system?.thermal?.avg_c,
    max_c: system?.thermal?.max_c,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={() => setModalOpen(false)}
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col relative z-10 border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex justify-between items-start shrink-0">
          <div className="flex items-center gap-3 text-danger">
            <IconFill name="warning-circle" className="text-2xl sm:text-3xl" />
            <div>
              <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wide">Thermal Presence Event</h2>
              <div className="text-[10px] text-slate-500 font-mono">Event ID: {currentDetection?.id || 'N/A'}</div>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded"
          >
            <Icon name="x" className="text-xl" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Thermal Source</h3>
              <div className="bg-slate-900 rounded-xl aspect-video overflow-hidden border border-slate-200 relative flex items-center justify-center text-slate-300">
                <div className="text-center p-4">
                  <Icon name="thermometer" className="text-4xl mb-2 opacity-70" />
                  <div className="text-sm font-medium">MLX90640 32×24 Thermal Data</div>
                  <div className="text-xs text-slate-400 mt-1">Live heatmap shown in dashboard feed. No RGB/stock imagery used.</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 sm:p-5 border border-slate-200 flex flex-col">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-4">
                <IconFill name="map-pin" /> Event Data
              </h3>

              <div className="space-y-4 flex-1">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Time</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">{currentDetection?.timestamp || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Detection Type</div>
                  <div className="text-sm font-semibold text-slate-800">{currentDetection?.detection_type === 'thermal_presence' ? 'Thermal presence (heuristic)' : (currentDetection?.detection_type || 'N/A')}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Location (GPS)</div>
                    <div className="text-sm font-semibold text-slate-800">{currentDetection?.lat != null && currentDetection?.lng != null ? `${currentDetection.lat}, ${currentDetection.lng}` : 'Unavailable'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Distance/Altitude</div>
                    <div className="text-sm font-semibold text-slate-800">Unavailable</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Sensor</div>
                  <div className="text-sm font-semibold text-slate-800">{system?.sensor?.connected ? 'MLX90640 connected' : 'MLX90640 disconnected/unavailable'}</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-[500px]">
                <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 px-3">Metric</th>
                    <th className="py-2 px-3">Value</th>
                    <th className="py-2 px-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-3 font-medium text-slate-700">Heuristic confidence</td>
                    <td className="py-3 px-3">{currentDetection ? `${Number(currentDetection.confidence || 0).toFixed(1)}%` : 'N/A'}</td>
                    <td className="py-3 px-3 text-slate-500">Presence heuristic score, not ML classification confidence</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-medium text-slate-700">Thermal min / avg / max</td>
                    <td className="py-3 px-3">{thermal?.min_c != null ? `${Number(thermal.min_c).toFixed(1)} / ${Number(thermal.avg_c).toFixed(1)} / ${Number(thermal.max_c).toFixed(1)} °C` : 'N/A'}</td>
                    <td className="py-3 px-3 text-slate-500">From actual MLX90640 frame when available</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-medium text-slate-700">LoRa transmission</td>
                    <td className="py-3 px-3">{system?.lora?.transmitter?.last_tx_ok === true ? 'Confirmed TX' : system?.lora?.transmitter?.last_tx_ok === false ? 'TX failed' : 'No TX record'}</td>
                    <td className="py-3 px-3 text-slate-500">Reception/RSSI/SNR only if measured by receiver (not fabricated)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 italic">
              <Icon name="info" className="inline mr-1" /> Thermal presence detection is based on real MLX90640 readings and threshold heuristics. This is not biometric human identification or medical vital-sign measurement.
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex flex-col sm:flex-row gap-3 sm:gap-4 shrink-0">
          <button
            onClick={() => {
              acknowledgeAlert();
            }}
            className={`flex-1 text-white font-semibold py-3 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 ${
              alertAcknowledged ? 'bg-slate-400 cursor-not-allowed' : 'bg-aeris hover:bg-aeris-dark'
            }`}
            disabled={alertAcknowledged}
          >
            {alertAcknowledged ? (
              <Icon name="check-circle" className="text-lg" />
            ) : (
              <Icon name="check" className="text-lg" />
            )}
            <span>{alertAcknowledged ? 'Acknowledged' : 'Acknowledge Event'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
