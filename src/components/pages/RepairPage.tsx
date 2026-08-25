import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { RepairTicket, RepairStatus } from '../../types';
import {
  Wrench,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  User,
  Phone,
  Smartphone,
  X,
  AlertCircle,
  Banknote,
  CreditCard
} from 'lucide-react';

const REPAIR_STATUS_CONFIG: Record<RepairStatus, { label: string; bg: string; color: string; border: string }> = {
  ACCEPTED: { label: 'ПРИНЯТ', bg: 'bg-slate-900', color: 'text-slate-300', border: 'border-slate-800' },
  IN_PROGRESS: { label: 'В РАБОТЕ', bg: 'bg-amber-500/10', color: 'text-amber-400', border: 'border-amber-500/30' },
  DIAGNOSTICS: { label: 'ДИАГНОСТИКА', bg: 'bg-indigo-500/10', color: 'text-indigo-400', border: 'border-indigo-500/30' },
  IN_REPAIR: { label: 'В РЕМОНТЕ', bg: 'bg-amber-500/10', color: 'text-amber-400', border: 'border-amber-500/30' },
  READY: { label: 'ГОТОВ К ВЫДАЧЕ', bg: 'bg-emerald-500/20', color: 'text-emerald-400', border: 'border-sky-500/30' },
  ISSUED: { label: 'ВЫДАН КЛИЕНТУ', bg: 'bg-emerald-500/20', color: 'text-emerald-400', border: 'border-blue-500/30' },
  DELIVERED: { label: 'ДОСТАВЛЕН', bg: 'bg-emerald-500/20', color: 'text-emerald-400', border: 'border-blue-500/30' },
  UNREPAIRABLE: { label: 'ОТКАЗ / НЕ СМОГЛИ', bg: 'bg-rose-500/10', color: 'text-rose-400', border: 'border-rose-500/30' }
};

