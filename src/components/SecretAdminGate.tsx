import { Eye, EyeOff, KeyRound, Lock, ShieldAlert, Smartphone, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

interface SecretAdminGateProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, operatorId: string, expiresAt: number) => void;
}

export default function SecretAdminGate({ open, onClose, onAuthenticated }: SecretAdminGateProps) {
  const [challengeId, setChallengeId] = useState('');
  const [nonce, setNonce] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [operatorId, setOperatorId] = useState('');
  const [pin, setPin] = useState('');
  const [phrase, setPhrase] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lockSeconds, setLockSeconds] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setErrorMsg('');
    setPin('');
    setPhrase('');
    setTotpCode('');

    fetch('/api/admin/challenge', { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          if (data.retryAfterSeconds) {
            setLockSeconds(data.retryAfterSeconds);
          }
          setErrorMsg(data.error || 'Protokol aloqasida xatolik.');
          return;
        }
        setChallengeId(data.challengeId);
        setNonce(data.nonce);
        setTotpRequired(Boolean(data.totpRequired));
      })
      .catch(() => {
        if (active) setErrorMsg("Server bilan xavfsiz aloqa o'rnatilmadi.");
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockSeconds]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (lockSeconds > 0 || loading) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          operatorId,
          pin,
          phrase,
          totpCode: totpRequired ? totpCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.retryAfterSeconds) {
          setLockSeconds(data.retryAfterSeconds);
        } else {
          const chRes = await fetch('/api/admin/challenge', { method: 'POST' });
          if (chRes.ok) {
            const chData = await chRes.json();
            setChallengeId(chData.challengeId);
            setNonce(chData.nonce);
            setTotpRequired(Boolean(chData.totpRequired));
          }
        }
        setErrorMsg(data.error || 'Tasdiqlash amalga oshmadi.');
        setLoading(false);
        return;
      }

      onAuthenticated(data.token, data.operatorId, data.expiresAt);
    } catch {
      setErrorMsg('Tarmoq xatosi yuz berdi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-gate-title"
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-900 dark:text-amber-400">
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="security-gate-title" className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Yopiq Tizim Protokoli
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Sessiya kodi: {nonce || '---'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {lockSeconds > 0 && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-red-800 dark:text-red-200">
              <p className="font-semibold">Xavfsizlik bloki faol</p>
              <p className="text-xs mt-0.5 font-mono tabular-nums">
                Qayta urinishgacha: {lockSeconds} soniya
              </p>
            </div>
          </div>
        )}

        {errorMsg && lockSeconds === 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="admin-op-id" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Operator identifikatori
            </label>
            <input
              id="admin-op-id"
              type="text"
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              placeholder="Masalan: AT-ADMIN-01"
              autoComplete="off"
              required
              disabled={lockSeconds > 0}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="admin-pin" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Master PIN
            </label>
            <div className="relative">
              <input
                id="admin-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={12}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                autoComplete="off"
                required
                disabled={lockSeconds > 0}
                className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPin((s) => !s)}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                aria-label={showPin ? 'PINni yashirish' : "PINni ko'rsatish"}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="admin-phrase" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Kriptografik xavfsizlik frazasi
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="admin-phrase"
                type="password"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="Maxfiy kalit so'z"
                autoComplete="off"
                required
                disabled={lockSeconds > 0}
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
              />
            </div>
          </div>

          {totpRequired && (
            <div>
              <label htmlFor="admin-totp" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Authenticator 2FA kodi (6 xonali TOTP)
              </label>
              <div className="relative">
                <Smartphone className="w-4 h-4 text-amber-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="admin-totp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  required
                  disabled={lockSeconds > 0}
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-sm font-mono tracking-widest bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                />
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading || lockSeconds > 0}
              className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Tekshirilmoqda...' : 'Kirishni tasdiqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
