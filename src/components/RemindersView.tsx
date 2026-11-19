import { AlertTriangle, BellRing, CheckCircle2, Plus, Trash2, Wrench, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ComputedMaintenance, MaintenanceStatus, PartCategory, Vehicle } from '../types.ts';
import {
  formatCurrencyUzs,
  formatKm,
  getCategoryLabel,
  getStatusLabel,
} from '../utils/maintenance.ts';

interface RemindersViewProps {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | undefined;
  onSelectVehicle: (id: string) => void;
  computedItems: ComputedMaintenance[];
  onUpdateOdometer: (vehicleId: string, nextKm: number) => Promise<void>;
  onCompleteTask: (vehicleId: string, itemId: string) => Promise<void>;
  onAddMaintenance: (payload: {
    vehicleId: string;
    name: string;
    category: PartCategory;
    intervalKm: number;
    intervalMonths: number;
    lastServiceKm: number;
    lastServiceDate: string;
    estimatedCostUzs: number;
    notes?: string;
  }) => Promise<void>;
  onDeleteMaintenance: (id: string) => Promise<void>;
  onOpenBooking: (serviceTitle?: string) => void;
}

type FilterOption = 'all' | MaintenanceStatus;

export default function RemindersView({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  computedItems,
  onUpdateOdometer,
  onCompleteTask,
  onAddMaintenance,
  onDeleteMaintenance,
  onOpenBooking,
}: RemindersViewProps) {
  const [filter, setFilter] = useState<FilterOption>('all');
  const [kmValue, setKmValue] = useState(selectedVehicle ? String(selectedVehicle.currentKm) : '');
  const [updatingKm, setUpdatingKm] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Custom maintenance item form state
  const [partName, setPartName] = useState('');
  const [partCategory, setPartCategory] = useState<PartCategory>('oil');
  const [intervalKm, setIntervalKm] = useState('10000');
  const [intervalMonths, setIntervalMonths] = useState('12');
  const [lastKm, setLastKm] = useState(selectedVehicle ? String(selectedVehicle.currentKm) : '0');
  const [lastDate, setLastDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [estCost, setEstCost] = useState('350000');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const [notifStatus, setNotifStatus] = useState<string>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const activeKmInput = kmValue === '' && selectedVehicle ? String(selectedVehicle.currentKm) : kmValue;

  const filtered = computedItems.filter((item) => (filter === 'all' ? true : item.status === filter));

  async function requestBrowserNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotifStatus(result);
    if (result === 'granted') {
      const urgent = computedItems.find((i) => i.status !== 'ok');
      if (urgent) {
        new Notification('AvtoTexnik Eslatma', {
          body: `${urgent.name}: ${urgent.remainingKm > 0 ? `${formatKm(urgent.remainingKm)} qoldi` : "muddati o'tgan"}`,
        });
      }
    }
  }

  async function handleOdometerUpdate(e: FormEvent) {
    e.preventDefault();
    if (!selectedVehicle) return;
    const parsed = Number(activeKmInput);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setUpdatingKm(true);
    try {
      await onUpdateOdometer(selectedVehicle.id, parsed);
    } finally {
      setUpdatingKm(false);
    }
  }

  async function handleMarkDone(itemId: string) {
    if (!selectedVehicle) return;
    setCompletingId(itemId);
    try {
      await onCompleteTask(selectedVehicle.id, itemId);
    } finally {
      setCompletingId(null);
    }
  }

  async function handleDelete(itemId: string) {
    setDeletingId(itemId);
    try {
      await onDeleteMaintenance(itemId);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedVehicle || !partName.trim()) return;
    setAdding(true);
    try {
      await onAddMaintenance({
        vehicleId: selectedVehicle.id,
        name: partName.trim(),
        category: partCategory,
        intervalKm: Number(intervalKm) || 10000,
        intervalMonths: Number(intervalMonths) || 12,
        lastServiceKm: Number(lastKm) || selectedVehicle.currentKm,
        lastServiceDate: lastDate,
        estimatedCostUzs: Number(estCost) || 250000,
        notes: notes.trim() || undefined,
      });
      setPartName('');
      setNotes('');
      setShowAddForm(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-8 pb-24 md:pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Moy va Ehtiyot Qismlar Eslatmalari
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Avtomobil probegi va muddati asosida har bir detalning qolgan resursini kuzating
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {notifStatus !== 'unsupported' && notifStatus !== 'granted' && (
            <button
              type="button"
              onClick={requestBrowserNotifications}
              className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl inline-flex items-center gap-2 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors"
            >
              <BellRing className="w-4 h-4" aria-hidden="true" />
              Bildirishnomalar
            </button>
          )}

          {selectedVehicle && (
            <button
              type="button"
              onClick={() => {
                setLastKm(String(selectedVehicle.currentKm));
                setShowAddForm((v) => !v);
              }}
              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-700 rounded-xl inline-flex items-center gap-1.5 transition-colors"
            >
              {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{showAddForm ? 'Yopish' : "Yangi qism qo'shish"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Custom Part / Fluid Form */}
      {showAddForm && selectedVehicle && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Yangi nazorat bandini qo‘shish ({selectedVehicle.brand} {selectedVehicle.model})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="new-part-name" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Qism yoki suyuqlik nomi
              </label>
              <input
                id="new-part-name"
                type="text"
                required
                value={partName}
                onChange={(e) => setPartName(e.target.value)}
                placeholder="Masalan: Karobka moyi (ATF)"
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="new-part-cat" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Toifa
              </label>
              <select
                id="new-part-cat"
                value={partCategory}
                onChange={(e) => setPartCategory(e.target.value as PartCategory)}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              >
                <option value="oil">Dvigatel / Karobka moyi</option>
                <option value="filter">Filtrlar</option>
                <option value="brakes">Tormoz tizimi</option>
                <option value="ignition">O‘t oldirish</option>
                <option value="chassis">Yurish qismi</option>
                <option value="battery">Elektronika</option>
              </select>
            </div>

            <div>
              <label htmlFor="new-part-cost" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Taxminiy narxi (so‘m)
              </label>
              <input
                id="new-part-cost"
                type="number"
                min={0}
                value={estCost}
                onChange={(e) => setEstCost(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="new-int-km" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Almashtirish oralig‘i (km)
              </label>
              <input
                id="new-int-km"
                type="number"
                min={500}
                required
                value={intervalKm}
                onChange={(e) => setIntervalKm(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="new-int-mo" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Muddat oralig‘i (oy)
              </label>
              <input
                id="new-int-mo"
                type="number"
                min={1}
                required
                value={intervalMonths}
                onChange={(e) => setIntervalMonths(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="new-last-km" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Oxirgi almashtirilgan probeg (km)
              </label>
              <input
                id="new-last-km"
                type="number"
                min={0}
                required
                value={lastKm}
                onChange={(e) => setLastKm(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="new-last-date" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Oxirgi servis sanasi
              </label>
              <input
                id="new-last-date"
                type="date"
                required
                value={lastDate}
                onChange={(e) => setLastDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="new-part-notes" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Eslatma izohi (ixtiyoriy)
              </label>
              <input
                id="new-part-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Masalan: Faqat Dexron VI moyi quyilsin"
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="min-h-[42px] px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={adding}
              className="min-h-[42px] px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50"
            >
              {adding ? 'Saqlanmoqda...' : "Ro'yxatga qo'shish"}
            </button>
          </div>
        </form>
      )}

      {/* Vehicle & Odometer Bar */}
      {selectedVehicle && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex flex-wrap items-center gap-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  onSelectVehicle(v.id);
                  setKmValue(String(v.currentKm));
                }}
                className={`min-h-[40px] px-4 py-2 text-xs font-medium rounded-xl border transition-colors ${
                  v.id === selectedVehicle.id
                    ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900 dark:border-amber-600'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                {v.brand} {v.model} · {v.plateNumber}
              </button>
            ))}
          </div>

          <form onSubmit={handleOdometerUpdate} className="flex items-center gap-2">
            <label htmlFor="rem-km-input" className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Probeg (km):
            </label>
            <input
              id="rem-km-input"
              type="number"
              min={0}
              value={activeKmInput}
              onChange={(e) => setKmValue(e.target.value)}
              className="w-32 min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={updatingKm}
              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-700 rounded-xl transition-colors whitespace-nowrap"
            >
              {updatingKm ? '...' : 'Saqlash'}
            </button>
          </form>
        </div>
      )}

      {/* Segmented Status Filters */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        {(
          [
            { id: 'all', label: 'Barchasi' },
            { id: 'overdue', label: "Muddati o'tgan" },
            { id: 'due_soon', label: 'Tez orada' },
            { id: 'ok', label: "Me'yorda" },
          ] as { id: FilterOption; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              filter === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Maintenance Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
          <Wrench className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-900 dark:text-white">Tanlangan toifada eslatmalar topilmadi</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Barcha texnik qismlar holatini ko‘rish uchun filtrni o‘zgartiring yoki yangi qism qo‘shing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((item) => {
            const isOverdue = item.status === 'overdue';
            const isSoon = item.status === 'due_soon';

            const statusTextClass = isOverdue
              ? 'text-red-600 dark:text-red-400'
              : isSoon
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400';

            const barClass = isOverdue ? 'bg-red-600' : isSoon ? 'bg-amber-500' : 'bg-emerald-600';

            return (
              <article
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {getCategoryLabel(item.category)} · Oraliq: {formatKm(item.intervalKm)} / {item.intervalMonths} oy
                      </p>
                      <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                        {item.name}
                      </h2>
                    </div>

                    <span className={`text-xs font-semibold inline-flex items-center gap-1 shrink-0 ${statusTextClass}`}>
                      {item.status === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                      )}
                      {getStatusLabel(item.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Oxirgi servis</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                        {formatKm(item.lastServiceKm)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Keyingi reja</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                        {formatKm(item.nextDueKm)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Qolgan resurs</span>
                      <span className={`font-mono font-semibold tabular-nums mt-0.5 block ${statusTextClass}`}>
                        {item.remainingKm > 0 ? formatKm(item.remainingKm) : `-${formatKm(Math.abs(item.remainingKm))}`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 dark:text-slate-400">Eskirish darajasi</span>
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                        {item.wearPercent}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barClass}`}
                        style={{ width: `${item.wearPercent}%` }}
                      />
                    </div>
                  </div>

                  {item.notes && (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{item.notes}</p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                    {formatCurrencyUzs(item.estimatedCostUzs)}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => handleDelete(item.id)}
                      aria-label="Nazorat bandini o'chirish"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={completingId === item.id}
                      onClick={() => handleMarkDone(item.id)}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                    >
                      {completingId === item.id ? 'Saqlanmoqda...' : 'Bajarildi'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBooking(item.name)}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors"
                    >
                      Yozilish
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
