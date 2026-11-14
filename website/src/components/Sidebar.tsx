import { useAppStore } from '../stores/appStore';
import { Icon, IconFill } from './Icon';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'squares-four' as const },
  { id: 'livefeed', label: 'Live Feed', icon: 'video-camera' as const, badge: 'LIVE' },
  { id: 'detections', label: 'Detections', icon: 'crosshair' as const, hasAlert: true },
  { id: 'map', label: 'Map', icon: 'map-trifold' as const },
];

function badgeFor(ok: boolean | null, okLabel = 'Connected', badLabel = 'Disconnected') {
  if (ok === true) return { text: okLabel, cls: 'bg-green-100 text-green-700' };
  if (ok === false) return { text: badLabel, cls: 'bg-red-100 text-red-700' };
  return { text: 'Unknown', cls: 'bg-slate-100 text-slate-600' };
}

export function Sidebar() {
  const { activeTab, setActiveTab, alertAcknowledged, sidebarOpen, setSidebarOpen, environment, system } = useAppStore();

  const getEnvironmentIcon = (condition: string) => {
    if (condition.includes('Rain')) return 'cloud';
    if (condition.includes('Overcast')) return 'cloud';
    if (condition.includes('Clear') || condition.includes('Sunny')) return 'cloud-sun';
    return 'cloud-sun';
  };

  const sensor = system?.sensor;
  const loraTx = system?.lora?.transmitter;
  const wifi = system?.wifi;

  const mlxConnected = system ? !!sensor?.connected : null;
  const loraConnected = system ? !!(loraTx?.initialized && (loraTx?.chipset_version != null || loraTx?.last_tx_ok === true)) : null;
  const wifiActive = system ? (wifi?.active === true || String(wifi?.state || '').toLowerCase() === 'active') : null;

  const mlx = badgeFor(mlxConnected);
  const lora = badgeFor(loraConnected);
  const wifiBadge = wifiActive === true
    ? { text: 'Active', cls: 'bg-green-100 text-green-700' }
    : wifiActive === false
      ? { text: 'Inactive', cls: 'bg-red-100 text-red-700' }
      : { text: 'Unknown', cls: 'bg-slate-100 text-slate-600' };

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col z-50 transform transition-transform duration-300 lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/image/AERIS.png" alt="AERIS Logo" className="h-10 w-auto object-contain" />
            <div>
              <div className="font-bold text-lg leading-tight tracking-tight text-slate-800">AERIS</div>
              <p className="text-[9px] text-slate-500 uppercase tracking-wide">Off-Grid UAV System</p>
            </div>
          </div>
          <button
            className="lg:hidden text-slate-500 hover:text-slate-800"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="x" className="text-xl" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as typeof activeTab)}
              className={`nav-btn w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors ${
                activeTab === item.id
                  ? 'active-nav bg-slate-50 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon name={item.icon} className="text-lg" />
                <span className="font-medium">{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-green-100 text-green-700">
                  {item.badge}
                </span>
              )}
              {item.hasAlert && !alertAcknowledged && (
                <span className="bg-danger text-white text-xs px-2 py-0.5 rounded-full font-bold">1</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100 shrink-0">
          <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Hardware Status</h3>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${mlxConnected && loraConnected && wifiActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                {mlxConnected && loraConnected && wifiActive ? 'Ready' : 'Status'}
              </span>
              <IconFill name="broadcast" className="text-slate-400" />
            </div>
            <div className="font-medium text-slate-800 mb-3 text-sm">AERIS Hardware</div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500">MLX90640 Thermal Camera</span>
                <span className={`font-medium px-2 py-0.5 rounded text-[10px] ${mlx.cls}`}>{mlx.text}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500">LoRa 02</span>
                <span className={`font-medium px-2 py-0.5 rounded text-[10px] ${lora.cls}`}>{lora.text}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500">AERIS Local Wi-Fi</span>
                <span className={`font-medium px-2 py-0.5 rounded text-[10px] ${wifiBadge.cls}`}>{wifiBadge.text}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 px-2">
            <h3 className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Environment</h3>
            <div className="flex items-center gap-3">
              <IconFill name={getEnvironmentIcon(environment.condition) as any} className="text-2xl text-yellow-500" />
              <div>
                <div className="text-lg font-bold text-slate-800 leading-none">
                  {environment.temperature}°C
                </div>
                <div className="text-xs text-slate-500">{environment.condition}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
