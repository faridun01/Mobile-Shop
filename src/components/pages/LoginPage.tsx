import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Smartphone, Lock, User, AlertCircle, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, login } = useApp();
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (currentUser) {
    return <Navigate to="/sale" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginInput.trim() || !passwordInput) {
      setError('Пожалуйста, введите логин и пароль');
      return;
    }
    const res = await login(loginInput.trim(), passwordInput);
    if (res.success) {
      navigate('/sale');
    } else {
      setError(res.message || 'Неверный логин или пароль');
    }
  };



  return (
    <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center p-4 text-slate-300 selection:bg-emerald-500 selection:text-black relative font-mono">

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
          <div className="flex items-center justify-end pb-3 border-b border-slate-800 text-[10px] font-mono text-slate-400">
            <span className="text-emerald-400 font-bold uppercase tracking-wider flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>ЗАЩИЩЕНО</span>
            </span>
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
        </div>

        <p className="text-center text-[10px] font-mono text-slate-600 mt-4 uppercase tracking-widest">
          АУДИТ ВХОДА ВКЛЮЧЕН // MOBILE SHOP OS 2026
        </p>
      </div>
    </div>
  );
};
