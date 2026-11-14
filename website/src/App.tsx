import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { SurvivorModal } from './components/SurvivorModal';
import { Dashboard } from './pages/Dashboard';
import { LiveFeedPage } from './pages/LiveFeedPage';
import { DetectionsPage } from './pages/DetectionsPage';
import { MapPage } from './pages/MapPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppStore } from './stores/appStore';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  const { activeTab, modalOpen } = useAppStore();

  // Connect to local AERIS backend (same host/port). No simulated data fallback.
  useWebSocket();

  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [modalOpen]);

  return (
    <div className="h-screen w-screen flex text-sm font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-100">
        <Header />
        <div className="flex-1 overflow-y-auto lg:overflow-hidden p-4 lg:p-6 scroll-smooth">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'livefeed' && <LiveFeedPage />}
          {activeTab === 'detections' && <DetectionsPage />}
          {activeTab === 'map' && <MapPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </div>
      </main>
      <SurvivorModal />
    </div>
  );
}

export default App;
