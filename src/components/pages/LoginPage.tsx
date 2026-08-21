import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Smartphone, Lock, User, AlertCircle, ArrowRight, Sun, Moon } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, theme, toggleTheme } = useApp();
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginInput.trim() || !passwordInput) {
      setError('Введите логин и пароль');
      return;
    }
    const res = login(loginInput.trim(), passwordInput);
    if (!res.success) {
      setError(res.message || 'Ошибка аутентификации');
    }
  };

  const handleQuickLogin = (u: string, p: string) => {
    setLoginInput(u);
    setPasswordInput(p);
    login(u, p);
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] high-density-grid flex flex-col items-center justify-center p-4 text-slate-300 selection:bg-emerald-500 selection:text-black relative">
      {/* Top right theme switcher */}
      <div className="absolute top-4 right-4">
        <button
          type="button"
          onClick={toggleTheme}
          className={`p-2 rounded-lg border flex items-center space-x-1.5 text-xs font-mono transition-colors ${
            theme === 'light'
              ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-800'
          }`}
          title={theme === 'light' ? 'Переключить на темный режим' : 'Переключить на обычный (светлый) режим'}
        >
          {theme === 'light' ? (
            <>
              <Sun className="w-4 h-4 text-amber-600" />
              <span>Обычный режим</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-400" />
              <span>Тёмный режим</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400 mb-3 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <Smartphone className="w-6 h-6" />
          </div>
          <div className="flex items-center justify-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-base font-bold tracking-wider text-slate-100 uppercase font-mono">MOBILE SHOP OS</h1>
          </div>
          <p className="text-[11px] font-mono text-slate-500 mt-1 uppercase tracking-widest">HIGH DENSITY AUTOMATION TERMINAL</p>
        </div>

        {/* Login form card */}
        <div className="bg-[#0F1219] border border-slate-800 rounded-lg p-5 shadow-2xl">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-[10px] font-mono text-slate-500">
            <span>TERMINAL ID // #01</span>
            <span className="text-emerald-400 font-bold">SECURE LINK</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                OPERATOR ID / USERNAME
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={loginInput ?? ''}
                  onChange={(e) => setLoginInput(e.target.value)}
                  placeholder="admin, ahmad, farhod..."
                  autoFocus
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 pl-9 pr-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                SECURITY ACCESS PIN / PASS
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  value={passwordInput ?? ''}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 pl-9 pr-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900/50 p-2 rounded">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-2 rounded bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 py-2 text-xs font-mono font-bold text-black uppercase tracking-wider transition-colors shadow-[0_0_12px_rgba(16,185,129,0.5)]"
            >
              <span>АВТОРИЗОВАТЬСЯ</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Quick login helper */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">QUICK ACCESS PRESETS:</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'admin123')}
                className="py-1.5 px-2 rounded bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 text-left text-[11px] transition-colors"
              >
                ADMIN <span className="text-slate-500 text-[9px] block">Full Sys Access</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('partner', 'partner123')}
                className="py-1.5 px-2 rounded bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 text-left text-[11px] transition-colors"
              >
                PARTNER <span className="text-slate-500 text-[9px] block">Finance View</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('ahmad', 'seller123')}
                className="py-1.5 px-2 rounded bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 text-left text-[11px] transition-colors"
              >
                AHMAD <span className="text-slate-500 text-[9px] block">Store 2 Terminal</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('farhod', 'seller123')}
                className="py-1.5 px-2 rounded bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 text-left text-[11px] transition-colors"
              >
                FARHOD <span className="text-slate-500 text-[9px] block">Store 1 Terminal</span>
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] font-mono text-slate-600 mt-4 uppercase tracking-widest">
          SESSION LOGGED // AUDIT TRAIL ENABLED
        </p>
      </div>
    </div>
  );
};
