import { Calendar, Check, Clock, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ServiceCatalogItem, Vehicle } from '../types.ts';
import { formatCurrencyUzs } from '../utils/maintenance.ts';

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  vehicles: Vehicle[];
  catalog: ServiceCatalogItem[];
  preselectedService?: string;
  onCreated: () => void;
}

const TIME_SLOTS = ['09:30', '11:00', '13:30', '15:00', '16:30', '18:00'];

export default function BookingModal({
  open,
  onClose,
  clientId,
  vehicles,
  catalog,
  preselectedService,
  onCreated,
}: BookingModalProps) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [selectedServices, setSelectedServices] = useState<string[]>(
    preselectedService ? [preselectedService] : [catalog[0]?.title || 'Sintetik Dvigatel Moyi va Filtr'],
  );
  const [preferredDate, setPreferredDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [preferredTime, setPreferredTime] = useState('11:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;

  const activeVehicleId = vehicles.some((v) => v.id === vehicleId) ? vehicleId : vehicles[0]?.id || '';

  function toggleService(title: string) {
    setSelectedServices((prev) =>
      prev.includes(title) ? prev.filter((item) => item !== title) : [...prev, title],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeVehicleId) {
      setErrorMsg('Avtomobil tanlanmagan.');
      return;
    }
    if (selectedServices.length === 0) {
      setErrorMsg('Kamida bitta xizmat turini tanlang.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          vehicleId: activeVehicleId,
          requestedServices: selectedServices,
          preferredDate,
          preferredTime,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Buyurtma yuborishda xatolik.');
        setSubmitting(false);
        return;
      }
      setNotes('');
      onCreated();
      onClose();
    } catch {
      setErrorMsg("Server bilan bog'lanishda xatolik yuz berdi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 id="booking-modal-title" className="font-display text-xl font-semibold text-slate-900 dark:text-white">
              Xizmatga yozilish
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Qulay vaqtni tanlang — ustaxona sizni navbatsiz kutib oladi
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <label htmlFor="booking-vehicle" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Avtomobilni tanlang
            </label>
            <select
              id="booking-vehicle"
              value={activeVehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} — {v.plateNumber}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              Kerakli xizmatlar
            </span>
            <div className="space-y-2">
              {catalog.map((item) => {
                const checked = selectedServices.includes(item.title);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleService(item.title)}
                    className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                      checked
                        ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-500 text-slate-900 dark:text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {item.durationLabel} · {formatCurrencyUzs(item.priceFromUzs)} dan
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                        checked
                          ? 'bg-amber-600 border-amber-600 text-white'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {checked && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="booking-date" className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                Sana
              </label>
              <input
                id="booking-date"
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                required
                className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                Vaqt
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setPreferredTime(slot)}
                    className={`min-h-[38px] text-xs font-mono font-medium rounded-lg border transition-colors ${
                      preferredTime === slot
                        ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900 dark:border-amber-600'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="booking-notes" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Usta uchun qo‘shimcha izoh (ixtiyoriy)
            </label>
            <textarea
              id="booking-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Masalan: old tormozdan yengil ovoz eshitilyapti..."
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] px-5 py-3 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.99] rounded-xl transition-all disabled:opacity-50"
          >
            {submitting ? 'Yuborilmoqda...' : 'Buyurtmani tasdiqlash'}
          </button>
        </form>
      </div>
    </div>
  );
}
