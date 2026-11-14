import { useAppStore } from '../stores/appStore';
import { Icon } from './Icon';

function wifiStatusLabel(wifi: any): 'Connected' | 'Disconnected' | 'Waiting' {
  // Initial loading: show Waiting until first real status check
  const hasChecked = !!(wifi && (wifi.last_checked_ts || (wifi.state && wifi.state !== 'unknown')));
  if (!hasChecked) return 'Waiting';

  const state = String(wifi?.state || '').toLowerCase();
  // Connected only when an actual client connection is verified (hotspot mode)
  if (wifi?.active === true || state === 'active') return 'Connected';
  // Waiting for actual client/hotspot connection (development mode) or AP waiting for client
  if (state === 'connecting' || state === 'activating') return 'Waiting';
  // Not hosting/connected as AERIS AP (inactive/not_tested/unknown after check)
  return 'Disconnected';
}

function wifiSignalStrength(wifi: any, status: 'Connected' | 'Disconnected' | 'Waiting'): 'Weak' | 'Fair' | 'Strong' | 'N/A' {
  const dbm = typeof wifi?.signal_dbm === 'number' ? wifi.signal_dbm : null;
  const pct = typeof wifi?.signal_percent === 'number' ? wifi.signal_percent : null;
  if (status !== 'Connected' && dbm == null && pct == null) return 'N/A';
  if (dbm != null) {
    if (dbm >= -55) return 'Strong';
    if (dbm >= -70) return 'Fair';
    return 'Weak';
  }
  if (pct != null) {
    if (pct >= 67) return 'Strong';
    if (pct >= 34) return 'Fair';
    return 'Weak';
  }
  return 'N/A';
}

function loraConnectionStatus(tx: any): 'Connected' | 'Disconnected' | 'Connecting' {
  if (!tx) return 'Connecting';
  if (tx.initialized && (tx.chipset_version != null || tx.last_tx_ok === true || tx.packets_sent_ok > 0)) return 'Connected';
  if (tx.enabled === false) return 'Disconnected';
  if (tx.initialized === false && (tx.packets_sent_failed > 0 || tx.last_error)) return 'Disconnected';
  // Initial/unknown before first real check result
  if (tx.initialized === undefined) return 'Connecting';
  return 'Connecting';
}

function loraCommunicationStatus(tx: any, conn: 'Connected' | 'Disconnected' | 'Connecting'): 'Ready' | 'Transmitting' | 'Failed' {
  if (!tx) return conn === 'Connecting' ? 'Ready' : 'Failed';
  if (conn === 'Connected') {
    // We don't track in-flight TX; show Ready when operational
    return 'Ready';
  }
  if (conn === 'Connecting') return 'Ready';
  if (tx.last_tx_ok === false || tx.last_error) return 'Failed';
  return 'Failed';
}

function StatusBadge({ status }: { status: 'Connected' | 'Disconnected' | 'Waiting' | 'Connecting' | 'Ready' | 'Transmitting' | 'Failed' }) {
  const ok = status === 'Connected' || status === 'Ready' || status === 'Transmitting';
  const warn = status === 'Waiting' || status === 'Connecting';
  const cls = ok ? 'text-green-700 bg-green-100' : warn ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';
  const dot = ok ? 'bg-green-500' : warn ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

export function CommLinkHealth() {
  const wifi = useAppStore((s) => s.system?.wifi);
  const tx = useAppStore((s) => s.system?.lora?.transmitter);
  const wsConnected = useAppStore((s) => s.wsConnected);

  const wifiStatus = wifiStatusLabel(wifi);
  // LoRa/Wi-Fi labels are derived from actual backend-reported states; websocket reconnects do not redefine radio/AP state.
  void wsConnected;
  // Show connection details only for a verified connected AERIS hotspot client; otherwise N/A.
  // Never display local/dev Wi-Fi networks, unrelated IPs, or the Pi gateway as client IP.
  const ssid = wifiStatus === 'Connected' && wifi?.ssid ? String(wifi.ssid) : 'N/A';
  const ip = wifiStatus === 'Connected' && wifi?.ip ? String(wifi.ip) : 'N/A';
  const signal = wifiStatus === 'Connected' ? wifiSignalStrength(wifi, wifiStatus) : 'N/A';

  const loraConn = loraConnectionStatus(tx);
  const loraComm = loraCommunicationStatus(tx, loraConn);
  const commCls = loraComm === 'Ready' || loraComm === 'Transmitting' ? 'text-green-700' : loraComm === 'Failed' ? 'text-red-700' : 'text-amber-700';

  return (
    <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
      <div className="panel-card flex-1 p-4">
        <h2 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center justify-between">
          Connection & Telemetry
          <Icon name="broadcast" className="text-lg" />
        </h2>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 mb-3">
          <div className="flex justify-between items-center mb-3">
            <div className="font-semibold text-xs text-slate-700">Wi-Fi Communication</div>
            <StatusBadge status={wifiStatus} />
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Connection Status</span>
              <span className={`font-medium ${wifiStatus === 'Connected' ? 'text-green-700' : wifiStatus === 'Waiting' ? 'text-amber-700' : 'text-red-700'}`}>{wifiStatus}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Connected SSID</span>
              <span className="font-medium text-slate-800">{ssid}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Signal Strength</span>
              <span className="font-medium text-slate-800">{signal}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Local IP Address</span>
              <span className="font-medium text-slate-800 font-mono">{ip}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <div className="flex justify-between items-center mb-3">
            <div className="font-semibold text-xs text-slate-700">LoRa 02</div>
            <StatusBadge status={loraConn} />
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Connection Status</span>
              <span className={`font-medium ${loraConn === 'Connected' ? 'text-green-700' : loraConn === 'Connecting' ? 'text-amber-700' : 'text-red-700'}`}>{loraConn}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Module Name</span>
              <span className="font-medium text-slate-800">LoRa 02</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500">Communication Status</span>
              <span className={`font-medium ${commCls}`}>{loraComm}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
