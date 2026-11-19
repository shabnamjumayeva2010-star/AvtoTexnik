import { Bell, CalendarCheck, History, Home, User } from 'lucide-react';
import type { NavTab } from '../types.ts';

interface HeaderProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenBooking: () => void;
  urgentCount: number;
}

const NAV_ITEMS: { id: NavTab; label: string; mobileLabel: string }[] = [
  { id: 'home', label: 'Bosh sahifa', mobileLabel: 'Asosiy' },
  { id: 'reminders', label: 'Eslatmalar', mobileLabel: 'Eslatma' },
  { id: 'history', label: 'Servis tarixi', mobileLabel: 'Tarix' },
  { id: 'cabinet', label: 'Kabinet', mobileLabel: 'Kabinet' },
];

export default function Header({ activeTab, onSelectTab, onOpenBooking, urgentCount }: HeaderProps) {
  return (
    <>
      <header className="sticky top-0 z-30 h-13 md:h-16 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('home')}
            className="font-display text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-amber-500 rounded"
          >
            AvtoTexnik
          </button>

          {/* Zone 2: 4 clean single-line text nav links (Desktop) */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Asosiy navigatsiya">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-amber-500 rounded ${
                    isActive
                      ? 'text-slate-900 dark:text-white underline decoration-amber-600 decoration-2 underline-offset-8'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {item.id === 'reminders' && urgentCount > 0 ? ` (${urgentCount})` : ''}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary CTA button */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenBooking}
              className="min-h-[40px] md:min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] rounded-xl transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            >
              Xizmatga yozilish
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Zone Tab Bar (64px height, touch targets >= 44px) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center px-2"
        aria-label="Mobil navigatsiya"
      >
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'home' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Home className="w-5 h-5" aria-hidden="true" />
          <span className="text-[11px] font-medium whitespace-nowrap">Asosiy</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('reminders')}
          className={`relative min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'reminders' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Bell className="w-5 h-5" aria-hidden="true" />
          <span className="text-[11px] font-medium whitespace-nowrap">
            Eslatma{urgentCount > 0 ? ` · ${urgentCount}` : ''}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('history')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'history' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <History className="w-5 h-5" aria-hidden="true" />
          <span className="text-[11px] font-medium whitespace-nowrap">Tarix</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('cabinet')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'cabinet' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <User className="w-5 h-5" aria-hidden="true" />
          <span className="text-[11px] font-medium whitespace-nowrap">Kabinet</span>
        </button>
      </nav>
    </>
  );
}
