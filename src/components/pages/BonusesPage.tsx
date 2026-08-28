import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SupplierBonus } from '../../types';
import {
  Gift,
  Plus,
  DollarSign,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Award,
  Calendar,
  Layers,
  ChevronRight,
  X
} from 'lucide-react';

export const BonusesPage: React.FC = () => {
  const {
    currentUser,
    supplierBonuses,
    suppliers,
    stores,
    devices,
    createSupplierBonus,
    todayRate
  } = useApp();

  const rate = todayRate?.rate || 9.50;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBonus, setSelectedBonus] = useState<SupplierBonus | null>(null);

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');

  // Suppliers load asynchronously — resync once they arrive.
  useEffect(() => {
    if (!supplierId && suppliers.length > 0) {
      setSupplierId(suppliers[0].id);
    }
  }, [suppliers, supplierId]);
  const [bonusType, setBonusType] = useState<'CASH_DISCOUNT' | 'FREE_DEVICES'>('FREE_DEVICES');
  const [amountUsd, setAmountUsd] = useState('');
  
  // Free device bonus spec
  const [bonusBrand, setBonusBrand] = useState('Apple');
  const [bonusModel, setBonusModel] = useState('iPhone 16');
  const [bonusStorage, setBonusStorage] = useState('128 GB');
  const [bonusColor, setBonusColor] = useState('Black');
  const [bonusImei, setBonusImei] = useState('');
  const [bonusImei2, setBonusImei2] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('main-warehouse');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const giftDevices = useMemo(() => {
    if (!selectedBonus) return [];

    // 1. If explicit freeDevices inside bonus object
    if (selectedBonus.freeDevices && selectedBonus.freeDevices.length > 0) {
      return selectedBonus.freeDevices.map(fd => {
        const liveDev = devices.find(d => d.imei === fd.imei);
        return {
          brand: fd.brand,
          model: fd.model,
          storage: fd.storage,
          color: fd.color,
          imei: fd.imei,
          costBasisUsd: fd.costBasisUsd ?? 0,
          status: liveDev?.status || 'MAIN_WAREHOUSE',
          locationName: liveDev?.locationName || 'Главный склад',
          serialNumber: liveDev?.serialNumber || 'SN-GIFT-BONUS'
        };
      });
    }

    // 2. Otherwise search devices array matching supplier or campaign or bonus flag
    const matched = devices.filter(d => 
      (d.isBonus || d.purchaseCostUsd === 0) &&
      (d.supplierId === selectedBonus.supplierId || d.supplierName === selectedBonus.supplierName || (selectedBonus.campaignName && d.bonusCampaign?.includes(selectedBonus.campaignName)))
    );

    if (matched.length > 0) {
      return matched.map(d => ({
        brand: d.brand,
        model: d.model,
        storage: d.storage,
        color: d.color,
        imei: d.imei,
        costBasisUsd: d.costBasisUsd,
        status: d.status,
        locationName: d.locationName,
        serialNumber: d.serialNumber
      }));
    }

    // 3. Fallback single device if deviceId is specified
    if (selectedBonus.deviceId) {
      const singleDev = devices.find(d => d.id === selectedBonus.deviceId);
      if (singleDev) {
        return [{
          brand: singleDev.brand,
          model: singleDev.model,
          storage: singleDev.storage,
          color: singleDev.color,
          imei: singleDev.imei,
          costBasisUsd: singleDev.costBasisUsd,
          status: singleDev.status,
          locationName: singleDev.locationName,
          serialNumber: singleDev.serialNumber
        }];
      }
    }

    return [];
  }, [selectedBonus, devices]);

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p className="text-sm font-medium">Доступ ограничен</p>
        <p className="text-xs text-zinc-600 mt-1">Раздел бонусов доступен только руководству</p>
      </div>
    );
  }

  const handleCreateBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const freeDevices = bonusType === 'FREE_DEVICES' ? [
      {
        brand: bonusBrand,
        model: bonusModel,
        storage: bonusStorage,
        color: bonusColor,
        imei: bonusImei.trim() || `35${Math.floor(1000000000000 + Math.random() * 9000000000000)}`,
        imei2: bonusImei2.trim() || undefined,
        costBasisUsd: 0
      }
    ] : undefined;

    const res = await createSupplierBonus({
      supplierId,
      bonusType,
      amountUsd: bonusType === 'CASH_DISCOUNT' ? (parseFloat(amountUsd) || 0) : undefined,
      freeDevices,
      destinationLocationId
    });

    if (res.success) {
      setIsModalOpen(false);
      setBonusImei('');
      setBonusImei2('');
      setStatusMessage({
        type: 'success',
        text: `Бонус успешно сохранен и оприходован на склад`
      });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка сохранения' });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface flex items-center justify-between gap-3 shrink-0">
        <h3 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide flex items-center space-x-1.5">
          <Gift className="w-4 h-4 text-amber-400" />
          <span>БОНУСЫ И ПРОМО-ПРОГРАММЫ ПОСТАВЩИКОВ</span>
        </h3>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg flex items-center space-x-1.5 shrink-0 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Зафиксировать бонус</span>
        </button>
      </div>

      {statusMessage && (
        <div className={`mx-4 mt-3 p-2.5 rounded text-xs flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-800' : 'bg-rose-950/50 text-rose-300 border border-rose-800'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* List of Bonuses */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-950">
        {supplierBonuses.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs">
            Нет активных бонусных кампаний
          </div>
        ) : (
          [...supplierBonuses]
            .sort((a, b) => new Date(b.dateReceived || b.date || 0).getTime() - new Date(a.dateReceived || a.date || 0).getTime())
            .map((bonus) => (
            <div
              key={bonus.id}
              onClick={() => setSelectedBonus(bonus)}
              className="p-4 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-zinc-100">{bonus.campaignTitle || bonus.campaignName || `Бонус от ${bonus.supplierName}`}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                    bonus.bonusType === 'FREE_DEVICES' || bonus.deviceId
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-800'
                  }`}>
                    {bonus.bonusType === 'FREE_DEVICES' || bonus.deviceId ? 'Подарочные телефоны ($0)' : 'Денежная скидка'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Поставщик: <strong className="text-zinc-200">{bonus.supplierName}</strong> • {bonus.date || bonus.dateReceived || ''}
                </p>

                {bonus.freeDevices && (
                  <div className="pt-1 text-[11px] text-zinc-300 font-mono flex items-center space-x-2">
                    <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">
                      {bonus.freeDevices.map(d => `${d.brand} ${d.model} (${d.imei}) [Себестоимость: $${d.costBasisUsd}]`).join(', ')}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-3 text-right shrink-0">
                <div>
                  {bonus.bonusType === 'CASH_DISCOUNT' ? (
                    <div>
                      <span className="text-sm font-mono font-bold text-emerald-400 block">+${bonus.amountUsd} USD</span>
                      <span className="text-[11px] font-mono text-emerald-300 font-bold block">≈ {Math.round((bonus.amountUsd || 0) * rate)} TJS</span>
                    </div>
                  ) : (
                    <span className="text-xs font-mono font-semibold text-amber-400 block">
                      +{bonus.freeDevices?.length || 1} шт. бесплатно
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Нажмите для просмотра</span>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL: Register Bonus */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateBonus} className="w-full max-w-md rounded-lg bg-zinc-900 border border-zinc-800 p-5 text-zinc-100 shadow-2xl space-y-4">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span>Регистрация бонуса от поставщика</span>
              </h4>
              <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                ★ 100% любого бонуса учитывается в чистую прибыль
              </p>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">Поставщик</label>
                <select
                  value={supplierId ?? ''}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Тип бонуса</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBonusType('FREE_DEVICES')}
                    className={`py-2 px-2 rounded border text-xs font-medium ${
                      bonusType === 'FREE_DEVICES' ? 'bg-amber-950 border-amber-500 text-amber-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    Бесплатный телефон ($0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBonusType('CASH_DISCOUNT')}
                    className={`py-2 px-2 rounded border text-xs font-medium ${
                      bonusType === 'CASH_DISCOUNT' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    Денежный бонус / Скидка
                  </button>
                </div>
              </div>

              {bonusType === 'FREE_DEVICES' ? (
                <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-2">
                  <span className="text-[11px] font-semibold text-zinc-300">Данные подарочного устройства:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={bonusBrand ?? ''}
                      onChange={(e) => setBonusBrand(e.target.value)}
                      placeholder="Apple"
                      className="rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={bonusModel ?? ''}
                      onChange={(e) => setBonusModel(e.target.value)}
                      placeholder="iPhone 16"
                      className="rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={bonusStorage ?? ''}
                      onChange={(e) => setBonusStorage(e.target.value)}
                      placeholder="128 GB"
                      className="rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={bonusColor ?? ''}
                      onChange={(e) => setBonusColor(e.target.value)}
                      placeholder="Black"
                      className="rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs"
                    />
                  </div>

                  <div className="space-y-2 pt-1 border-t border-zinc-800">
                    <div className="grid grid-cols-2 gap-2 font-mono text-xs">

                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-0.5">
                          IMEI 1 <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={bonusImei ?? ''}
                          onChange={(e) => setBonusImei(e.target.value)}
                          placeholder="351234567890123"
                          className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-0.5">
                        IMEI 2 <span className="text-zinc-500 font-normal font-sans">(опционально / по желанию)</span>
                      </label>
                      <input
                        type="text"
                        value={bonusImei2 ?? ''}
                        onChange={(e) => setBonusImei2(e.target.value)}
                        placeholder="351234567890124 (по желанию)"
                        className="w-full rounded bg-zinc-900 border border-zinc-700 px-2.5 py-1 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-zinc-400 text-xs font-semibold">
                    Сумма бонуса — <span className="text-emerald-400 font-bold">100% в чистую прибыль</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[10px] text-zinc-400 mb-1 font-mono uppercase font-bold">В долларах ($ USD):</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-emerald-400 font-bold">$</span>
                        <input
                          type="number"
                          value={amountUsd ?? ''}
                          onChange={(e) => setAmountUsd(e.target.value)}
                          placeholder="250"
                          className="w-full rounded bg-zinc-950 border border-zinc-700 pl-7 pr-2.5 py-1 text-xs font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] text-zinc-400 mb-1 font-mono uppercase font-bold">В сомони (TJS):</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-emerald-400 font-bold text-[11px]">SM</span>
                        <input
                          type="number"
                          value={amountUsd ? Math.round((parseFloat(amountUsd) || 0) * rate) : ''}
                          onChange={(e) => {
                            const valTjs = parseFloat(e.target.value);
                            if (!isNaN(valTjs)) {
                              setAmountUsd((valTjs / rate).toFixed(2));
                            } else {
                              setAmountUsd('');
                            }
                          }}
                          placeholder="2375"
                          className="w-full rounded bg-zinc-950 border border-zinc-700 pl-8 pr-2.5 py-1 text-xs font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  {amountUsd && parseFloat(amountUsd) > 0 && (
                    <p className="text-[11px] text-emerald-400 font-bold font-mono bg-emerald-500/10 border border-emerald-500/20 p-2 rounded">
                      ★ Конвертация по курсу {rate} TJS/USD: ${amountUsd} USD = {Math.round((parseFloat(amountUsd) || 0) * rate)} TJS (100% в чистую прибыль учредителей)
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-white"
              >
                Сохранить бонус
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: View Gift Bonus Details */}
      {selectedBonus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-lg rounded-xl bg-[#0F1219] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-[#0B0E14] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase">
                    {selectedBonus.campaignTitle || selectedBonus.campaignName || `БОНУС ОТ ${selectedBonus.supplierName.toUpperCase()}`}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Поставщик: <strong className="text-slate-200">{selectedBonus.supplierName}</strong> • {selectedBonus.date || selectedBonus.dateReceived || ''}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedBonus(null)}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Gift Details Content */}
            <div className="p-4 space-y-3 overflow-y-auto flex-1 bg-[#0B0E14]">
              <div className="p-3 rounded-lg bg-[#0F1219] border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400 uppercase text-[11px]">ТИП БОНУСА:</span>
                <span className="font-bold text-amber-400 flex items-center space-x-1">
                  <span>🎁 ПОДАРОЧНЫЕ ТЕЛЕФОНЫ ($0)</span>
                </span>
              </div>

              <div className="text-xs font-bold text-slate-300 uppercase pt-1">
                ПОЛУЧЕНО В ПОДАРОК ({giftDevices.length || 1} шт.):
              </div>

              {giftDevices.length > 0 ? (
                giftDevices.map((dev, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-[#0F1219] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                        <strong className="text-slate-100 font-bold">{dev.brand} {dev.model}</strong>
                        <span className="text-slate-400 text-[11px]">{dev.storage} • {dev.color}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold uppercase">
                        $0 ПОДАРОК
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60">
                      <div>IMEI: <strong className="text-slate-200">{dev.imei || '358901200778899'}</strong></div>
                      <div>Локация: <strong className="text-slate-200">{dev.locationName || 'Главный склад'}</strong></div>
                      <div>Себестоимость: <strong className="text-emerald-400 font-bold">$0.00 (БЕСПЛАТНО)</strong></div>
                      <div>Статус: <strong className={dev.status === 'SOLD' ? 'text-amber-400' : 'text-emerald-400'}>{dev.status === 'SOLD' ? 'ПРОДАН' : 'НА СКЛАДЕ'}</strong></div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-lg bg-[#0F1219] border border-slate-800 text-xs text-slate-300 space-y-1">
                  <div className="flex items-center space-x-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <strong>{selectedBonus.brand || 'Apple'} {selectedBonus.model || 'iPhone 16'}</strong>
                    <span className="text-slate-400">({selectedBonus.storage || '128 GB'})</span>
                  </div>
                  <p className="text-[11px] text-slate-400">IMEI: {selectedBonus.imei || '316513218151383'}</p>
                  <p className="text-[11px] text-emerald-400 font-bold">Себестоимость: $0 (Бесплатный подарок по акции)</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-800 bg-[#0B0E14] flex justify-end">
              <button
                onClick={() => setSelectedBonus(null)}
                className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase"
              >
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
