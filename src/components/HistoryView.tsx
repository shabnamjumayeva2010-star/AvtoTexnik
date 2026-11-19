import { Calendar, ChevronRight, FileText, Search, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import type { ServiceBooking, ServiceRecord } from '../types.ts';
import { formatCurrencyUzs, formatKm } from '../utils/maintenance.ts';

interface HistoryViewProps {
  records: ServiceRecord[];
  bookings: ServiceBooking[];
  onOpenBooking: () => void;
}

const BOOKING_STATUS_UZ: Record<ServiceBooking['status'], string> = {
  pending: 'Tasdiqlanmoqda',
  in_progress: 'Ish jarayonida',
  completed: 'Yakunlangan',
  cancelled: 'Bekor qilingan',
};

export default function HistoryView({ records, bookings, onOpenBooking }: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<ServiceRecord | null>(null);

  const normalized = search.trim().toLowerCase();
  const filteredRecords = records.filter((rec) => {
    if (!normalized) return true;
    return (
      rec.vehicleLabel.toLowerCase().includes(normalized) ||
      rec.technicianName.toLowerCase().includes(normalized) ||
      rec.servicesPerformed.some((s) => s.toLowerCase().includes(normalized)) ||
      rec.partsReplaced.some((p) => p.toLowerCase().includes(normalized))
    );
  });

  return (
    <div className="space-y-10 pb-24 md:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Servis Tarixi va Buyurtmalar
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Bajarilgan barcha texnik ishlar, cheklar va faol navbatlar ro‘yxati
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Xizmat, detal yoki usta..."
            className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Active Bookings Section */}
      {bookings.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Sizning faol buyurtmalaringiz
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {b.preferredDate} · {b.preferredTime} · {b.plateNumber}
                    </p>
                    <h3 className="mt-1 font-semibold text-slate-900 dark:text-white">{b.vehicleLabel}</h3>
                  </div>
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                    {BOOKING_STATUS_UZ[b.status]}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {b.requestedServices.join(', ')}
                </p>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Usta: {b.assignedMaster || 'Tayinlanmoqda'}</span>
                  <span className="font-mono tabular-nums">{formatCurrencyUzs(b.estimatedCostUzs)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Completed Service History */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Bajarilgan servislar ({filteredRecords.length})
          </h2>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
            <FileText className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900 dark:text-white">Servis yozuvlari topilmadi</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
              Yangi texnik ko‘rikka yoziling yoki qidiruv so‘zini o‘zgartiring.
            </p>
            <button
              type="button"
              onClick={onOpenBooking}
              className="min-h-[44px] px-5 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors"
            >
              Xizmatga yozilish
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {filteredRecords.map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => setSelectedRecord(rec)}
                className="w-full min-h-[68px] px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>{rec.date}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatKm(rec.odometerKm)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{rec.vehicleLabel}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {rec.servicesPerformed.join(' · ')}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Usta: {rec.technicianName} · Kafolat: {rec.warrantyMonths} oy
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                    {formatCurrencyUzs(rec.totalCostUzs)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Receipt / Detail Modal */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-detail-title"
        >
          <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl">
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Chek raqami: #{selectedRecord.id.toUpperCase()}
                </p>
                <h3 id="record-detail-title" className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-white">
                  {selectedRecord.vehicleLabel}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Yopish"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" /> Sana
                  </span>
                  <span className="font-mono font-medium text-slate-900 dark:text-white mt-0.5 block">
                    {selectedRecord.date}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Probeg</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                    {formatKm(selectedRecord.odometerKm)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                  Bajarilgan ishlar
                </span>
                <ul className="space-y-1 text-slate-800 dark:text-slate-200">
                  {selectedRecord.servicesPerformed.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                  O‘rnatilgan qismlar
                </span>
                <ul className="space-y-1 text-slate-800 dark:text-slate-200">
                  {selectedRecord.partsReplaced.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
              </div>

              {selectedRecord.notes && (
                <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl">
                  Usta izohi: {selectedRecord.notes}
                </p>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  Kafolat: {selectedRecord.warrantyMonths} oy
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Jami to‘lov</span>
                  <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatCurrencyUzs(selectedRecord.totalCostUzs)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
