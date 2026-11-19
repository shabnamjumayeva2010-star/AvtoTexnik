import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span>Ilovani o‘rnatish</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>iPhone ga o‘rnatish</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full sm:max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  iPhone / iPad ekraniga qo‘shish
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Yopish"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li>1. Safari pastki panelidan <strong>Ulashish (Share)</strong> tugmasini bosing.</li>
                <li>2. Ro‘yxatdan <strong>Ekranimga qo‘shish (Add to Home Screen)</strong> bandini tanlang.</li>
                <li>3. Yuqori o‘ng burchakdan <strong>Qo‘shish (Add)</strong> tugmasini bosing.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-amber-600 text-white text-sm font-semibold"
              >
                Tushunarli
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-5 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Offline rejim — keshdagi ma’lumotlar ko‘rsatilmoqda</span>
    </div>
  );
}
