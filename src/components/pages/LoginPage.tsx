import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Smartphone, Lock, User, AlertCircle, ArrowRight, Sun, Moon, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, login, users, theme, toggleTheme } = useApp();
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (currentUser) {
    return <Navigate to="/sale" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginInput.trim() || !passwordInput) {
      setError('Пожалуйста, введите логин и пароль');
      return;
    }
    const res = login(loginInput.trim(), passwordInput);
    if (res.success) {
      navigate('/sale');
    } else {
      setError(res.message || 'Неверный логин или пароль');
    }
  };

  const handleQuickLogin = (u: string, p: string) => {
    setLoginInput(u);
    setPasswordInput(p);
    const res = login(u, p);
    if (res.success) {
      navigate('/sale');
    } else {
      setError(res.message || 'Ошибка входа');
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center p-4 text-slate-300 selection:bg-emerald-500 selection:text-black relative font-mono">
      {/* Top right theme switcher */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          className={`p-2 rounded-lg border flex items-center space-x-1.5 text-xs font-mono transition-all shadow-md ${
            theme === 'light'
              ? 'bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-800'
          }`}
          title={theme === 'light' ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'}
        >
          {theme === 'light' ? (
            <>
              <Sun className="w-4 h-4 text-amber-600" />
              <span className="font-bold">СВЕТЛАЯ ТЕМА</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-400" />
              <span className="font-bold">ТЁМНАЯ ТЕМА</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 text-emerald-400 mb-3 shadow-[0_0_25px_rgba(16,185,129,0.35)]">
            <Smartphone className="w-7 h-7" />
          </div>
          <div className="flex items-center justify-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-lg font-bold tracking-wider text-slate-100 uppercase font-mono">MOBILE SHOP OS</h1>
          </div>
          <p className="text-[11px] font-mono text-slate-500 mt-1 uppercase tracking-widest">
            СИСТЕМА УЧЕТА И КАССОВЫЙ ТЕРМИНАЛ
          </p>
        </div>

        {/* Login form card */}
        <div className="bg-[#0F1219] border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-[10px] font-mono text-slate-400">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>ТЕРМИНАЛ №01</span>
            </span>
            <span className="text-emerald-400 font-bold uppercase tracking-wider">ЗАЩИЩЕНО</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                ЛОГИН ПОЛЬЗОВАТЕЛЯ / USERNAME
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={loginInput ?? ''}
                  onChange={(e) => setLoginInput(e.target.value)}
                  placeholder="admin, partner, seller..."
                  autoFocus
                  required
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 pl-9 pr-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                ПАРОЛЬ ДЛЯ ВХОДА / PASSWORD
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput ?? ''}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 pl-9 pr-9 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/60 p-2.5 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 py-2.5 text-xs font-mono font-bold text-slate-950 uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)]"
            >
              <span>ВХОД В СИСТЕМУ</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick login helper */}
          {users.length > 0 && (
            <div className="pt-3 border-t border-slate-800">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
                БЫСТРЫЙ ВХОД ПО ПОЛЬЗОВАТЕЛЯМ:
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickLogin(u.login, u.passwordHash || 'admin123')}
                    className="p-2 rounded-lg bg-[#0B0E14] hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-emerald-400 text-left text-[11px] transition-all min-w-0 flex flex-col justify-between"
                  >
                    <span className="font-bold text-slate-100 uppercase block truncate">{u.name}</span>
                    <span className="text-slate-500 text-[9px] block truncate mt-0.5">
                      {u.role === 'ADMIN' ? 'Администратор' : u.role === 'PARTNER' ? 'Партнер' : (u.storeName || 'Продавец')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] font-mono text-slate-600 mt-4 uppercase tracking-widest">
          АУДИТ ВХОДА ВКЛЮЧЕН // MOBILE SHOP OS 2026
        </p>
      </div>
    </div>
  );
};
