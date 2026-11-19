import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import BookingModal from './components/BookingModal.tsx';
import CabinetView from './components/CabinetView.tsx';
import Header from './components/Header.tsx';
import HistoryView from './components/HistoryView.tsx';
import HomeView from './components/HomeView.tsx';
import { OfflineIndicator } from './components/PWAInstallButton.tsx';
import RemindersView from './components/RemindersView.tsx';
import SecretAdminGate from './components/SecretAdminGate.tsx';
import SplashLoader from './components/SplashLoader.tsx';
import type {
  Client,
  ClientNotification,
  MaintenanceItem,
  NavTab,
  PartCategory,
  ServiceBooking,
  ServiceCatalogItem,
  ServiceRecord,
  ThemeMode,
  Vehicle,
} from './types.ts';
import { computeMaintenanceStatus } from './utils/maintenance.ts';

const AdminDashboard = lazy(() => import('./components/AdminDashboard.tsx'));

interface BootstrapResponse {
  activeClient: Client;
  clientsSummary: { id: string; fullName: string; phone: string }[];
  vehicles: Vehicle[];
  maintenanceItems: MaintenanceItem[];
  serviceRecords: ServiceRecord[];
  bookings: ServiceBooking[];
  notifications: ClientNotification[];
  catalog: ServiceCatalogItem[];
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return 'dark';
    }
    return 'light';
  });

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [clientId, setClientId] = useState<string>(() => {
    try {
      return localStorage.getItem('avtotexnik_client_id') || 'cli-azizbek';
    } catch {
      return 'cli-azizbek';
    }
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Booking modal
  const [bookingOpen, setBookingOpen] = useState(false);
  const [preselectedService, setPreselectedService] = useState<string | undefined>(undefined);

  // Secret Admin Protocol Gate & Session
  const [secretGateOpen, setSecretGateOpen] = useState(false);
  const [adminSession, setAdminSession] = useState<{ token: string; operatorId: string } | null>(null);
  const [, setCopyrightTaps] = useState(0);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem('avtotexnik_theme', next);
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  }, []);

  const loadBootstrap = useCallback(async (targetClientId: string) => {
    const cacheKey = `avtotexnik_offline_cache_${targetClientId}`;
    try {
      const res = await fetch(`/api/bootstrap?clientId=${encodeURIComponent(targetClientId)}`);
      if (!res.ok) {
        throw new Error('Server javob bermadi');
      }
      const payload = (await res.json()) as BootstrapResponse;
      setData(payload);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(payload));
      } catch {
        // ignore storage quota
      }
      setSelectedVehicleId((prev) =>
        payload.vehicles.some((v) => v.id === prev) ? prev : payload.vehicles[0]?.id || '',
      );
      setLoadError('');
    } catch {
      try {
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as BootstrapResponse;
          setData(cached);
          setSelectedVehicleId((prev) =>
            cached.vehicles.some((v) => v.id === prev) ? prev : cached.vehicles[0]?.id || '',
          );
          setLoadError('');
          return;
        }
      } catch {
        // ignore cache parse errors
      }
      setLoadError("Ma'lumotlarni yuklashda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap(clientId);
  }, [clientId, loadBootstrap]);

  // Covert keyboard shortcut Ctrl+Shift+A for authorized operator convenience
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSecretGateOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSwitchClient(nextId: string) {
    setClientId(nextId);
    try {
      localStorage.setItem('avtotexnik_client_id', nextId);
    } catch {
      // ignore
    }
  }

  async function handleUpdateOdometer(vehicleId: string, nextKm: number) {
    const res = await fetch(`/api/vehicles/${vehicleId}/odometer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentKm: nextKm }),
    });
    if (res.ok) {
      await loadBootstrap(clientId);
    }
  }

  async function handleCompleteTask(vehicleId: string, maintenanceItemId: string) {
    const res = await fetch(`/api/vehicles/${vehicleId}/complete-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maintenanceItemId }),
    });
    if (res.ok) {
      await loadBootstrap(clientId);
    }
  }

  async function handleAddMaintenance(payload: {
    vehicleId: string;
    name: string;
    category: PartCategory;
    intervalKm: number;
    intervalMonths: number;
    lastServiceKm: number;
    lastServiceDate: string;
    estimatedCostUzs: number;
    notes?: string;
  }) {
    const res = await fetch('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadBootstrap(clientId);
    }
  }

  async function handleDeleteMaintenance(id: string) {
    const res = await fetch(`/api/maintenance/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadBootstrap(clientId);
    }
  }

  function handleOpenBooking(serviceTitle?: string) {
    setPreselectedService(serviceTitle);
    setBookingOpen(true);
  }

  function handleCopyrightSecretTap() {
    setCopyrightTaps((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setSecretGateOpen(true);
        return 0;
      }
      return next;
    });
    window.setTimeout(() => setCopyrightTaps(0), 1800);
  }

  async function handleAdminLockExit() {
    if (adminSession?.token) {
      fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminSession.token}` },
      }).catch(() => {});
    }
    setAdminSession(null);
  }

  const selectedVehicle = useMemo(
    () => data?.vehicles.find((v) => v.id === selectedVehicleId) || data?.vehicles[0],
    [data, selectedVehicleId],
  );

  const computedItems = useMemo(() => {
    if (!data || !selectedVehicle) return [];
    return data.maintenanceItems
      .filter((m) => m.vehicleId === selectedVehicle.id)
      .map((m) => computeMaintenanceStatus(m, selectedVehicle))
      .sort((a, b) => b.wearPercent - a.wearPercent);
  }, [data, selectedVehicle]);

  const allUrgentCount = useMemo(() => {
    if (!data) return 0;
    let count = 0;
    for (const item of data.maintenanceItems) {
      const v = data.vehicles.find((veh) => veh.id === item.vehicleId);
      if (v) {
        const computed = computeMaintenanceStatus(item, v);
        if (computed.status !== 'ok') count += 1;
      }
    }
    return count;
  }, [data]);

  if (adminSession) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 text-sm">
            Boshqaruv paneli yuklanmoqda...
          </div>
        }
      >
        <AdminDashboard
          token={adminSession.token}
          operatorId={adminSession.operatorId}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLockExit={handleAdminLockExit}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {!splashDone && <SplashLoader onComplete={() => setSplashDone(true)} />}

      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenBooking={() => handleOpenBooking()}
        urgentCount={allUrgentCount}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {loading && !data ? (
          <div className="space-y-6">
            <div className="h-64 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
              ))}
            </div>
          </div>
        ) : loadError || !data ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{loadError || 'Ma’lumot topilmadi.'}</p>
            <button
              type="button"
              onClick={() => loadBootstrap(clientId)}
              className="mt-4 min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-xl"
            >
              Qayta urinish
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView
                client={data.activeClient}
                vehicles={data.vehicles}
                selectedVehicle={selectedVehicle}
                onSelectVehicle={setSelectedVehicleId}
                computedItems={computedItems}
                records={data.serviceRecords}
                notifications={data.notifications}
                catalog={data.catalog}
                theme={theme}
                onToggleTheme={toggleTheme}
                onUpdateOdometer={handleUpdateOdometer}
                onCompleteTask={handleCompleteTask}
                onOpenBooking={handleOpenBooking}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'reminders' && (
              <RemindersView
                vehicles={data.vehicles}
                selectedVehicle={selectedVehicle}
                onSelectVehicle={setSelectedVehicleId}
                computedItems={computedItems}
                onUpdateOdometer={handleUpdateOdometer}
                onCompleteTask={handleCompleteTask}
                onAddMaintenance={handleAddMaintenance}
                onDeleteMaintenance={handleDeleteMaintenance}
                onOpenBooking={handleOpenBooking}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                records={data.serviceRecords}
                bookings={data.bookings}
                onOpenBooking={() => handleOpenBooking()}
              />
            )}

            {activeTab === 'cabinet' && (
              <CabinetView
                client={data.activeClient}
                clientsSummary={data.clientsSummary}
                vehicles={data.vehicles}
                notifications={data.notifications}
                theme={theme}
                onToggleTheme={toggleTheme}
                onSwitchClient={handleSwitchClient}
                onRefresh={() => loadBootstrap(clientId)}
              />
            )}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 pb-20 md:pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopyrightSecretTap}
              className="text-left cursor-default select-none focus:outline-none"
            >
              © 2026 AvtoTexnik. Barcha huquqlar himoyalangan.
            </button>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => setActiveTab('reminders')} className="hover:text-slate-900 dark:hover:text-white">
              Eslatmalar
            </button>
            <button type="button" onClick={() => setActiveTab('history')} className="hover:text-slate-900 dark:hover:text-white">
              Servis tarixi
            </button>
            <button type="button" onClick={() => setActiveTab('cabinet')} className="hover:text-slate-900 dark:hover:text-white">
              Shaxsiy kabinet
            </button>
          </div>
        </div>
      </footer>

      {/* Invisible Trigger Button placed across all pages for Secret Admin Access */}
      <button
        type="button"
        onClick={() => setSecretGateOpen(true)}
        tabIndex={-1}
        aria-hidden="true"
        data-stealth-trigger="true"
        className="fixed bottom-20 right-2 md:bottom-3 md:right-3 z-30 w-10 h-10 opacity-0 cursor-default focus:outline-none"
      />

      <OfflineIndicator />

      {data && (
        <BookingModal
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          clientId={data.activeClient.id}
          vehicles={data.vehicles}
          catalog={data.catalog}
          preselectedService={preselectedService}
          onCreated={() => loadBootstrap(clientId)}
        />
      )}

      <SecretAdminGate
        open={secretGateOpen}
        onClose={() => setSecretGateOpen(false)}
        onAuthenticated={(token, operatorId) => {
          setSecretGateOpen(false);
          setAdminSession({ token, operatorId });
        }}
      />
    </div>
  );
}
