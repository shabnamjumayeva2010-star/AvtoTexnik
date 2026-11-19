import { Bell, Car, Check, KeyRound, LogIn, Moon, Plus, Sun, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Client, ClientNotification, ThemeMode, Vehicle } from '../types.ts';
import { formatKm } from '../utils/maintenance.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface CabinetViewProps {
  client: Client;
  clientsSummary: { id: string; fullName: string; phone: string }[];
  vehicles: Vehicle[];
  notifications: ClientNotification[];
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSwitchClient: (clientId: string) => void;
  onRefresh: () => Promise<void>;
}

export default function CabinetView({
  client,
  clientsSummary,
  vehicles,
  notifications,
  theme,
  onToggleTheme,
  onSwitchClient,
  onRefresh,
}: CabinetViewProps) {
  const [loginQuery, setLoginQuery] = useState('');
  const [loginError, setLoginError] = useState('');
  const [otpPending, setOtpPending] = useState<{
    clientId: string;
    maskedPhone: string;
    demoOtpPreview: string;
  } | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showAddCar, setShowAddCar] = useState(false);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('+998 ');
  const [regBrand, setRegBrand] = useState('');
  const [regModel, setRegModel] = useState('');
  const [regPlate, setRegPlate] = useState('');
  const [regKm, setRegKm] = useState('45000');

  // Add vehicle state
  const [carBrand, setCarBrand] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carYear, setCarYear] = useState('2024');
  const [carPlate, setCarPlate] = useState('');
  const [carKm, setCarKm] = useState('12000');
  const [carOil, setCarOil] = useState('5W-30 Synthetic');
  const [submitting, setSubmitting] = useState(false);

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/clients/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: loginQuery }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Kirishda xatolik.');
        return;
      }
      setOtpPending({
        clientId: data.clientId,
        maskedPhone: data.maskedPhone,
        demoOtpPreview: data.demoOtpPreview,
      });
      setOtpInput('');
    } catch {
      setLoginError('Server bilan aloqa uzildi.');
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!otpPending) return;
    setLoginError('');
    try {
      const res = await fetch('/api/clients/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: otpPending.clientId, code: otpInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Kod noto‘g‘ri.');
        return;
      }
      setLoginQuery('');
      setOtpPending(null);
      setOtpInput('');
      onSwitchClient(data.clientId);
    } catch {
      setLoginError('Tasdiqlashda tarmoq xatosi.');
    }
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/clients/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: regName,
          phone: regPhone,
          brand: regBrand,
          model: regModel,
          plateNumber: regPlate,
          currentKm: Number(regKm) || 15000,
        }),
      });
      const data = await res.json();
      if (res.ok && data.clientId) {
        setShowRegister(false);
        setRegName('');
        setRegBrand('');
        setRegModel('');
        setRegPlate('');
        onSwitchClient(data.clientId);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddCarSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          brand: carBrand,
          model: carModel,
          year: Number(carYear),
          plateNumber: carPlate,
          currentKm: Number(carKm),
          oilType: carOil,
        }),
      });
      if (res.ok) {
        setShowAddCar(false);
        setCarBrand('');
        setCarModel('');
        setCarPlate('');
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkNotificationsRead() {
    await fetch(`/api/clients/${client.id}/notifications/read`, { method: 'POST' });
    await onRefresh();
  }

  return (
    <div className="space-y-8 pb-24 md:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Mijoz Shaxsiy Kabineti
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Profil, avtomobillar garaji, OTP himoyasi va ilova sozlamalari
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <PWAInstallButton />
          <button
            type="button"
            onClick={onToggleTheme}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex items-center gap-2"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            <span>{theme === 'dark' ? 'Kunduzgi' : "Qorong'u"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Profile & Garage */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Faol hisob</p>
                <h2 className="mt-0.5 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  {client.fullName}
                </h2>
                <p className="mt-1 text-sm font-mono text-slate-600 dark:text-slate-300">
                  {client.phone} · {client.city}
                </p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                A’zolik: {client.memberSince}
              </p>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Mening garajim ({vehicles.length})
              </h2>
              <button
                type="button"
                onClick={() => setShowAddCar((v) => !v)}
                className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Avtomobil qo‘shish
              </button>
            </div>

            {showAddCar && (
              <form onSubmit={handleAddCarSubmit} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Marka (masalan: Chevrolet)"
                    value={carBrand}
                    onChange={(e) => setCarBrand(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Model (masalan: Tracker 2)"
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Davlat raqami (01 X 123 XX)"
                    value={carPlate}
                    onChange={(e) => setCarPlate(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    required
                    placeholder="Probeg (km)"
                    value={carKm}
                    onChange={(e) => setCarKm(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    placeholder="Yili"
                    value={carYear}
                    onChange={(e) => setCarYear(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Moy turi (5W-30)"
                    value={carOil}
                    onChange={(e) => setCarOil(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCar(false)}
                    className="min-h-[40px] px-3 py-2 text-xs text-slate-600 dark:text-slate-300"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-amber-600 rounded-xl"
                  >
                    Saqlash
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {vehicles.map((v) => (
                <div key={v.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Car className="w-5 h-5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {v.brand} {v.model} ({v.year})
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                        {v.plateNumber} · {v.oilType}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                    {formatKm(v.currentKm)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column: Notifications & OTP Login / Account Switch */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  Xabarnomalar
                </h2>
              </div>
              {notifications.some((n) => !n.read) && (
                <button
                  type="button"
                  onClick={handleMarkNotificationsRead}
                  className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  O‘qildi
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Hozircha yangi xabarlar yo‘q.</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-xl border ${
                      n.read
                        ? 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800'
                        : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{n.title}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                OTP orqali kirish
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowRegister((v) => !v);
                  setOtpPending(null);
                  setLoginError('');
                }}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                {showRegister ? 'Kirishga qaytish' : 'Yangi mijoz'}
              </button>
            </div>

            {!showRegister ? (
              <>
                {!otpPending ? (
                  <form onSubmit={handleRequestOtp} className="flex gap-2">
                    <input
                      type="text"
                      value={loginQuery}
                      onChange={(e) => setLoginQuery(e.target.value)}
                      placeholder="Telefon yoki davlat raqami"
                      className="flex-1 min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-amber-600 rounded-xl inline-flex items-center gap-1.5"
                    >
                      <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                      Kod olish
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-3">
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
                      <p>
                        <strong>{otpPending.maskedPhone}</strong> raqamiga 4 xonali tasdiqlash kodi yuborildi.
                      </p>
                      <p className="mt-1 font-mono">
                        Sinov SMS/Telegram kodi: <strong>{otpPending.demoOtpPreview}</strong>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          required
                          value={otpInput}
                          onChange={(e) => setOtpInput(e.target.value)}
                          placeholder="4 xonali kod"
                          className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm font-mono tracking-widest bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl"
                      >
                        Tasdiqlash
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtpPending(null)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Raqamni o‘zgartirish
                    </button>
                  </form>
                )}

                {loginError && <p className="text-xs text-red-600 dark:text-red-400">{loginError}</p>}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Tezkor sinov hisoblari:</p>
                  <div className="flex flex-wrap gap-2">
                    {clientsSummary.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSwitchClient(c.id)}
                        className={`min-h-[36px] px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          c.id === client.id
                            ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900 dark:border-amber-600'
                            : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {c.fullName}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <input
                  type="text"
                  required
                  placeholder="To‘liq ism-familiya"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Telefon (+998 ...)"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Avto markasi"
                    value={regBrand}
                    onChange={(e) => setRegBrand(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Model"
                    value={regModel}
                    onChange={(e) => setRegModel(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Davlat raqami"
                    value={regPlate}
                    onChange={(e) => setRegPlate(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    required
                    placeholder="Probeg (km)"
                    value={regKm}
                    onChange={(e) => setRegKm(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRegister(false)}
                    className="min-h-[40px] px-3 py-2 text-xs text-slate-600 dark:text-slate-300"
                  >
                    Orqaga
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-xl"
                  >
                    Ro‘yxatdan o‘tish
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
