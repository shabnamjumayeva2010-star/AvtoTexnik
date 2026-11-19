import { AlertTriangle, ArrowRight, CheckCircle2, Gauge, Moon, ShieldCheck, Sun, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type {
  Client,
  ClientNotification,
  ComputedMaintenance,
  NavTab,
  ServiceCatalogItem,
  ServiceRecord,
  ThemeMode,
  Vehicle,
} from '../types.ts';
import {
  formatCurrencyUzs,
  formatKm,
  getCategoryLabel,
  getStatusLabel,
} from '../utils/maintenance.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface HomeViewProps {
  client: Client;
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | undefined;
  onSelectVehicle: (id: string) => void;
  computedItems: ComputedMaintenance[];
  records: ServiceRecord[];
  notifications: ClientNotification[];
  catalog: ServiceCatalogItem[];
  theme: ThemeMode;
  onToggleTheme: () => void;
  onUpdateOdometer: (vehicleId: string, nextKm: number) => Promise<void>;
  onCompleteTask: (vehicleId: string, itemId: string) => Promise<void>;
  onOpenBooking: (serviceTitle?: string) => void;
  onNavigate: (tab: NavTab) => void;
}

export default function HomeView({
  client,
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  computedItems,
  records,
  notifications,
  catalog,
  theme,
  onToggleTheme,
  onUpdateOdometer,
  onCompleteTask,
  onOpenBooking,
  onNavigate,
}: HomeViewProps) {
  const [kmInput, setKmInput] = useState(selectedVehicle ? String(selectedVehicle.currentKm) : '');
  const [savingKm, setSavingKm] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [imgErrorMap, setImgErrorMap] = useState<Record<string, boolean>>({});

  // Keep input synced when user switches car
  const displayKmValue = kmInput === '' && selectedVehicle ? String(selectedVehicle.currentKm) : kmInput;

  const urgentItems = computedItems.filter((i) => i.status === 'overdue' || i.status === 'due_soon');
  const oilItem = computedItems.find((i) => i.category === 'oil');
  const latestRecord = records[0];
  const unreadNotifications = notifications.filter((n) => !n.read);

  async function handleOdometerSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedVehicle) return;
    const parsed = Number(displayKmValue.replace(/\s+/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setSavingKm(true);
    try {
      await onUpdateOdometer(selectedVehicle.id, parsed);
    } finally {
      setSavingKm(false);
    }
  }

  async function handleQuickComplete(itemId: string) {
    if (!selectedVehicle) return;
    setCompletingId(itemId);
    try {
      await onCompleteTask(selectedVehicle.id, itemId);
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <div className="space-y-12 pb-24 md:pb-12">
      {/* Unread Urgent Alert Banner */}
      {unreadNotifications.length > 0 && (
        <section
          aria-label="Muhim eslatma"
          className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {unreadNotifications[0].title}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {unreadNotifications[0].message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('reminders')}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl whitespace-nowrap shrink-0 hover:bg-amber-100/60 dark:hover:bg-slate-800 transition-colors"
          >
            Eslatmalarni ko‘rish
          </button>
        </section>
      )}

      {/* Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {client.fullName} · {client.city}
            </p>
            <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15] [text-wrap:balance]">
              Avtomobilingiz moyi va ehtiyot qismlari aniq nazoratda
            </h1>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Probegni kiriting — tizim dvigatel moyi, filtrlar, tormoz kolodkalari va boshqa muhim qismlar qachon yangilanishi kerakligini o‘z vaqtida eslatadi.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenBooking()}
              className="min-h-[46px] px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] rounded-xl transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              Xizmatga yozilish
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('reminders')}
              className="min-h-[46px] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Eslatmalar ({urgentItems.length})
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? "Kunduzgi rejimga o'tish" : "Qorong'u rejimga o'tish"}
              className="min-h-[46px] px-3.5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              <span>{theme === 'dark' ? 'Kunduzgi' : "Qorong'u"}</span>
            </button>

            <PWAInstallButton />
          </div>
        </div>

        <div className="lg:col-span-6 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 min-h-[260px] lg:min-h-[380px] bg-slate-900">
          {!imgErrorMap['hero'] ? (
            <img
              src="/src/assets/images/hero_garage_workshop_1795080894356.jpg"
              alt="AvtoTexnik zamonaviy diagnostika va texnik xizmat boksi"
              referrerPolicy="no-referrer"
              fetchPriority="high"
              loading="eager"
              onError={() => setImgErrorMap((prev) => ({ ...prev, hero: true }))}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-800 to-slate-950 text-slate-200">
              <Wrench className="w-10 h-10 text-amber-500 mb-3" />
              <p className="font-display font-semibold">AvtoTexnik Diagnostika Markazi</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-6">
            <p className="text-xs font-medium text-amber-300">
              Toshkent · Rasmiy Texnik Markaz
            </p>
            <p className="mt-1 font-display text-xl font-semibold text-white">
              Original moy va sertifikatlangan ehtiyot qismlar kafolati bilan
            </p>
          </div>
        </div>
      </section>

      {/* 4-Column Summary KPI Strip */}
      <section aria-label="Avtomobil ko'rsatkichlari" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Joriy probeg</p>
          <p className="mt-1.5 font-mono text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {selectedVehicle ? formatKm(selectedVehicle.currentKm) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            {selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : 'Avto tanlanmagan'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Dvigatel moyigacha</p>
          <p className="mt-1.5 font-mono text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {oilItem ? (oilItem.remainingKm > 0 ? formatKm(oilItem.remainingKm) : "Muddati o'tgan") : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {oilItem ? `Reja: ${formatKm(oilItem.nextDueKm)}` : 'Reja kiritilmagan'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Diqqat talab qismlar</p>
          <p className="mt-1.5 font-mono text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {urgentItems.length} ta
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {urgentItems.length > 0 ? 'Tekshiruv tavsiya etiladi' : "Barchasi me'yorda"}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Oxirgi servis</p>
          <p className="mt-1.5 font-mono text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {latestRecord ? latestRecord.date : 'Mavjud emas'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            {latestRecord ? formatCurrencyUzs(latestRecord.totalCostUzs) : 'Tarix bo‘sh'}
          </p>
        </div>
      </section>

      {/* Active Vehicle Maintenance & Odometer Control */}
      {selectedVehicle && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">
                Faol avtomobil va tezkor probeg yangilash
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {selectedVehicle.plateNumber} · {selectedVehicle.year}-yil · {selectedVehicle.oilType}
              </p>
            </div>

            {vehicles.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onSelectVehicle(v.id);
                      setKmInput(String(v.currentKm));
                    }}
                    className={`min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 ${
                      v.id === selectedVehicle.id
                        ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900 dark:border-amber-600'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {v.model} ({v.plateNumber})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-5">
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-[4/3] bg-slate-100 dark:bg-slate-950">
                {!imgErrorMap[selectedVehicle.id] ? (
                  <img
                    src={selectedVehicle.imageUrl || '/src/assets/images/car_sedan_profile_1795080892208.jpg'}
                    alt={`${selectedVehicle.brand} ${selectedVehicle.model}`}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={() => setImgErrorMap((prev) => ({ ...prev, [selectedVehicle.id]: true }))}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-500">
                    <Gauge className="w-8 h-8 mb-2" />
                    <span className="text-sm font-medium">{selectedVehicle.brand} {selectedVehicle.model}</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleOdometerSubmit} className="space-y-3">
                <label htmlFor="home-odometer-input" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Joriy spidometr ko‘rsatkichi (km)
                </label>
                <div className="flex gap-2">
                  <input
                    id="home-odometer-input"
                    type="number"
                    min={0}
                    value={displayKmValue}
                    onChange={(e) => setKmInput(e.target.value)}
                    className="flex-1 min-h-[44px] px-3.5 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={savingKm}
                    className="min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-700 rounded-xl transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {savingKm ? 'Saqlanmoqda...' : 'Yangilash'}
                  </button>
                </div>
              </form>
            </div>

            <div className="lg:col-span-7 divide-y divide-slate-100 dark:divide-slate-800">
              {computedItems.slice(0, 4).map((item) => {
                const statusColor =
                  item.status === 'overdue'
                    ? 'text-red-600 dark:text-red-400'
                    : item.status === 'due_soon'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400';

                const barColor =
                  item.status === 'overdue'
                    ? 'bg-red-600'
                    : item.status === 'due_soon'
                      ? 'bg-amber-500'
                      : 'bg-emerald-600';

                return (
                  <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                          {getCategoryLabel(item.category)} · Qoldi:{' '}
                          {item.remainingKm > 0 ? formatKm(item.remainingKm) : `-${formatKm(Math.abs(item.remainingKm))}`}{' '}
                          · {item.remainingDays > 0 ? `${item.remainingDays} kun` : 'Muddati o‘tgan'}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-xs font-semibold inline-flex items-center gap-1 ${statusColor}`}>
                          {item.status === 'ok' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          {getStatusLabel(item.status)}
                        </span>

                        <button
                          type="button"
                          disabled={completingId === item.id}
                          onClick={() => handleQuickComplete(item.id)}
                          className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                        >
                          {completingId === item.id ? 'Qayd etilmoqda...' : 'Almashtirildi'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${item.wearPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="pt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Jami {computedItems.length} ta nazorat bandi faol
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('reminders')}
                  className="min-h-[40px] text-sm font-semibold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1.5"
                >
                  Barcha eslatmalar
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Service Catalog */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Asosiy Avto Texnika Xizmatlari
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Ishlab chiqaruvchi reglamentiga mos original qismlar va rasmiy kafolat
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {catalog.map((svc) => (
            <article
              key={svc.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col sm:flex-row"
            >
              <div className="sm:w-44 aspect-[4/3] sm:aspect-auto shrink-0 bg-slate-100 dark:bg-slate-950">
                {!imgErrorMap[svc.id] ? (
                  <img
                    src={svc.imageUrl}
                    alt={svc.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={() => setImgErrorMap((prev) => ({ ...prev, [svc.id]: true }))}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4 text-slate-400">
                    <Wrench className="w-8 h-8" />
                  </div>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {svc.durationLabel} · {formatCurrencyUzs(svc.priceFromUzs)} dan
                  </p>
                  <h3 className="mt-1.5 font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {svc.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {svc.subtitle}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    6 oy / 10 000 km kafolat
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenBooking(svc.title)}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-amber-600 hover:text-white dark:hover:bg-amber-600 rounded-xl transition-colors whitespace-nowrap"
                  >
                    Tanlash
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Claim-to-Proof Trust & Testimonials */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <ShieldCheck className="w-6 h-6 text-amber-600 dark:text-amber-400 mb-3" aria-hidden="true" />
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Raqamli servis daftarchasi
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Har bir almashtirilgan moy va ehtiyot qism probeg, sana hamda usta imzosi bilan doimiy saqlanadi.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            “Malibu 2 moyini har safar esdan chiqarardim. Endi ilova 700 km qolganda ogohlantiradi, ustaxonaga navbatsiz kirib chiqyapman.”
          </p>
          <p className="mt-4 text-xs font-semibold text-slate-900 dark:text-white">
            Azizbek Karimov · Chevrolet Malibu 2
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            “Servis tarixi va narxlar shaffofligi juda yoqdi. Qaysi detal qachon almashtirilganini telefonimdan bir zumda tekshiraman.”
          </p>
          <p className="mt-4 text-xs font-semibold text-slate-900 dark:text-white">
            Dilnoza Tursunova · Kia K5 Prestige
          </p>
        </div>
      </section>
    </div>
  );
}
