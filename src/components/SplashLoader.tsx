import { useEffect, useState } from 'react';

interface SplashLoaderProps {
  onComplete: () => void;
}

export default function SplashLoader({ onComplete }: SplashLoaderProps) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const duration = prefersReduced ? 180 : 820;
    const fadeTimer = window.setTimeout(() => setFading(true), duration);
    const doneTimer = window.setTimeout(() => onComplete(), duration + 220);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-slate-100 transition-opacity duration-200 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="status"
      aria-label="Ilova yuklanmoqda"
    >
      <div className="w-full max-w-xs px-6 flex flex-col items-center text-center">
        <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-slate-800"
              strokeDasharray="198 66"
              strokeDashoffset="-33"
              transform="rotate(135 50 50)"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-amber-500"
              strokeDasharray="140 200"
              transform="rotate(135 50 50)"
            />
            <g className="origin-center animate-tach-sweep" style={{ transformOrigin: '50px 50px' }}>
              <line x1="50" y1="50" x2="50" y2="18" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="50" cy="50" r="4.5" fill="#F8FAFC" />
            </g>
          </svg>
        </div>

        <h1 className="font-display text-2xl font-bold tracking-tight text-white">AvtoTexnik</h1>
        <p className="mt-1.5 text-sm text-slate-400">Texnik nazorat va servis tizimi yuklanmoqda</p>

        <div className="mt-6 w-full h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full w-full bg-amber-500 animate-progress-fill" />
        </div>

        <button
          type="button"
          onClick={onComplete}
          className="mt-6 min-h-[44px] px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-amber-500 rounded-lg"
        >
          O‘tkazib yuborish
        </button>
      </div>
    </div>
  );
}
