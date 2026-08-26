import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { RepairTicket, RepairStatus } from '../../types';
import {
  Wrench,
  Plus,
  Search,
  AlertCircle,
  PackageCheck,
  X
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';

export const RepairPage: React.FC = () => {
  const {
    currentUser,
    repairs,
    sales,
    devices,
    stores,
    createRepairTicket,
    updateRepairStatus,
    openScanner
  } = useApp();

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Form states for NEW TICKET
  const [receiptSearch, setReceiptSearch] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [imei, setImei] = useState('');
  const [barcode, setBarcode] = useState('');
  const [defectDescription, setDefectDescription] = useState('');
  const [estimatedCostTjs, setEstimatedCostTjs] = useState<string>('0');
  const [prepaymentTjs, setPrepaymentTjs] = useState<string>('0');
  const [masterNote, setMasterNote] = useState('');

  // Modal state for ISSUING REPAIR & SETTLEMENT
  const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(null);
  const [issueFinalCost, setIssueFinalCost] = useState<string>('0');
  const [issuePaymentMethod, setIssuePaymentMethod] = useState<'CASH' | 'CARD'>('CASH');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);

  const effectiveStoreId = currentUser?.storeId || '';
  const currentStoreName = stores.find(s => s.id === effectiveStoreId)?.name || currentUser?.storeName || 'Главный склад';

  const filteredRepairs = useMemo(() => {
    return (repairs || []).filter((t: RepairTicket) => {
      // Month filter
      if (selectedMonth !== 'ALL' && t.createdAt) {
        const ticketMonth = t.createdAt.substring(0, 7);
        if (ticketMonth !== selectedMonth) return false;
      }

      // Status filter
      if (statusFilter === 'ACTIVE') {
        if (t.status === 'ISSUED') return false;
      } else if (statusFilter === 'ISSUED') {
        if (t.status !== 'ISSUED') return false;
      } else if (statusFilter !== 'ALL') {
        if (t.status !== statusFilter) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          t.ticketNumber.toString().includes(q) ||
          (t.customerName && t.customerName.toLowerCase().includes(q)) ||
          (t.customerPhone && t.customerPhone.toLowerCase().includes(q)) ||
          (t.deviceModel && t.deviceModel.toLowerCase().includes(q)) ||
          (t.model && t.model.toLowerCase().includes(q)) ||
          (t.imei && t.imei.toLowerCase().includes(q)) ||
          (t.barcode && t.barcode.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    }).sort((a: RepairTicket, b: RepairTicket) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [repairs, selectedMonth, statusFilter, searchQuery]);

  // Statistics for selected month
  const totalRepairsCount = filteredRepairs.length;
  const readyRepairsCount = filteredRepairs.filter((t: RepairTicket) => t.status === 'READY' || t.status === 'ISSUED').length;
  const totalExpensesTjs = filteredRepairs.reduce((acc: number, t: RepairTicket) => acc + (t.estimatedCostTjs || 0), 0);

  const handleScanTicket = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const matched = sales.find(s => s.receiptNumber.toString() === code);
      if (matched) {
        const item = matched.items[0];
        if (item) {
          setDeviceModel(`${item.brand} ${item.model} ${item.storage}`);
          if (item.imei) setImei(item.imei);
          if (item.barcode) setBarcode(item.barcode);
          if (matched.customerName) setClientName(matched.customerName);
          setStatusMessage({ type: 'success', text: `Данные из чека #${code} автоматически подставлены` });
          return;
        }
      }

      const devMatch = devices.find(d => d.imei === code || d.barcode === code);
      if (devMatch) {
        setDeviceModel(`${devMatch.brand} ${devMatch.model} ${devMatch.storage}`);
        if (devMatch.imei) setImei(devMatch.imei);
        if (devMatch.barcode) setBarcode(devMatch.barcode);
        setStatusMessage({ type: 'success', text: `Данные устройства ${devMatch.brand} ${devMatch.model} подставлены` });
        return;
      }

      setImei(code);
    });
  };

  const handleFindSoldDevice = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    for (const sale of sales) {
      if (sale.receiptNumber.toString() === q) {
        const item = sale.items[0];
        if (item) {
          setDeviceModel(`${item.brand} ${item.model} ${item.storage}`);
          if (item.imei) setImei(item.imei);
          if (item.barcode) setBarcode(item.barcode);
          if (sale.customerName) setClientName(sale.customerName);
          setStatusMessage({ type: 'success', text: `Найдена покупка по чеку #${sale.receiptNumber}` });
          return;
        }
      }
      for (const item of sale.items) {
        if (item.imei.toLowerCase() === q || (item.barcode && item.barcode.toLowerCase() === q)) {
          setDeviceModel(`${item.brand} ${item.model} ${item.storage}`);
          if (item.imei) setImei(item.imei);
          if (item.barcode) setBarcode(item.barcode);
          if (sale.customerName) setClientName(sale.customerName);
          setStatusMessage({ type: 'success', text: `Найдено устройство по IMEI/штрихкоду` });
          return;
        }
      }
    }

    const devMatch = devices.find(d => d.imei.toLowerCase() === q || (d.barcode && d.barcode.toLowerCase() === q));
    if (devMatch) {
      setDeviceModel(`${devMatch.brand} ${devMatch.model} ${devMatch.storage}`);
      if (devMatch.imei) setImei(devMatch.imei);
      if (devMatch.barcode) setBarcode(devMatch.barcode);
      setStatusMessage({ type: 'success', text: `Устройство найдено в каталоге` });
      return;
    }

    setStatusMessage({ type: 'error', text: `Устройство или чек "${query}" не найдено` });
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientPhone.trim() || !deviceModel.trim() || !defectDescription.trim()) {
      setStatusMessage({ type: 'error', text: 'Заполните обязательные поля (ФИО клиента, Телефон, Модель, Описание поломки)' });
      return;
    }

    const modelParts = deviceModel.trim().split(' ');
    const brand = modelParts[0] || 'Unknown';
    const model = modelParts.slice(1).join(' ') || 'Device';

    const res = await createRepairTicket({
      imei: imei.trim() || 'N/A',
      barcode: barcode.trim() || undefined,
      brand,
      model,
      storage: 'N/A',
      color: 'N/A',
      customerName: clientName.trim(),
      customerPhone: clientPhone.trim(),
      problemDescription: defectDescription.trim(),
      comment: masterNote.trim() || undefined,
      estimatedCostTjs: parseFloat(estimatedCostTjs) || 0,
    });

    if (res.success) {
      setStatusBanner({ tone: 'success', text: `Прием в ремонт успешно оформлен! Квитанция #${res.ticketNumber || ''}` });
      setActiveTab('list');
      setClientName('');
      setClientPhone('');
      setDeviceModel('');
      setImei('');
      setBarcode('');
      setDefectDescription('');
      setEstimatedCostTjs('0');
      setPrepaymentTjs('0');
      setMasterNote('');
      setReceiptSearch('');
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания квитанции' });
    }
  };

  const handleUpdateStatusQuick = async (ticketId: string, status: RepairStatus) => {
    const res = await updateRepairStatus(ticketId, status);
    if (res.success) {
      setStatusBanner({ tone: 'success', text: 'Статус ремонта успешно обновлен' });
    } else {
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка обновления статуса' });
    }
  };

  const handleOpenIssueModal = (ticket: RepairTicket) => {
    setSelectedTicket(ticket);
    setIssueFinalCost((ticket.estimatedCostTjs || 0).toString());
    setIssuePaymentMethod('CASH');
  };

  const handleConfirmIssueTicket = async () => {
    if (!selectedTicket) return;
    const finalCost = parseFloat(issueFinalCost) || 0;

    const res = await updateRepairStatus(selectedTicket.id, 'ISSUED', 'Выдано клиенту', finalCost);

    setSelectedTicket(null);
    if (res.success) {
      setStatusBanner({ tone: 'success', text: `Ремонт по квитанции #${selectedTicket.ticketNumber} успешно выдан клиенту!` });
    } else {
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка выдачи ремонта' });
    }
  };

  const getStatusBadge = (status: RepairStatus) => {
    switch (status) {
      case 'ACCEPTED':
        return { label: 'ПРИНЯТ', color: 'bg-info/15 text-info border-info/30' };
      case 'IN_PROGRESS':
        return { label: 'В РАБОТЕ', color: 'bg-warning/15 text-warning border-warning/30' };
      case 'READY':
        return { label: 'ГОТОВ К ВЫДАЧЕ', color: 'bg-accent/15 text-accent border-accent/30' };
      case 'ISSUED':
        return { label: 'ВЫДАН КЛИЕНТУ', color: 'bg-surface-raised text-fg-subtle border-border' };
      default:
        return { label: status, color: 'bg-surface-raised text-fg-subtle border-border' };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />

      {/* Header Tabs & Filters */}
      <div className="p-3 border-b border-border bg-bg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'list'
                ? 'bg-accent/15 text-accent border border-accent/40'
                : 'bg-surface text-fg-muted hover:text-fg border border-border'
            }`}
          >
            ЖУРНАЛ РЕМОНТОВ ({filteredRepairs.length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-colors ${
              activeTab === 'create'
                ? 'bg-accent/15 text-accent border border-accent/40'
                : 'bg-surface text-fg-muted hover:text-fg border border-border'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>ПРИЕМ В РЕМОНТ</span>
          </button>
        </div>

        {activeTab === 'list' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="month"
              value={selectedMonth === 'ALL' ? new Date().toISOString().substring(0, 7) : selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors bg-surface focus:outline-none cursor-pointer ${
                selectedMonth !== 'ALL'
                  ? 'border-accent text-accent'
                  : 'border-border text-fg-muted hover:border-fg-subtle'
              }`}
              title="Динамический выбор месяца"
            />
            <button
              type="button"
              onClick={() => setSelectedMonth('ALL')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                selectedMonth === 'ALL'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface text-fg-muted hover:text-fg'
              }`}
            >
              ВСЕ МЕСЯЦЫ
            </button>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-fg-subtle" />
              <input
                type="text"
                value={searchQuery ?? ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Квитанция / ФИО / IMEI..."
                className="rounded-xl bg-surface border border-border pl-9 pr-3 py-1.5 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
              />
            </div>

            <select
              value={statusFilter ?? 'ALL'}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface border border-border text-fg text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent"
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
      <div className="flex-1 overflow-y-auto bg-bg p-3 sm:p-4">
        {statusMessage && (
          <div
            className={`max-w-xl mx-auto mb-3 p-3 rounded-xl text-xs flex items-center space-x-2 ${
              statusMessage.type === 'success'
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-danger/15 text-danger border border-danger/30'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {activeTab === 'create' ? (
          <form onSubmit={handleCreateTicket} className="max-w-xl mx-auto space-y-4">
            <div className="border border-border rounded-xl bg-surface p-5 space-y-4 shadow-xs">
              <h3 className="text-xs md:text-sm font-bold uppercase tracking-wide text-fg flex items-center space-x-2 border-b border-border pb-3">
                <Wrench className="w-4 h-4 text-accent" />
                <span>ОФОРМЛЕНИЕ ПРИЕМА НА ГАРАНТИЙНЫЙ РЕМОНТ</span>
              </h3>

              {/* RECEIPT / IMEI SEARCH BAR */}
              <div className="p-3 bg-surface-raised rounded-xl border border-accent/40 space-y-2">
                <label className="block text-[10px] uppercase font-bold text-accent">
                  ПОИСК В БАЗЕ ПРОДАЖ ПО НОМЕРУ ЧЕКА ИЛИ IMEI:
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={receiptSearch ?? ''}
                    onChange={(e) => setReceiptSearch(e.target.value)}
                    placeholder="Введите номер чека или IMEI..."
                    className="flex-1 rounded-lg bg-surface border border-border px-3 py-1.5 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleFindSoldDevice(receiptSearch)}
                    className="px-3 py-1.5 bg-accent hover:bg-accent-strong text-xs font-bold rounded-lg text-accent-fg"
                  >
                    НАЙТИ
                  </button>
                  <button
                    type="button"
                    onClick={handleScanTicket}
                    className="px-3 py-1.5 bg-surface hover:bg-surface-raised text-accent rounded-lg border border-border"
                    title="Сканировать"
                  >
                    СКАНИРОВАТЬ
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase">ФИО клиента *</label>
                  <input
                    type="text"
                    required
                    value={clientName ?? ''}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Иван Иванов"
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Телефон *</label>
                  <input
                    type="text"
                    required
                    value={clientPhone ?? ''}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+992 900 000 000"
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Модель устройства *</label>
                  <input
                    type="text"
                    required
                    value={deviceModel ?? ''}
                    onChange={(e) => setDeviceModel(e.target.value)}
                    placeholder="iPhone 15 Pro Max 256GB"
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-fg-subtle mb-1 text-[11px] uppercase">IMEI устройства</label>
                    <input
                      type="text"
                      value={imei ?? ''}
                      onChange={(e) => setImei(e.target.value)}
                      placeholder="354891100234561"
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Штрихкод / S/N</label>
                    <input
                      type="text"
                      value={barcode ?? ''}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="BC-10023"
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Описание дефекта / Неисправности *</label>
                  <textarea
                    required
                    rows={3}
                    value={defectDescription ?? ''}
                    onChange={(e) => setDefectDescription(e.target.value)}
                    placeholder="Не заряжается, разбито стекло дисплея..."
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg placeholder-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Предварительная стоимость (TJS)</label>
                    <input
                      type="number"
                      min="0"
                      value={estimatedCostTjs}
                      onChange={(e) => setEstimatedCostTjs(e.target.value)}
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-warning font-bold focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Предоплата (TJS)</label>
                    <input
                      type="number"
                      min="0"
                      value={prepaymentTjs}
                      onChange={(e) => setPrepaymentTjs(e.target.value)}
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Заметка мастера / Сервиса</label>
                  <input
                    type="text"
                    value={masterNote ?? ''}
                    onChange={(e) => setMasterNote(e.target.value)}
                    placeholder="Запчасти заказаны..."
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-xs font-bold text-accent-fg uppercase tracking-wider transition-all shadow-xs mt-2"
              >
                ОФОРМИТЬ И ВЫДАТЬ КВИТАНЦИЮ
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {/* Summary Bar */}
            <div className="p-3 bg-surface border border-border rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-fg-muted">
                ПЕРИОД: <strong className="text-accent uppercase">{selectedMonth === 'ALL' ? 'Все время' : selectedMonth}</strong>
              </div>
              <div className="flex items-center space-x-4 text-xs">
                <span>Всего ремонтов: <strong className="text-fg">{totalRepairsCount}</strong></span>
                <span>Отремонтировано / Готово: <strong className="text-accent">{readyRepairsCount}</strong></span>
                <span>Затраты (Расходы): <strong className="text-accent">{totalExpensesTjs.toLocaleString()} TJS</strong></span>
              </div>
            </div>

            {/* List of Tickets */}
            {filteredRepairs.length === 0 ? (
              <div className="p-12 text-center text-fg-muted text-xs uppercase tracking-wider">
                Квитанции на ремонт не найдены
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRepairs.map((ticket: RepairTicket) => {
                  const conf = getStatusBadge(ticket.status);
                  const isReady = ticket.status === 'READY';

                  return (
                    <div
                      key={ticket.id}
                      className="p-4 rounded-xl bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition-colors hover:border-fg-subtle"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-accent">Кв. #{ticket.ticketNumber}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${conf.color}`}>
                            {conf.label}
                          </span>
                          <span className="text-[11px] text-fg-subtle">
                            • {new Date(ticket.createdAt).toLocaleDateString()} ({ticket.storeName || 'Магазин'})
                          </span>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-fg">{ticket.deviceModel || `${ticket.brand || ''} ${ticket.model || ''}`}</h4>
                          <p className="text-xs text-fg-muted mt-0.5">
                            Клиент: <strong className="text-fg">{ticket.customerName || 'Клиент'}</strong> ({ticket.customerPhone || 'N/A'})
                          </p>
                          <p className="text-xs text-danger/90 mt-0.5">
                            Дефект: {ticket.problemDescription}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col md:items-end justify-between shrink-0 space-y-2">
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-fg-subtle uppercase block">Стоимость / Предоплата</span>
                          <span className="text-xs font-bold text-accent">
                            {ticket.estimatedCostTjs || 0} TJS
                          </span>
                          {ticket.prepaymentTjs ? (
                            <span className="text-[10px] text-accent block">(Аванс: {ticket.prepaymentTjs} TJS)</span>
                          ) : null}
                        </div>

                        {/* Quick action buttons depending on status */}
                        <div className="flex items-center space-x-1.5">
                          {ticket.status === 'ACCEPTED' && (
                            <button
                              onClick={() => handleUpdateStatusQuick(ticket.id, 'IN_PROGRESS')}
                              className="px-3 py-1 rounded-lg bg-warning/15 hover:bg-warning/25 border border-warning/30 text-xs font-bold text-warning transition-colors"
                            >
                              В РАБОТУ
                            </button>
                          )}
                          {(ticket.status === 'ACCEPTED' || ticket.status === 'IN_PROGRESS') && (
                            <button
                              onClick={() => handleUpdateStatusQuick(ticket.id, 'READY')}
                              className="px-3 py-1 rounded-lg bg-accent/20 hover:bg-accent/30 border border-accent/30 text-xs font-bold text-accent transition-colors"
                            >
                              ГОТОВ
                            </button>
                          )}
                          {isReady && (
                            <button
                              onClick={() => handleOpenIssueModal(ticket)}
                              className="px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold shadow-xs transition-colors"
                            >
                              ВЫДАТЬ КЛИЕНТУ
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: ISSUE REPAIR TICKET */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold uppercase text-fg flex items-center space-x-2">
                <PackageCheck className="w-4 h-4 text-accent" />
                <span>ВЫДАЧА РЕМОНТА КЛИЕНТУ</span>
              </h3>
              <button onClick={() => setSelectedTicket(null)} className="text-fg-subtle hover:text-fg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-1">
              <p className="font-bold text-fg">Квитанция #{selectedTicket.ticketNumber}</p>
              <p className="text-fg-muted">{selectedTicket.deviceModel || selectedTicket.model}</p>
              <p className="text-fg-subtle">Клиент: {selectedTicket.customerName} ({selectedTicket.customerPhone})</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Итоговая стоимость ремонта (TJS):</label>
                <input
                  type="number"
                  min="0"
                  value={issueFinalCost}
                  onChange={(e) => setIssueFinalCost(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-accent font-bold focus:border-accent focus:outline-none"
                />
              </div>

              {selectedTicket.prepaymentTjs ? (
                <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20 flex justify-between items-center text-xs">
                  <span>Учтен аванс (предоплата):</span>
                  <span className="font-bold text-accent">-{selectedTicket.prepaymentTjs} TJS</span>
                </div>
              ) : null}

              <div className="pt-1 flex justify-between items-center text-xs">
                <span className="text-fg-muted uppercase font-semibold">Остаток к оплате клиентом:</span>
                <span className="text-sm font-bold text-accent">
                  {Math.max(0, (parseFloat(issueFinalCost) || 0) - (selectedTicket.prepaymentTjs || 0)).toLocaleString()} TJS
                </span>
              </div>

              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Способ оплаты:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIssuePaymentMethod('CASH')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase transition-colors ${
                      issuePaymentMethod === 'CASH'
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border bg-surface-raised text-fg-muted'
                    }`}
                  >
                    Наличные
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssuePaymentMethod('CARD')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase transition-colors ${
                      issuePaymentMethod === 'CARD'
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border bg-surface-raised text-fg-muted'
                    }`}
                  >
                    Карта / Перевод
                  </button>
                </div>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setSelectedTicket(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmIssueTicket}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-xs font-bold text-accent-fg uppercase"
              >
                Подтвердить выдачу
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