export const RepairPage: React.FC = () => {
  const location = useLocation();
  const {
    currentUser,
    repairs,
    sales,
    devices,
    createRepairTicket,
    updateRepairStatus
  } = useApp();

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().substring(0, 7));

  const formatMonthLabel = (ym: string) => {
    if (ym === 'ALL') return 'ВСЕ МЕСЯЦЫ';
    try {
      const [year, month] = ym.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      const name = d.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (e) {
      return ym;
    }
  };

  // Receipt Lookup State
  const [receiptQuery, setReceiptQuery] = useState('');
  const [saleReceiptNumber, setSaleReceiptNumber] = useState<number | undefined>(undefined);
  const [saleDate, setSaleDate] = useState<string | undefined>(undefined);

  // New repair form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [brand, setBrand] = useState('Apple');
  const [deviceModel, setDeviceModel] = useState('');
  const [storage, setStorage] = useState('256 GB');
  const [color, setColor] = useState('Black');
  const [imei, setImei] = useState('');
  const [imei2, setImei2] = useState('');
  const [barcode, setBarcode] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [repairCostTjs, setRepairCostTjs] = useState('');
  const [estimatedCostTjs, setEstimatedCostTjs] = useState('');

  // Auto-populate when navigated from Receipt details modal with location state
  useEffect(() => {
    if (location.state?.saleReceiptNumber || location.state?.item) {
      const st = location.state;
      setActiveTab('create');
      if (st.saleReceiptNumber) {
        setSaleReceiptNumber(st.saleReceiptNumber);
        setReceiptQuery(`#${st.saleReceiptNumber}`);
      }
      if (st.item) {
        setBrand(st.item.brand || 'Apple');
        setDeviceModel(st.item.model || '');
        setStorage(st.item.storage || '256 GB');
        setColor(st.item.color || 'Black');
        setImei(st.item.imei || '');
      }
      if (st.customerName) {
        setCustomerName(st.customerName);
      }
    }
  }, [location.state]);

  // Selected ticket modal / Issue modal
  const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(null);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [finalCostInput, setFinalCostInput] = useState('');
  const [issuePaymentMethod, setIssuePaymentMethod] = useState<'CASH' | 'CARD'>('CASH');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Receipt / IMEI Lookup Handler
  const handleReceiptLookup = (qStr: string) => {
    setReceiptQuery(qStr);
    const q = qStr.trim().toLowerCase().replace('#', '');
    if (!q) return;

    // Search in sales history by receipt number or item imei/barcode
    const matchingSale = sales.find(
      (s) => s.receiptNumber.toString() === q || s.items.some((item) => item.imei.toLowerCase() === q || item.imei2?.toLowerCase() === q)
    );

    if (matchingSale) {
      const item = matchingSale.items[0];
      if (item) {
        setBrand(item.brand || 'Apple');
        setDeviceModel(item.model || '');
        setStorage(item.storage || '256 GB');
        setColor(item.color || 'Black');
        setImei(item.imei || '');
        if (item.imei2) setImei2(item.imei2);

        // Check devices DB for barcode and imei2
        const devMatch = devices.find((d) => d.imei === item.imei || d.barcode === item.imei);
        if (devMatch) {
          if (devMatch.imei2) setImei2(devMatch.imei2);
          if (devMatch.barcode) setBarcode(devMatch.barcode);
        }

        setSaleReceiptNumber(matchingSale.receiptNumber);
        setSaleDate(matchingSale.date);
        if (matchingSale.customerName && !customerName) {
          setCustomerName(matchingSale.customerName);
        }
        setStatusMessage({
          type: 'success',
          text: `Данные из Чека #${matchingSale.receiptNumber} загружены: ${item.brand} ${item.model} (IMEI 1: ${item.imei}${item.imei2 ? ` / IMEI 2: ${item.imei2}` : ''})`,
        });
        return;
      }
    }

    // Search in devices stock by imei or barcode
    const matchingDev = devices.find((d) => d.imei.toLowerCase() === q || d.imei2?.toLowerCase() === q || d.barcode?.toLowerCase() === q);
    if (matchingDev) {
      setBrand(matchingDev.brand);
      setDeviceModel(matchingDev.model);
      setStorage(matchingDev.storage);
      setColor(matchingDev.color);
      setImei(matchingDev.imei);
      if (matchingDev.imei2) setImei2(matchingDev.imei2);
      if (matchingDev.barcode) setBarcode(matchingDev.barcode);
      setStatusMessage({
        type: 'success',
        text: `Устройство найдено в системе: ${matchingDev.brand} ${matchingDev.model} (IMEI 1: ${matchingDev.imei}${matchingDev.imei2 ? ` / IMEI 2: ${matchingDev.imei2}` : ''}${matchingDev.barcode ? ` | EAN: ${matchingDev.barcode}` : ''})`,
      });
    }
  };

  // Monthly repairs for stats and listing
  const monthlyRepairs = React.useMemo(() => {
    return repairs.filter((r) => {
      if (currentUser?.role === 'SELLER' && r.storeId !== currentUser.storeId) {
        return false;
      }
      if (selectedMonth === 'ALL') {
        return true;
      }
      const ticketMonth = r.createdAt ? r.createdAt.substring(0, 7) : '';
      return ticketMonth === selectedMonth;
    });
  }, [repairs, currentUser, selectedMonth]);

  // Filter repairs by month, status, and search query
  const filteredRepairs = React.useMemo(() => {
    return monthlyRepairs.filter((r) => {
      if (statusFilter === 'ACTIVE' && (r.status === 'ISSUED' || r.status === 'UNREPAIRABLE')) {
        return false;
      }
      if (statusFilter === 'ISSUED' && r.status !== 'ISSUED') {
        return false;
      }
      if (statusFilter !== 'ALL' && statusFilter !== 'ACTIVE' && statusFilter !== 'ISSUED' && r.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const modelStr = r.deviceModel || r.model || '';
        return (
          (r.ticketNumber && r.ticketNumber.toString().includes(q)) ||
          r.customerName?.toLowerCase().includes(q) ||
          r.customerPhone?.toLowerCase().includes(q) ||
          modelStr.toLowerCase().includes(q) ||
          r.imei?.toLowerCase().includes(q) ||
          r.imei2?.toLowerCase().includes(q) ||
          r.barcode?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [monthlyRepairs, statusFilter, searchQuery]);

  // Monthly statistics
  const monthlyCompletedCount = monthlyRepairs.filter((r) => r.status === 'ISSUED' || r.status === 'READY').length;
  const monthlyTotalCostTjs = monthlyRepairs.reduce((acc, r) => acc + (r.finalCostTjs || r.estimatedCostTjs || 0), 0);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!customerName.trim() || !customerPhone.trim() || !deviceModel.trim() || !issueDescription.trim()) {
      setStatusMessage({ type: 'error', text: 'Заполните обязательные поля (ФИО клиента, Телефон, Модель, Неисправность)' });
      return;
    }

    const costVal = parseFloat(repairCostTjs || estimatedCostTjs) || 0;

    const res = await createRepairTicket({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      brand: brand.trim() || 'Apple',
      model: deviceModel.trim(),
      storage: storage.trim() || '256 GB',
      color: color.trim() || 'Black',
      imei: imei.trim() || `NO-IMEI-${Date.now()}`,
      imei2: imei2.trim() || undefined,
      barcode: barcode.trim() || undefined,
      saleReceiptNumber,
      saleDate,
      problemDescription: issueDescription.trim(),
      repairCostTjs: costVal
    });

    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: `Квитанция #${res.ticketNumber} успешно оформлена! ${costVal > 0 ? `Расход на сумму ${costVal} TJS занесен в учет расходов (/expenses).` : ''}`
      });
      setCustomerName('');
      setCustomerPhone('');
      setDeviceModel('');
      setImei('');
      setImei2('');
      setBarcode('');
      setIssueDescription('');
      setRepairCostTjs('');
      setEstimatedCostTjs('');
      setReceiptQuery('');
      setSaleReceiptNumber(undefined);
      setActiveTab('list');
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания квитанции' });
    }
  };

  const handleOpenIssueModal = (ticket: RepairTicket) => {
    setSelectedTicket(ticket);
    setFinalCostInput((ticket.finalCostTjs || ticket.estimatedCostTjs || 0).toString());
    setIsIssueModalOpen(true);
  };

  const handleConfirmIssue = async () => {
    if (!selectedTicket) return;
    const finalVal = parseFloat(finalCostInput) || selectedTicket.estimatedCostTjs || 0;

    const res = await updateRepairStatus(selectedTicket.id, 'ISSUED', 'Устройство выдано клиенту', finalVal);

    if (res.success) {
      setIsIssueModalOpen(false);
      setSelectedTicket(null);
      setStatusMessage({
        type: 'success',
        text: `Устройство по квитанции #${selectedTicket.ticketNumber} выдан клиенту. Финальная стоимость (${finalVal} TJS) сохранена в Расходах (/expenses).`
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300">
      {/* Header Tabs & Filters */}
      <div className="p-2.5 border-b border-slate-800 bg-[#0F1219] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 font-mono">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-3 py-1.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider transition-colors bg-transparent ${
              activeTab === 'list'
                ? 'text-[#22c55e] border border-[#22c55e]/50'
                : 'text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            ЖУРНАЛ РЕМОНТОВ ({filteredRepairs.length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-3 py-1.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-colors bg-transparent ${
              activeTab === 'create'
                ? 'text-[#22c55e] border border-[#22c55e]/50'
                : 'text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ПРИЕМ В РЕМОНТ</span>
          </button>
        </div>

        {activeTab === 'list' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* DYNAMIC MONTH FILTER SELECTOR */}
            <div className="flex items-center space-x-1.5">
              <input
                type="month"
                value={selectedMonth === 'ALL' ? new Date().toISOString().substring(0, 7) : selectedMonth}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedMonth(e.target.value);
                  }
                }}
                onClick={() => {
                  if (selectedMonth === 'ALL') {
                    setSelectedMonth(new Date().toISOString().substring(0, 7));
                  }
                }}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold transition-colors bg-[#0B0E14] focus:outline-none cursor-pointer ${
                  selectedMonth !== 'ALL'
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
                title="Динамический выбор месяца"
              />
              <button
                type="button"
                onClick={() => setSelectedMonth('ALL')}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider transition-colors bg-transparent ${
                  selectedMonth === 'ALL'
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                ВСЕ МЕСЯЦЫ
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery ?? ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Квитанция / ФИО / IMEI..."
                className="rounded bg-[#0B0E14] border border-slate-800 pl-8 pr-3 py-1 text-xs font-mono text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </div>

            <select
              value={statusFilter ?? 'ALL'}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0B0E14] border border-slate-800 text-slate-200 text-xs font-mono rounded px-2.5 py-1 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">ВСЕ РЕМОНТЫ ЗА МЕСЯЦ</option>
              <option value="ACTIVE">АКТИВНЫЕ РЕМОНТЫ</option>
              <option value="ISSUED">ОТРЕМОНТИРОВАННЫЕ И ВЫДАННЫЕ</option>
              <option value="ACCEPTED">ПРИНЯТ</option>
              <option value="IN_PROGRESS">В РАБОТЕ</option>
              <option value="READY">ГОТОВ К ВЫДАЧЕ</option>
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-[#0B0E14] font-mono">
        {activeTab === 'create' ? (
          <form onSubmit={handleCreateTicket} className="max-w-xl mx-auto p-4 space-y-4">
            <div className="border border-slate-800 rounded-lg bg-[#0F1219] p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center space-x-2 border-b border-slate-800 pb-2.5">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <span>ОФОРМЛЕНИЕ ПРИЕМА НА ГАРАНТИЙНЫЙ РЕМОНТ</span>
              </h3>

              {/* RECEIPT / IMEI SEARCH BAR */}
              <div className="p-3 bg-[#0B0E14] rounded-lg border border-emerald-500/40 space-y-2">
                <label className="block text-[10px] uppercase font-bold text-emerald-400 items-center space-x-1.5">
                  <Search className="w-3.5 h-3.5" />
                  <span>ПОИСК ПО НОМЕРУ ЧЕКА ИЛИ IMEI / БАРКОДУ:</span>
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={receiptQuery}
                    onChange={(e) => handleReceiptLookup(e.target.value)}
                    placeholder="Введите # чека (напр. 1058) или IMEI устройства..."
                    className="flex-1 rounded bg-[#0F1219] border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleReceiptLookup(receiptQuery)}
                    className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shrink-0"
                  >
                    НАЙТИ ЧЕК
                  </button>
                </div>
                {saleReceiptNumber && (
                  <p className="text-[10px] text-emerald-300">
                    ✓ Привязан Чек #{saleReceiptNumber} ({saleDate ? new Date(saleDate).toLocaleDateString('ru-RU') : ''})
                  </p>
                )}
              </div>

              {/* MANDATORY CUSTOMER & PHONE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                    ФИО Клиента <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName ?? ''}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Алишер Рахимов"
                    className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                    Телефон клиента <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone ?? ''}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+992 90 123 4567"
                    className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* MODEL & IMEI / SERIAL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                    Модель устройства <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={deviceModel ?? ''}
                    onChange={(e) => setDeviceModel(e.target.value)}
                    placeholder="iPhone 16 Pro"
                    className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                    Штрихкод / EAN <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={barcode ?? ''}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="690123456789"
                    className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs font-mono text-amber-400 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                    IMEI 1 <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={imei ?? ''}
                    onChange={(e) => setImei(e.target.value)}
                    placeholder="351234567890123"
                    className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                    IMEI 2 <span className="text-slate-500 font-normal font-sans">(опционально / по желанию)</span>
                  </label>
                  <input
                    type="text"
                    value={imei2 ?? ''}
                    onChange={(e) => setImei2(e.target.value)}
                    placeholder="351234567890124 (по желанию)"
                    className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* PROBLEM DESCRIPTION */}
              <div>
                <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                  Причина обращения / Неисправность <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={issueDescription ?? ''}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="Опишите поломку: не включается, замена дисплея, гнездо зарядки..."
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* REPAIR COST (AUTOLOGGED TO EXPENSES) */}
              <div className="p-3 bg-[#0B0E14] rounded-lg border border-slate-800 space-y-2">
                <label className="block text-[10px] uppercase font-bold text-slate-300">
                  Сумма затрат на ремонт (TJS) — списывается в расходы:
                </label>
                <input
                  type="number"
                  value={repairCostTjs}
                  onChange={(e) => {
                    setRepairCostTjs(e.target.value);
                    setEstimatedCostTjs(e.target.value);
                  }}
                  placeholder="Например: 250 TJS (запчасти / работа)"
                  className="w-full rounded bg-[#0F1219] border border-slate-700 px-3 py-1.5 text-xs font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500">
                  Указанная сумма будет автоматически занесена в <strong className="text-slate-300">Учет расходов (/expenses)</strong> с привязкой к этой квитанции.
                </p>
              </div>

              {statusMessage && (
                <div className={`p-2.5 rounded text-xs flex items-center space-x-1.5 font-mono ${
                  statusMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{statusMessage.text}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-xs font-mono font-bold text-black shadow-[0_0_12px_rgba(16,185,129,0.5)] transition-colors uppercase tracking-wider"
              >
                ОФОРМИТЬ КВИТАНЦИЮ НА РЕМОНТ
              </button>
            </div>
          </form>
        ) : (
          /* List of Repairs */
          <div className="divide-y divide-slate-800/50">
            {/* MONTHLY SUMMARY BANNER */}
            <div className="p-3 bg-[#0F1219] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <span className="text-slate-400">ПЕРИОД:</span>
                <span className="font-bold text-emerald-400 uppercase tracking-wider">{formatMonthLabel(selectedMonth)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-[11px]">
                <span>
                  Всего ремонтов: <strong className="text-slate-200">{monthlyRepairs.length}</strong>
                </span>
                <span>
                  Отремонтировано / Готово: <strong className="text-emerald-400">{monthlyCompletedCount}</strong>
                </span>
                <span>
                  Затраты (Расходы): <strong className="text-rose-400 font-bold">{monthlyTotalCostTjs.toLocaleString()} TJS</strong>
                </span>
              </div>
            </div>

            {filteredRepairs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs uppercase tracking-wider">
                Квитанции на ремонт за {formatMonthLabel(selectedMonth)} не найдены
              </div>
            ) : (
              filteredRepairs.map((ticket) => {
                const conf = REPAIR_STATUS_CONFIG[ticket.status] || REPAIR_STATUS_CONFIG.ACCEPTED;
                const costToShow = ticket.finalCostTjs || ticket.estimatedCostTjs || 0;

                return (
                  <div key={ticket.id} className="p-3.5 hover:bg-slate-800/30 transition-colors space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-emerald-400">Кв. #{ticket.ticketNumber}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase border ${conf.bg} ${conf.color} ${conf.border}`}>
                            {conf.label}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('ru-RU') : ''}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 mt-1">
                          {ticket.brand || ''} {ticket.deviceModel || ticket.model || 'Телефон'} {ticket.storage ? `(${ticket.storage})` : ''}
                        </h4>
                        {ticket.imei && (
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                            IMEI: {ticket.imei}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {ticket.issueDescription || ticket.problemDescription}
                        </p>
                      </div>

                      <div className="text-right shrink-0 font-mono">
                        <span className="text-xs font-bold text-slate-100">
                          {costToShow} TJS
                        </span>
                        <span className="block text-[9px] text-slate-500">
                          Расход на ремонт
                        </span>
                        {(ticket.prepaymentTjs ?? 0) > 0 && (
                          <span className="block text-[9px] text-emerald-400 font-bold">
                            Предоплата: {ticket.prepaymentTjs ?? 0} TJS
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                      <div className="flex items-center space-x-3">
                        <span className="flex items-center space-x-1 text-[11px]">
                          <User className="w-3 h-3 text-slate-500" />
                          <span>{ticket.customerName}</span>
                        </span>
                        <span className="flex items-center space-x-1 font-mono text-[11px]">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{ticket.customerPhone}</span>
                        </span>
                      </div>

                      {/* Status changer buttons */}
                      <div className="flex items-center space-x-1.5">
                        {ticket.status === 'ACCEPTED' && (
                          <button
                            onClick={() => updateRepairStatus(ticket.id, 'IN_PROGRESS')}
                            className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[10px] font-mono font-bold text-amber-400 transition-colors"
                          >
                            В РАБОТУ
                          </button>
                        )}
                        {ticket.status === 'IN_PROGRESS' && (
                          <button
                            onClick={() => updateRepairStatus(ticket.id, 'READY')}
                            className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-sky-500/20 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400 transition-colors"
                          >
                            ГОТОВ К ВЫДАЧЕ
                          </button>
                        )}
                        {ticket.status === 'READY' && (
                          <button
                            onClick={() => handleOpenIssueModal(ticket)}
                            className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-white text-[10px] font-mono font-bold shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-colors"
                          >
                            ВЫДАТЬ КЛИЕНТУ
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* MODAL: Issue repair to customer */}
      {isIssueModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-sm rounded-lg bg-[#0F1219] border border-slate-800 p-5 text-slate-200 shadow-2xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-1">Выдача устройства</h4>
            <p className="text-[11px] text-slate-400 mb-3">{selectedTicket.ticketNumber} — {selectedTicket.deviceModel}</p>

            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1">Финальная стоимость ремонта (TJS):</label>
                <input
                  type="number"
                  value={finalCostInput ?? ''}
                  onChange={(e) => setFinalCostInput(e.target.value)}
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {(selectedTicket.prepaymentTjs ?? 0) > 0 && (
                <div className="flex justify-between text-slate-400 p-2 rounded bg-[#0B0E14] border border-slate-800">
                  <span className="text-[10px] uppercase">Учтена предоплата:</span>
                  <span className="font-mono font-bold text-emerald-400">-{selectedTicket.prepaymentTjs ?? 0} TJS</span>
                </div>
              )}

              <div className="flex justify-between text-xs font-bold pt-1">
                <span className="uppercase text-slate-300">К доплате:</span>
                <span className="font-mono text-sm text-emerald-400">
                  {Math.max(0, (parseFloat(finalCostInput) || 0) - (selectedTicket.prepaymentTjs ?? 0))} TJS
                </span>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1">Способ оплаты остатка:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIssuePaymentMethod('CASH')}
                    className={`py-1.5 px-2 rounded border text-[11px] font-mono font-bold uppercase transition-colors ${
                      issuePaymentMethod === 'CASH' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-[#0B0E14] border-slate-800 text-slate-400'
                    }`}
                  >
                    Наличные
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssuePaymentMethod('CARD')}
                    className={`py-1.5 px-2 rounded border text-[11px] font-mono font-bold uppercase transition-colors ${
                      issuePaymentMethod === 'CARD' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-[#0B0E14] border-slate-800 text-slate-400'
                    }`}
                  >
                    Карта
                  </button>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => setIsIssueModalOpen(false)}
                className="flex-1 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300"
              >
                ОТМЕНА
              </button>
              <button
                onClick={handleConfirmIssue}
                className="flex-1 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-black shadow-[0_0_10px_rgba(16,185,129,0.5)]"
              >
                ПОДТВЕРДИТЬ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
