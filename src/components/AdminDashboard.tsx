import {
  Activity,
  Bell,
  Boxes,
  CalendarClock,
  Download,
  FilePlus2,
  KeyRound,
  Lock,
  Moon,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Sun,
  Unlock,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminOverviewPayload, ServiceBooking, ThemeMode } from '../types.ts';
import { computeMaintenanceStatus, formatCurrencyUzs, formatKm } from '../utils/maintenance.ts';

interface AdminDashboardProps {
  token: string;
  operatorId: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onLockExit: () => void;
}

type AdminSection = 'overview' | 'bookings' | 'clients' | 'inventory' | 'security';

const BOOKING_LABELS: Record<ServiceBooking['status'], string> = {
  pending: 'Kutilmoqda',
  in_progress: 'Jarayonda',
  completed: 'Yakunlandi',
  cancelled: 'Bekor qilindi',
};

export default function AdminDashboard({
  token,
  operatorId,
  theme,
  onToggleTheme,
  onLockExit,
}: AdminDashboardProps) {
  const [section, setSection] = useState<AdminSection>('overview');
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(900);
  const [masterDraft, setMasterDraft] = useState<Record<string, string>>({});
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Direct service act creation
  const [actVehicleId, setActVehicleId] = useState('');
  const [actService, setActService] = useState('');
  const [actMaster, setActMaster] = useState('Sardorbek Xolmatov');
  const [actKm, setActKm] = useState('');
  const [actCost, setActCost] = useState('450000');

  // Security rotation controls
  const [newPin, setNewPin] = useState('');
  const [newPhrase, setNewPhrase] = useState('');
  const [savingSecurity, setSavingSecurity] = useState(false);

  function showToast(msg: string) {
    setFeedbackMsg(msg);
    window.setTimeout(() => setFeedbackMsg(''), 3500);
  }

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLockExit();
        return;
      }
      const payload = (await res.json()) as AdminOverviewPayload;
      setData(payload);
      setActVehicleId((prev) => prev || payload.vehicles[0]?.id || '');
      setRemainingSeconds(Math.max(0, Math.floor((payload.sessionExpiresAt - Date.now()) / 1000)));
      setError('');
    } catch {
      setError("Admin ma'lumotlarini yuklashda xatolik.");
    } finally {
      setLoading(false);
    }
  }, [token, onLockExit]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          onLockExit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onLockExit();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onLockExit]);

  async function handleUpdateBooking(bookingId: string, status: ServiceBooking['status']) {
    const assignedMaster = masterDraft[bookingId];
    const res = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status, assignedMaster }),
    });
    if (res.ok) {
      showToast('Buyurtma holati yangilandi.');
      await fetchOverview();
    }
  }

  async function handleAdjustStock(partId: string, nextQty: number) {
    const res = await fetch(`/api/admin/inventory/${partId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stockQty: Math.max(0, nextQty) }),
    });
    if (res.ok) {
      await fetchOverview();
    }
  }

  async function handleSendReminder(clientId: string, vehicleId: string, vehicleLabel: string) {
    const res = await fetch(`/api/admin/clients/${clientId}/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        vehicleId,
        title: `${vehicleLabel}: Texnik ko'rik eslatmasi`,
        message: `Hurmatli mijoz, ${vehicleLabel} avtomobilingiz moyi va ehtiyot qismlarini tekshirtirish tavsiya etiladi.`,
      }),
    });
    if (res.ok) {
      showToast(`${vehicleLabel} egasiga eslatma yuborildi.`);
      await fetchOverview();
    }
  }

  async function handleCreateServiceAct(e: FormEvent) {
    e.preventDefault();
    if (!actVehicleId || !actService.trim()) return;
    const res = await fetch('/api/admin/service-records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        vehicleId: actVehicleId,
        servicesPerformed: [actService.trim()],
        partsReplaced: [actService.trim()],
        technicianName: actMaster.trim() || 'Sardorbek Xolmatov',
        odometerKm: Number(actKm) || undefined,
        totalCostUzs: Number(actCost) || 350000,
      }),
    });
    if (res.ok) {
      setActService('');
      showToast('Yangi servis akti mijoz tarixiga yozildi.');
      await fetchOverview();
    }
  }

  async function handleSecurityUpdate(payload: {
    newPin?: string;
    newPhrase?: string;
    totpEnabled?: boolean;
    regenerateTotpSecret?: boolean;
  }) {
    setSavingSecurity(true);
    try {
      const res = await fetch('/api/admin/security-config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewPin('');
        setNewPhrase('');
        showToast('Xavfsizlik sozlamalari saqlandi.');
        await fetchOverview();
      }
    } finally {
      setSavingSecurity(false);
    }
  }

  async function handleUnlockIps() {
    const res = await fetch('/api/admin/security/unlock-ips', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      showToast('Barcha IP bloklari olib tashlandi.');
      await fetchOverview();
    }
  }

  async function handleExportZip() {
    const res = await fetch('/api/admin/export-zip', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      showToast('ZIP arxiv yaratishda xatolik.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'avtotexnik-project.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Loyiha kodlari ZIP formatida yuklab olindi.');
  }

  const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const secs = String(remainingSeconds % 60).padStart(2, '0');

  const navItems: { id: AdminSection; label: string; icon: typeof Activity }[] = [
    { id: 'overview', label: 'Umumiy holat', icon: Activity },
    { id: 'bookings', label: 'Buyurtmalar', icon: CalendarClock },
    { id: 'clients', label: 'Mijozlar va Avto', icon: Users },
    { id: 'inventory', label: 'Ombor va Qismlar', icon: Boxes },
    { id: 'security', label: 'Xavfsizlik va 2FA', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-64 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-4 lg:p-5 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center justify-between lg:block pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white">
                AvtoTexnik Admin
              </p>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                {operatorId} · {mins}:{secs}
              </p>
            </div>
            <button
              type="button"
              onClick={onLockExit}
              className="lg:hidden min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-xl inline-flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Qulflash
            </button>
          </div>

          <nav className="mt-4 flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0" aria-label="Admin bo'limlari">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2.5 whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-slate-900 dark:bg-amber-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleExportZip}
            className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>Kodni yuklash (.zip)</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="min-h-[42px] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-2"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Kunduzgi rejim' : "Qorong'u rejim"}</span>
          </button>

          <button
            type="button"
            onClick={onLockExit}
            className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Lock className="w-4 h-4" aria-hidden="true" />
            <span>Tezkor qulflash (Esc)</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Himoyalangan boshqaruv / {navItems.find((n) => n.id === section)?.label}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              {navItems.find((n) => n.id === section)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {feedbackMsg && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {feedbackMsg}
              </span>
            )}
            <button
              type="button"
              onClick={handleExportZip}
              className="lg:hidden min-h-[40px] px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>.zip</span>
            </button>
            <button
              type="button"
              onClick={fetchOverview}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Yangilash
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : data ? (
          <>
            {section === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Mijozlar / Avto</p>
                    <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
                      {data.stats.totalClients} / {data.stats.totalVehicles}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Faol buyurtmalar</p>
                    <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                      {data.stats.activeBookings}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Muddati o‘tgan qismlar</p>
                    <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                      {data.stats.overdueItemsCount}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Jami tushum</p>
                    <p className="mt-1.5 font-mono text-lg sm:text-xl font-bold tabular-nums">
                      {formatCurrencyUzs(data.stats.monthlyRevenueUzs)}
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
                  <h2 className="font-display text-lg font-semibold">Shoshilinch texnik ogohlantirishlar</h2>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.vehicles.map((v) => {
                      const items = data.maintenanceItems
                        .filter((m) => m.vehicleId === v.id)
                        .map((m) => computeMaintenanceStatus(m, v))
                        .filter((c) => c.status !== 'ok');

                      if (items.length === 0) return null;
                      const owner = data.clients.find((c) => c.id === v.clientId);

                      return (
                        <div key={v.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {v.brand} {v.model} ({v.plateNumber}) — {owner?.fullName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {items.map((i) => `${i.name} (${i.remainingKm > 0 ? formatKm(i.remainingKm) : "muddati o'tgan"})`).join(' · ')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSendReminder(v.clientId, v.id, `${v.brand} ${v.model}`)}
                            className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                          >
                            <Send className="w-3.5 h-3.5" aria-hidden="true" />
                            Eslatma yuborish
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {section === 'bookings' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                {data.bookings.map((b) => (
                  <div key={b.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        #{b.id.toUpperCase()} · {b.preferredDate} {b.preferredTime} · {BOOKING_LABELS[b.status]}
                      </p>
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        {b.clientName} ({b.clientPhone}) — {b.vehicleLabel} ({b.plateNumber})
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {b.requestedServices.join(', ')}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <input
                        type="text"
                        placeholder="Usta ismi"
                        value={masterDraft[b.id] ?? b.assignedMaster ?? ''}
                        onChange={(e) => setMasterDraft((p) => ({ ...p, [b.id]: e.target.value }))}
                        className="w-36 min-h-[38px] px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                      />
                      {b.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateBooking(b.id, 'in_progress')}
                          className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-700 rounded-xl"
                        >
                          Qabul qilish
                        </button>
                      )}
                      {b.status !== 'completed' && b.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateBooking(b.id, 'completed')}
                          className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                        >
                          Yakunlash
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {section === 'clients' && (
              <div className="space-y-6">
                {/* Direct Service Record Form */}
                <form
                  onSubmit={handleCreateServiceAct}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <FilePlus2 className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <h2 className="font-display text-lg font-semibold">Yangi servis akti kiritish</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <select
                      value={actVehicleId}
                      onChange={(e) => setActVehicleId(e.target.value)}
                      className="min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                    >
                      {data.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.brand} {v.model} ({v.plateNumber})
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      required
                      placeholder="Bajarilgan ish / qism"
                      value={actService}
                      onChange={(e) => setActService(e.target.value)}
                      className="lg:col-span-2 min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                    />

                    <input
                      type="text"
                      placeholder="Usta F.I.Sh"
                      value={actMaster}
                      onChange={(e) => setActMaster(e.target.value)}
                      className="min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                    />

                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Narx (so'm)"
                        value={actCost}
                        onChange={(e) => setActCost(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                      />
                      <button
                        type="submit"
                        className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shrink-0"
                      >
                        Saqlash
                      </button>
                    </div>
                  </div>
                </form>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-3.5 px-4 font-medium">Mijoz</th>
                        <th className="py-3.5 px-4 font-medium">Telefon</th>
                        <th className="py-3.5 px-4 font-medium">Avtomobillar</th>
                        <th className="py-3.5 px-4 font-medium text-right">Harakat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.clients.map((c) => {
                        const cars = data.vehicles.filter((v) => v.clientId === c.id);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3.5 px-4 font-medium">{c.fullName}</td>
                            <td className="py-3.5 px-4 font-mono text-xs">{c.phone}</td>
                            <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                              {cars.map((v) => `${v.brand} ${v.model} (${formatKm(v.currentKm)})`).join(', ')}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {cars[0] && (
                                <button
                                  type="button"
                                  onClick={() => handleSendReminder(c.id, cars[0].id, `${cars[0].brand} ${cars[0].model}`)}
                                  className="min-h-[34px] px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg inline-flex items-center gap-1"
                                >
                                  <Bell className="w-3.5 h-3.5" />
                                  Eslatish
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {section === 'inventory' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-3.5 px-4 font-medium">Artikul</th>
                      <th className="py-3.5 px-4 font-medium">Nomi</th>
                      <th className="py-3.5 px-4 font-medium text-right">Narxi</th>
                      <th className="py-3.5 px-4 font-medium text-right">Qoldiq</th>
                      <th className="py-3.5 px-4 font-medium text-right">Boshqarish</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.inventory.map((part) => {
                      const low = part.stockQty <= part.minThreshold;
                      return (
                        <tr key={part.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{part.sku}</td>
                          <td className="py-3.5 px-4">
                            <span className="font-medium block">{part.name}</span>
                            <span className="text-xs text-slate-500">{part.brand}</span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-right tabular-nums">
                            {formatCurrencyUzs(part.unitPriceUzs)}
                          </td>
                          <td
                            className={`py-3.5 px-4 font-mono text-sm font-semibold text-right tabular-nums ${
                              low ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {part.stockQty} dona {low ? '(Kam)' : ''}
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleAdjustStock(part.id, part.stockQty - 1)}
                              className="min-h-[34px] min-w-[34px] px-2.5 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded-lg"
                            >
                              -1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustStock(part.id, part.stockQty + 5)}
                              className="min-h-[34px] min-w-[34px] px-2.5 py-1 text-xs font-mono bg-slate-900 dark:bg-amber-600 text-white rounded-lg"
                            >
                              +5
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {section === 'security' && (
              <div className="space-y-6">
                {/* Security Rotation & 2FA Controls */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      <h2 className="font-display text-lg font-semibold">PIN va Maxfiy Frazani Almashtirish</h2>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label htmlFor="rot-pin" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Yangi Master PIN (kamida 6 ta belgi)
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="rot-pin"
                            type="password"
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                            placeholder="Yangi PIN"
                            className="flex-1 min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                          />
                          <button
                            type="button"
                            disabled={savingSecurity || newPin.trim().length < 6}
                            onClick={() => handleSecurityUpdate({ newPin })}
                            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-amber-600 rounded-xl disabled:opacity-50"
                          >
                            Yangilash
                          </button>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="rot-phrase" className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Yangi Xavfsizlik Frazasi (kamida 5 ta belgi)
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="rot-phrase"
                            type="password"
                            value={newPhrase}
                            onChange={(e) => setNewPhrase(e.target.value)}
                            placeholder="Yangi maxfiy fraza"
                            className="flex-1 min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                          />
                          <button
                            type="button"
                            disabled={savingSecurity || newPhrase.trim().length < 5}
                            onClick={() => handleSecurityUpdate({ newPhrase })}
                            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-amber-600 rounded-xl disabled:opacity-50"
                          >
                            Yangilash
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Bloklangan IP manzillar: <strong className="font-mono">{data.securityConfig.lockedIpCount}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={handleUnlockIps}
                          className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl inline-flex items-center gap-1.5"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Bloklarni ochish
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        <h2 className="font-display text-lg font-semibold">Dinamik TOTP 2FA</h2>
                      </div>
                      <button
                        type="button"
                        disabled={savingSecurity}
                        onClick={() => handleSecurityUpdate({ totpEnabled: !data.securityConfig.totpEnabled })}
                        className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-xl text-white transition-colors ${
                          data.securityConfig.totpEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        {data.securityConfig.totpEnabled ? '2FA Yoqilgan (O‘chirish)' : '2FA ni yoqish'}
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Google Authenticator yoki Authy ilovasiga quyidagi maxfiy kalitni kiriting. Yoqilganda, admin kirishida har 30 soniyada o‘zgaruvchi 6 xonali kod so‘raladi.
                    </p>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Secret kalit:</span>
                        <span className="font-semibold text-slate-900 dark:text-white break-all">{data.securityConfig.totpSecret}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Joriy 6 xonali kod:</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 text-sm tracking-widest">
                          {data.securityConfig.currentTotpPreview}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={savingSecurity}
                      onClick={() => handleSecurityUpdate({ regenerateTotpSecret: true })}
                      className="min-h-[38px] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Yangi TOTP kalit yaratish
                    </button>
                  </div>
                </div>

                {/* Audit Logs */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                  {data.securityLogs.map((log) => (
                    <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <span
                            className={
                              log.severity === 'critical'
                                ? 'text-red-600 dark:text-red-400'
                                : log.severity === 'warning'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            [{log.severity.toUpperCase()}]
                          </span>
                          <span>{log.event}</span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{log.details}</p>
                      </div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400 sm:text-right shrink-0">
                        <p>{log.actor} · {log.ipAddress}</p>
                        <p>{new Date(log.timestamp).toLocaleString('uz-UZ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
