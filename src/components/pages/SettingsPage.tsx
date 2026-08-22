import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Store as StoreType } from '../../types';
import {
  Settings as SettingsIcon,
  Store,
  DollarSign,
  Plus,
  CheckCircle2,
  AlertCircle,
  Building,
  Sun,
  Moon,
  Check,
  MapPin,
  Coins,
  ShieldCheck,
  HelpCircle,
  Sparkles,
  Pencil,
  Trash2
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const {
    currentUser,
    stores,
    todayRate,
    rateHistory,
    setTodayExchangeRate,
    createStore,
    updateStore,
    deleteStore,
    openDailyRateModal,
    theme,
    setTheme,
    devices,
    sales,
    expenses,
    switchToRealDataMode,
    resetAllCashBalances,
    resetToDemo
  } = useApp();

  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddress, setNewStoreAddress] = useState('');
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);

  const [editingStore, setEditingStore] = useState<StoreType | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [deletingStoreConfirm, setDeletingStoreConfirm] = useState<StoreType | null>(null);
  const [isConfirmRealModeOpen, setIsConfirmRealModeOpen] = useState(false);
  const [isConfirmDemoModeOpen, setIsConfirmDemoModeOpen] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-12 text-center text-slate-500 font-mono">
        <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-600" />
        <p className="text-sm font-bold text-slate-300">ДОСТУП ОГРАНИЧЕН</p>
        <p className="text-xs text-slate-500 mt-1">Настройки системы доступны только Администраторам и Партнерам</p>
      </div>
    );
  }

  const handleAddStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;

    const res = createStore(newStoreName.trim(), newStoreAddress.trim());

    if (res.success) {
      setIsAddStoreOpen(false);
      setNewStoreName('');
      setNewStoreAddress('');
      setStatusMessage({ type: 'success', text: 'Новая торговая точка успешно добавлена' });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания филиала' });
    }
  };

  const handleEditStore = (store: StoreType) => {
    setEditingStore(store);
    setEditName(store.name);
    setEditAddress(store.address || '');
  };

  const handleSaveEditStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore) return;

    const res = updateStore(editingStore.id, editName, editAddress);
    if (res.success) {
      setEditingStore(null);
      setStatusMessage({ type: 'success', text: `Филиал «${editName}» успешно обновлен` });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления филиала' });
    }
  };

  const handleDeleteStore = (store: StoreType) => {
    if (store.isMainWarehouse || store.id === 'store-main') {
      setStatusMessage({ type: 'error', text: 'Центральный (Главный) склад нельзя удалить. Он всегда остается в системе.' });
      return;
    }
    setDeletingStoreConfirm(store);
  };

  const handleConfirmDeleteStore = () => {
    if (!deletingStoreConfirm) return;
    const targetName = deletingStoreConfirm.name;
    const res = deleteStore(deletingStoreConfirm.id);
    setDeletingStoreConfirm(null);

    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: `Филиал «${targetName}» успешно удален. Все его товары автоматически перенесены на Главный склад.`
      });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления филиала' });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-[#0F1219] text-slate-100 font-mono">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-slate-800 bg-[#0B0E14] flex items-center justify-between shrink-0">
        <h3 className="text-xs sm:text-sm font-bold uppercase text-slate-100 flex items-center space-x-2">
          <SettingsIcon className="w-4 h-4 text-emerald-400" />
          <span>НАСТРОЙКИ СИСТЕМЫ</span>
        </h3>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-3 p-3 rounded-lg text-xs flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Symmetrical Content Container */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Row 1: Symmetrical 2-Column Grid (Theme + Exchange Rate) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
            {/* 1. Theme Configuration Card */}
            <div className="p-4 rounded-xl bg-[#0B0E14] border border-slate-800 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 pb-2 border-b border-slate-800/80 mb-3">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-100 uppercase">РЕЖИМ ОФОРМЛЕНИЯ</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Light mode */}
                  <button
                    type="button"
                    onClick={() => {
                      setTheme('light');
                      setStatusMessage({ type: 'success', text: 'Установлен светлый режим интерфейса' });
                    }}
                    className={`p-3 rounded-lg border text-left flex items-start space-x-2.5 transition-all ${
                      theme === 'light'
                        ? 'border-blue-500 bg-emerald-500/15 ring-1 ring-blue-500/50'
                        : 'border-slate-800 bg-[#0F1219] hover:border-slate-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-md ${theme === 'light' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-900 text-slate-400'}`}>
                      <Sun className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-100 uppercase">СВЕТЛЫЙ</span>
                        {theme === 'light' && (
                          <Check className="w-3 h-3 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Дневной режим
                      </p>
                    </div>
                  </button>

                  {/* Dark mode */}
                  <button
                    type="button"
                    onClick={() => {
                      setTheme('dark');
                      setStatusMessage({ type: 'success', text: 'Установлен тёмный режим интерфейса' });
                    }}
                    className={`p-3 rounded-lg border text-left flex items-start space-x-2.5 transition-all ${
                      theme === 'dark'
                        ? 'border-blue-500 bg-emerald-500/15 ring-1 ring-blue-500/50'
                        : 'border-slate-800 bg-[#0F1219] hover:border-slate-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-md ${theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-900 text-slate-400'}`}>
                      <Moon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-100 uppercase">ТЁМНЫЙ</span>
                        {theme === 'dark' && (
                          <Check className="w-3 h-3 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Тёмный режим
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Exchange Rate Card */}
            <div className="p-4 rounded-xl bg-[#0B0E14] border border-slate-800 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-3">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs sm:text-sm font-bold text-slate-100 uppercase">КУРС ВАЛЮТ (TJS / USD)</h4>
                  </div>
                  <button
                    type="button"
                    onClick={openDailyRateModal}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 uppercase transition-colors shadow-sm"
                  >
                    ИЗМЕНИТЬ КУРС
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-[#0F1219] border border-slate-800/80 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">ТЕКУЩИЙ КУРС</span>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="text-xl font-bold text-emerald-400">
                        {todayRate?.rate || 9.50} TJS
                      </span>
                      <span className="text-xs text-slate-400">за $1 USD</span>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <span className="text-[10px] text-slate-500 uppercase block">ОБНОВЛЕНИЕ</span>
                    <span className="text-slate-300 font-bold mt-0.5 block text-[11px]">
                      {todayRate?.date} ({todayRate?.setByName || 'Админ'})
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 pt-1">
                Курс применяется при расчете розничных цен в сомони и контроле маржи.
              </p>
            </div>
          </div>

          {/* Row 2: Full-Width Symmetrical Stores List */}
          <div className="p-4 rounded-xl bg-[#0B0E14] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center space-x-2">
                <Store className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-100 uppercase">ФИЛИАЛЫ И СКЛАДЫ ({stores.length})</h4>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    resetAllCashBalances();
                    setStatusMessage({ type: 'success', text: 'Остатки наличных в кассах всех филиалов успешно обнулены (0 TJS)' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center space-x-1.5 border border-slate-800 transition-colors"
                  title="Сбросить накопленный остаток денег во всех кассах филиалов до 0 TJS"
                >
                  <span>🧹 ОБНУЛИТЬ КАССЫ</span>
                </button>

                <button
                  onClick={() => setIsAddStoreOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-emerald-400 flex items-center space-x-1.5 border border-slate-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ДОБАВИТЬ ФИЛИАЛ</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stores.map((s) => (
                <div key={s.id} className="p-3.5 rounded-lg bg-[#0F1219] border border-slate-800 flex flex-col justify-between space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-2">
                        <Building className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-xs font-bold text-slate-100 uppercase truncate">{s.name}</span>
                      </div>
                      {s.address && (
                        <p className="text-[11px] text-slate-400 flex items-center space-x-1 mt-1 pl-5 truncate">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{s.address}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      {s.isMainWarehouse || s.id === 'store-main' ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-800 uppercase">
                          ЦЕНТРАЛЬНЫЙ
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDeleteStore(s)}
                          className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Удалить филиал"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEditStore(s)}
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
                        title="Редактировать филиал"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline text-xs">
                    <span className="text-slate-500 text-[11px] uppercase">Остаток в кассе:</span>
                    <span className="font-bold text-emerald-400">
                      {(s.cashBalanceTjs ?? 0).toLocaleString()} TJS
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Real Data Mode & System Reset */}
          <div className="p-4 rounded-xl bg-[#0B0E14] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-100 uppercase">РЕЖИМ УЧЕТА И ПОДКЛЮЧЕНИЕ РЕАЛЬНЫХ ДАННЫХ</h4>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0F1219] border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {devices.length === 0 && sales.length === 0 ? (
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full uppercase flex items-center space-x-1.5 inline-flex">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>РЕЖИМ РЕАЛЬНОГО УЧЕТА (LIVE DATA)</span>
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-3 py-1 rounded-full uppercase flex items-center space-x-1.5 inline-flex">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>ДЕМОНСТРАЦИОННЫЙ РЕЖИМ (DEMO MODE)</span>
                    </span>
                  )}
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {devices.length === 0 && sales.length === 0
                      ? 'Система 100% готова к реальной работе магазина. Тестовые примеры очищены, вы можете вносить настоящие инвойсы товаров и оформлять продажи.'
                      : `Сейчас в системе находятся примеры демонстрационных данных: ${devices.length} устройств на складе, ${sales.length} чеков продаж и ${expenses.length} операционных расходов.`}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsConfirmRealModeOpen(true)}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase transition-colors shadow-[0_0_12px_rgba(16,185,129,0.3)] flex items-center space-x-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>ПОДКЛЮЧИТЬ РЕАЛЬНЫЕ ДАННЫЕ (ОЧИСТИТЬ ДЕМО)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsConfirmDemoModeOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold uppercase transition-colors"
                >
                  <span>ЗАГРУЗИТЬ ДЕМО-ДАННЫЕ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Add Store */}
      {isAddStoreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <form onSubmit={handleAddStore} className="w-full max-w-sm rounded-xl bg-[#0F1219] border border-slate-800 p-5 text-slate-100 shadow-2xl space-y-3 font-mono">
            <h4 className="text-sm font-bold text-white mb-2 uppercase">НОВАЯ ТОРГОВАЯ ТОЧКА</h4>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px] uppercase">Название филиала *</label>
                <input
                  type="text"
                  required
                  value={newStoreName ?? ''}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="Магазин №3 Садбарг"
                  className="w-full rounded bg-[#0B0E14] border border-slate-700 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-[11px] uppercase">Адрес</label>
                <input
                  type="text"
                  value={newStoreAddress ?? ''}
                  onChange={(e) => setNewStoreAddress(e.target.value)}
                  placeholder="ул. Айни 48"
                  className="w-full rounded bg-[#0B0E14] border border-slate-700 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddStoreOpen(false)}
                className="flex-1 py-2 rounded bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 uppercase"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 uppercase"
              >
                Создать
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Edit Store */}
      {editingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveEditStore} className="w-full max-w-sm rounded-xl bg-[#0F1219] border border-slate-800 p-5 text-slate-100 shadow-2xl space-y-3 font-mono">
            <h4 className="text-sm font-bold text-white mb-2 uppercase">РЕДАКТИРОВАТЬ ФИЛИАЛ</h4>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px] uppercase">Название филиала *</label>
                <input
                  type="text"
                  required
                  value={editName ?? ''}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded bg-[#0B0E14] border border-slate-700 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-[11px] uppercase">Адрес</label>
                <input
                  type="text"
                  value={editAddress ?? ''}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full rounded bg-[#0B0E14] border border-slate-700 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingStore(null)}
                className="flex-1 py-2 rounded bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 uppercase"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 uppercase"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DELETE STORE CONFIRMATION */}
      {deletingStoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-md rounded-xl bg-[#0F1219] border border-rose-500/40 p-5 shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center space-x-3 text-rose-400 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase text-white">УДАЛЕНИЕ ФИЛИАЛА</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{deletingStoreConfirm.name}</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs space-y-2">
              <p className="text-slate-200 font-semibold">
                Вы действительно хотите удалить филиал «<span className="text-rose-400">{deletingStoreConfirm.name}</span>»?
              </p>
              <p className="text-[11px] text-emerald-400 flex items-start space-x-1.5 pt-1">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Все остатки товаров из этого филиала будут <strong>автоматически перенесены на Главный склад</strong>.</span>
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingStoreConfirm(null)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 uppercase transition-colors"
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStore}
                className="flex-1 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 active:bg-rose-600 text-xs font-bold uppercase text-white shadow-lg shadow-rose-500/30 transition-colors"
              >
                УДАЛИТЬ ФИЛИАЛ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM REAL DATA MODE */}
      {isConfirmRealModeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-md rounded-xl bg-[#0F1219] border border-emerald-500/40 p-5 shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center space-x-3 text-emerald-400 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase text-white">ПОДКЛЮЧЕНИЕ РЕАЛЬНЫХ ДАННЫХ</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Очистка демо-записей для запуска розницы</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs space-y-2">
              <p className="text-slate-200 font-semibold">
                Вы действительно хотите <strong>очистить демонстрационные данные</strong> и перейти в режим реального учета?
              </p>
              <ul className="text-[11px] text-slate-400 space-y-1 list-disc pl-4 pt-1">
                <li>Будут удалены тестовые устройства на складе, чеки продаж и расходы.</li>
                <li><strong>Филиалы, сотрудники, курс валюты и уставной капитал будут сохранены.</strong></li>
                <li>После очистки вы сможете вносить реальные поставки товаров и чеки.</li>
              </ul>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsConfirmRealModeOpen(false)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 uppercase transition-colors"
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                onClick={() => {
                  switchToRealDataMode();
                  setIsConfirmRealModeOpen(false);
                  setStatusMessage({ type: 'success', text: 'Активирован режим реального учета. Демо-данные успешно очищены.' });
                }}
                className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold uppercase text-slate-950 shadow-lg shadow-emerald-500/30 transition-colors"
              >
                ПОДКЛЮЧИТЬ РЕАЛЬНЫЕ ДАННЫЕ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DEMO DATA RESTORE */}
      {isConfirmDemoModeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-md rounded-xl bg-[#0F1219] border border-sky-500/40 p-5 shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center space-x-3 text-sky-400 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase text-white">ЗАГРУЗКА ДЕМО-ДАННЫХ</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Восстановление примерных записей</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Загрузить исходный комплект демонстрационных данных для тестирования системы?
            </p>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsConfirmDemoModeOpen(false)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 uppercase transition-colors"
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                onClick={() => {
                  resetToDemo();
                  setIsConfirmDemoModeOpen(false);
                  setStatusMessage({ type: 'success', text: 'Загружен комплект демонстрационных данных.' });
                }}
                className="flex-1 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold uppercase text-slate-950 shadow-lg shadow-sky-500/30 transition-colors"
              >
                ЗАГРУЗИТЬ ДЕМО
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
