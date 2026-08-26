import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Supplier, SupplierInvoice } from '../../types';
import {
  Truck,
  Plus,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  X,
  CreditCard,
  Building,
  Edit,
  Trash2
} from 'lucide-react';

const formatDateStr = (dateVal?: string) => {
  if (!dateVal) return '-';
  const clean = dateVal.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return clean;
};

export const SuppliersPage: React.FC = () => {
  const {
    currentUser,
    suppliers,
    supplierInvoices,
    devices,
    stores,
    todayRate,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    paySupplier
  } = useApp();

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) || null;
  const selectedInvoice = supplierInvoices.find(inv => inv.id === selectedInvoiceId) || null;
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  // Pay form state
  const [paymentAmountUsd, setPaymentAmountUsd] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState(stores[0]?.id || 'main-warehouse');
  const [paymentNote, setPaymentNote] = useState('');

  // Add supplier state
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierContact, setNewSupplierContact] = useState('');

  // Edit & Delete Supplier state
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editSupplierPhone, setEditSupplierPhone] = useState('');
  const [editSupplierContact, setEditSupplierContact] = useState('');
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);

  // Edit & Delete Invoice state
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editInvoiceAmount, setEditInvoiceAmount] = useState('');
  const [deletingInvoice, setDeletingInvoice] = useState<SupplierInvoice | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p className="text-sm font-medium">Доступ ограничен</p>
        <p className="text-xs text-zinc-600 mt-1">Раздел поставщиков доступен только Администраторам и Партнерам</p>
      </div>
    );
  }

  const handleOpenPay = (supplier: Supplier) => {
    setSelectedSupplierId(supplier.id);
    setPaymentAmountUsd(supplier.totalDebtUsd.toString());
    setPaymentNote(`Оплата поставщику ${supplier.name}`);
    setIsPayModalOpen(true);
  };

  const handleExecutePayment = async () => {
    if (!selectedSupplier) return;
    const amt = parseFloat(paymentAmountUsd) || 0;
    if (amt <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите положительную сумму оплаты' });
      return;
    }

    const res = await paySupplier({
      supplierId: selectedSupplier.id,
      amountUsd: amt,
      sourceAccountId,
      note: paymentNote.trim() || undefined
    });

    if (res.success) {
      setIsPayModalOpen(false);
      setStatusMessage(null);
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка оплаты' });
    }
  };

  const handleAddSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;

    createSupplier({
      name: newSupplierName.trim(),
      phone: newSupplierPhone.trim() || undefined,
      contactPerson: newSupplierContact.trim() || undefined
    });

    setIsAddSupplierOpen(false);
    setNewSupplierName('');
    setNewSupplierPhone('');
    setNewSupplierContact('');
    setStatusMessage(null);
  };

  const handleStartEditSupplier = (sup: Supplier, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingSupplier(sup);
    setEditSupplierName(sup.name);
    setEditSupplierPhone(sup.phone || '');
    setEditSupplierContact(sup.contactPerson || '');
  };

  const handleSaveEditSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !editSupplierName.trim()) return;
    const res = await updateSupplier(editingSupplier.id, {
      name: editSupplierName.trim(),
      phone: editSupplierPhone.trim() || undefined,
      contactPerson: editSupplierContact.trim() || undefined,
    });
    if (res.success) {
      setEditingSupplier(null);
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления поставщика' });
    }
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!deletingSupplier) return;
    const supId = deletingSupplier.id;
    const res = await deleteSupplier(supId);
    if (res.success) {
      setDeletingSupplier(null);
      if (selectedSupplierId === supId) {
        setSelectedSupplierId(null);
      }
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления поставщика' });
    }
  };

  const handleStartEditInvoice = (inv: SupplierInvoice, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingInvoice(inv);
    setEditInvoiceNumber(inv.invoiceNumber);
    setEditInvoiceDate(inv.date.split('T')[0]);
    setEditInvoiceAmount(inv.totalAmountUsd.toString());
  };

  const handleSaveEditInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice || !editInvoiceNumber.trim()) return;
    const res = await updateSupplierInvoice(editingInvoice.id, {
      invoiceNumber: editInvoiceNumber.trim(),
      date: editInvoiceDate,
      totalAmountUsd: parseFloat(editInvoiceAmount) || 0,
    });
    if (res.success) {
      setEditingInvoice(null);
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления накладной' });
    }
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!deletingInvoice) return;
    const invId = deletingInvoice.id;
    const res = await deleteSupplierInvoice(invId);
    if (res.success) {
      setDeletingInvoice(null);
      if (selectedInvoiceId === invId) {
        setSelectedInvoiceId(null);
      }
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления накладной' });
    }
  };

  const totalAllDebt = suppliers.reduce((acc, s) => acc + s.totalDebtUsd, 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      {/* Top Header */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface flex items-center justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide flex items-center space-x-1.5">
            <Truck className="w-4 h-4 text-accent" />
            <span>ПОСТАВЩИКИ И НАКЛАДНЫЕ</span>
          </h3>
          <p className="text-xs text-fg-muted mt-0.5">
            Общий текущий долг перед поставщиками: <strong className="text-danger font-bold">${totalAllDebt.toLocaleString()}</strong>
          </p>
        </div>

        <button
          onClick={() => setIsAddSupplierOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg flex items-center space-x-1.5 shrink-0 transition-colors shadow-xs"
          title="Добавить поставщика"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>ДОБАВИТЬ ПОСТАВЩИКА</span>
        </button>
      </div>

      {statusMessage && statusMessage.type === 'error' && (
        <div className="mx-4 mt-3 p-2.5 rounded text-xs flex items-center justify-between shrink-0 bg-rose-950/50 text-rose-300 border border-rose-800">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-rose-400 hover:text-white ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Grid for Desktop & List for Mobile */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden">
        {/* Left Column: Suppliers list */}
        <div className="lg:col-span-1 flex flex-col overflow-hidden bg-surface">
          <div className="p-3 border-b border-border bg-surface-raised font-bold text-xs text-fg uppercase tracking-wide">
            Список контрагентов ({suppliers.length})
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
            {suppliers.map((s) => {
              const isSelected = selectedSupplier?.id === s.id;

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSupplierId(s.id)}
                  className={`w-full text-left p-3.5 hover:bg-surface-raised flex items-center justify-between transition-colors ${
                    isSelected ? 'bg-accent/10 border-l-4 border-accent font-semibold' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <h4 className="text-sm font-semibold text-zinc-100">{s.name}</h4>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-600 lg:hidden" />
                    </div>
                    {s.contactPerson && (
                      <p className="text-xs text-zinc-400 mt-0.5">{s.contactPerson}</p>
                    )}
                    {s.phone && (
                      <p className="text-[11px] font-mono text-zinc-500 mt-0.5">{s.phone}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-rose-400">
                        ${(s.totalDebtUsd ?? 0).toLocaleString()}
                      </span>
                      <span className="block text-[10px] text-zinc-500">Долг</span>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleStartEditSupplier(s, e)}
                        className="p-1.5 rounded text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800"
                        title="Редактировать поставщика"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeletingSupplier(s); }}
                        className="p-1.5 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800"
                        title="Удалить поставщика"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Invoices & Payments for selected supplier (Desktop view) */}
        <div className="hidden lg:flex lg:col-span-2 flex-col overflow-hidden bg-zinc-950">
          {selectedSupplier ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Selected supplier summary header */}
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div>
                  <h4 className="text-base font-bold text-white">{selectedSupplier.name}</h4>
                  <div className="flex items-center space-x-3 text-xs mt-1">
                    <span className="text-zinc-400">Закуплено: <strong className="text-zinc-200 font-mono">${(selectedSupplier.totalPurchasedUsd ?? 0).toLocaleString()}</strong></span>
                    <span>•</span>
                    <span className="text-zinc-400">Выплачено: <strong className="text-emerald-400 font-mono">${(selectedSupplier.totalPaidUsd ?? 0).toLocaleString()}</strong></span>
                    <span>•</span>
                    <span className="text-zinc-400">Остаток долга: <strong className="text-rose-400 font-mono">${(selectedSupplier.totalDebtUsd ?? 0).toLocaleString()}</strong></span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenPay(selectedSupplier)}
                    disabled={selectedSupplier.totalDebtUsd <= 0}
                    className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white shadow transition-colors flex items-center space-x-1.5"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Погасить долг (FIFO)</span>
                  </button>
                  <button
                    onClick={() => handleStartEditSupplier(selectedSupplier)}
                    className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                    title="Редактировать поставщика"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeletingSupplier(selectedSupplier)}
                    className="p-2 rounded bg-zinc-800 hover:bg-rose-950/80 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition-colors"
                    title="Удалить поставщика"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedSupplierId(null)}
                    className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                    title="Закрыть"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Invoices List */}
              <div className="p-3 border-b border-zinc-800 bg-zinc-900/40 text-xs font-semibold text-zinc-300">
                Накладные и статус оплат
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80 bg-zinc-950">
                {supplierInvoices
                  .filter(inv => inv.supplierId === selectedSupplier.id)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((inv) => {
                    const isPaid = inv.status === 'PAID';
                    const isPartial = inv.status === 'PARTIALLY_PAID';

                    return (
                      <div
                        key={inv.id}
                        onClick={() => setSelectedInvoiceId(inv.id)}
                        className="p-4 hover:bg-zinc-900 cursor-pointer transition-colors flex items-center justify-between group"
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-bold text-zinc-200 group-hover:text-emerald-400 transition-colors">{inv.invoiceNumber}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                              isPaid ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                              isPartial ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                              'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            }`}>
                              {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-1">
                            Дата: {formatDateStr(inv.date)} • Устройств: {inv.devicesCount ?? 0} шт.
                          </p>
                        </div>

                        <div className="flex items-center space-x-2">
                          <div className="text-right">
                            <p className="text-xs font-mono font-bold text-zinc-100">
                              Всего: ${(inv.totalAmountUsd ?? 0).toLocaleString()}
                            </p>
                            <p className="text-[11px] font-mono text-rose-400">
                              Долг: ${(inv.remainingAmountUsd ?? 0).toLocaleString()}
                            </p>
                            <p className="text-[10px] font-mono text-emerald-400">
                              Оплачено: ${(inv.paidAmountUsd ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleStartEditInvoice(inv, e)}
                            className="p-1.5 rounded bg-zinc-900 text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-colors"
                            title="Редактировать накладную"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeletingInvoice(inv); }}
                            className="p-1.5 rounded bg-zinc-900 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition-colors"
                            title="Удалить накладную"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded bg-zinc-900 text-zinc-400 group-hover:text-white border border-zinc-800"
                            title="Детали накладной"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-500 text-xs">
              <FileText className="w-8 h-8 opacity-30 mb-2" />
              <p>Выберите поставщика слева для просмотра накладных и выплат</p>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE FULL-SCREEN MODAL FOR SELECTED SUPPLIER */}
      {selectedSupplier && (
        <div className="lg:hidden fixed inset-0 z-40 bg-[#0B0E14] flex flex-col">
          {/* Header with Title and prominent Close "X" Button */}
          <div className="p-3.5 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <Truck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white truncate max-w-50">
                {selectedSupplier.name}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setSelectedSupplierId(null)}
              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors flex items-center justify-center border border-zinc-700"
              title="Закрыть окно"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Supplier Metrics */}
          <div className="p-3.5 bg-zinc-900/60 border-b border-zinc-800 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-zinc-950/80 p-2 rounded border border-zinc-800">
              <span className="block text-[10px] text-zinc-400">Закуплено</span>
              <strong className="text-zinc-200 font-mono text-xs">
                ${(selectedSupplier.totalPurchasedUsd ?? 0).toLocaleString()}
              </strong>
            </div>
            <div className="bg-zinc-950/80 p-2 rounded border border-zinc-800">
              <span className="block text-[10px] text-zinc-400">Выплачено</span>
              <strong className="text-emerald-400 font-mono text-xs">
                ${(selectedSupplier.totalPaidUsd ?? 0).toLocaleString()}
              </strong>
            </div>
            <div className="bg-zinc-950/80 p-2 rounded border border-zinc-800">
              <span className="block text-[10px] text-zinc-400">Долг</span>
              <strong className="text-rose-400 font-mono text-xs">
                ${(selectedSupplier.totalDebtUsd ?? 0).toLocaleString()}
              </strong>
            </div>
          </div>

          {/* Action button */}
          <div className="p-3 bg-zinc-950 border-b border-zinc-800 shrink-0">
            <button
              onClick={() => handleOpenPay(selectedSupplier)}
              disabled={selectedSupplier.totalDebtUsd <= 0}
              className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white shadow flex items-center justify-center space-x-1.5 transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              <span>Погасить долг поставщику (FIFO)</span>
            </button>
          </div>

          {/* Invoices List */}
          <div className="p-2.5 bg-zinc-900/40 border-b border-zinc-800 text-xs font-semibold text-zinc-400 flex items-center justify-between">
            <span>Накладные поставщика</span>
            <span className="text-[11px] text-zinc-500 font-mono">
              {supplierInvoices.filter(inv => inv.supplierId === selectedSupplier.id).length} шт.
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80 bg-zinc-950 p-1">
            {supplierInvoices
              .filter(inv => inv.supplierId === selectedSupplier.id)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((inv) => {
                const isPaid = inv.status === 'PAID';
                const isPartial = inv.status === 'PARTIALLY_PAID';

                return (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className="p-3 hover:bg-zinc-900/80 active:bg-zinc-900 cursor-pointer transition-colors flex items-center justify-between group border-b border-zinc-800/60"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-zinc-200 group-hover:text-emerald-400 transition-colors">{inv.invoiceNumber}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                          isPaid ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                          isPartial ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                          'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}>
                          {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {formatDateStr(inv.date)} • {inv.devicesCount ?? 0} устройств
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="text-xs font-mono font-bold text-zinc-200">
                          ${(inv.totalAmountUsd ?? 0).toLocaleString()}
                        </p>
                        <p className="text-[11px] font-mono text-rose-400">
                          Долг: ${(inv.remainingAmountUsd ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="p-1 rounded bg-zinc-900 text-zinc-400 group-hover:text-white border border-zinc-800"
                        title="Детали накладной"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Mobile Footer with Close button */}
          <div className="p-3 border-t border-zinc-800 bg-zinc-900 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedSupplierId(null)}
              className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 flex items-center justify-center space-x-1.5 transition-colors border border-zinc-700"
            >
              <X className="w-4 h-4" />
              <span>ЗАКРЫТЬ КАРТОЧКУ ПОСТАВЩИКА</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Pay Supplier (FIFO auto distribution) */}
      {isPayModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-lg bg-zinc-900 border border-zinc-800 p-5 text-zinc-100 shadow-2xl">
            <h4 className="text-sm font-bold text-white mb-1">Выплата поставщику</h4>
            <p className="text-xs text-zinc-400 mb-4">{selectedSupplier.name} (Текущий долг: ${selectedSupplier.totalDebtUsd})</p>

            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block text-zinc-400 mb-1">Сумма оплаты ($ USD):</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={paymentAmountUsd ?? ''}
                    onChange={(e) => setPaymentAmountUsd(e.target.value)}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 font-mono text-emerald-400 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-zinc-500">$</span>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Списать с кассы / счета:</label>
                <select
                  value={sourceAccountId ?? ''}
                  onChange={(e) => setSourceAccountId(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
                >
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Остаток: {(s.cashBalanceTjs ?? 0).toLocaleString()} TJS)
                    </option>
                  ))}
                  <option value="owner-funds">Личные средства инвестора / Партнера</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Примечание:</label>
                <input
                  type="text"
                  value={paymentNote ?? ''}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="p-2.5 rounded bg-emerald-500/15 border border-emerald-900/40 text-[11px] text-emerald-300">
                Автоматическое погашение: средства распределятся по старейшим неоплаченным накладным (FIFO).
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
              >
                Отмена
              </button>
              <button
                onClick={handleExecutePayment}
                className="flex-1 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-white"
              >
                Оплатить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD SUPPLIER */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-lg bg-zinc-900 border border-zinc-800 p-5 shadow-2xl text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Building className="w-4 h-4 text-emerald-400" />
                <span>Добавить нового поставщика</span>
              </h3>
              <button
                onClick={() => setIsAddSupplierOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSupplierSubmit} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1">Название поставщика *</label>
                <input
                  type="text"
                  required
                  value={newSupplierName ?? ''}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Например: Xiaomi Tech Hub"
                  className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Контактное лицо</label>
                <input
                  type="text"
                  value={newSupplierContact ?? ''}
                  onChange={(e) => setNewSupplierContact(e.target.value)}
                  placeholder="Фарход"
                  className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Телефон</label>
                <input
                  type="tel"
                  value={newSupplierPhone ?? ''}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  placeholder="+992 90 000 0000"
                  className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-white"
                >
                  Добавить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INVOICE DETAILS */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl bg-[#0F1219] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            {/* Modal Header */}
            <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-[#0B0E14] flex items-center justify-between shrink-0 font-mono">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="text-xs font-bold text-slate-100 flex items-center space-x-2">
                    <span>НАКЛАДНАЯ {selectedInvoice.invoiceNumber}</span>
                    {(selectedInvoice.totalAmountUsd === 0 || selectedInvoice.invoiceNumber.includes('BONUS')) && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-normal">
                        🎯 Target Bonus ($0)
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Поставщик: {suppliers.find(s => s.id === selectedInvoice.supplierId)?.name || 'Поставщик'} • {formatDateStr(selectedInvoice.date)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedInvoiceId(null)}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Breakdown */}
            <div className="p-3 bg-[#0B0E14]/80 border-b border-slate-800 grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="bg-[#0F1219] p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block">СУММА НАКЛАДНОЙ</span>
                <strong className={selectedInvoice.totalAmountUsd === 0 ? "text-purple-300 font-bold" : "text-slate-100 font-bold"}>
                  {selectedInvoice.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(selectedInvoice.totalAmountUsd || 0).toLocaleString()}`}
                </strong>
              </div>
              <div className="bg-[#0F1219] p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block">ОПЛАЧЕНО</span>
                <strong className="text-emerald-400 font-bold">${(selectedInvoice.paidAmountUsd || 0).toLocaleString()}</strong>
              </div>
              <div className="bg-[#0F1219] p-2 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 block">ОСТАТОК ДОЛГА</span>
                <strong className="text-rose-400 font-bold">${(selectedInvoice.remainingAmountUsd || 0).toLocaleString()}</strong>
              </div>
            </div>

            {/* Invoice Groups (Summary of positions) */}
            {selectedInvoice.groups && selectedInvoice.groups.length > 0 && (
              <div className="p-3 bg-[#0B0E14] border-b border-slate-800 font-mono space-y-1.5 shrink-0">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Позиции по накладной:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {selectedInvoice.groups.map((grp: any, gIdx: number) => (
                    <div key={gIdx} className="p-2 rounded bg-[#0F1219] border border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-200">{grp.brand} {grp.model}</span>
                        <span className="block text-[11px] text-slate-400">{grp.storage} • {grp.color}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-400">{grp.quantity} шт.</span>
                        <span className="block text-[10px] text-slate-400">${grp.purchasePriceUsd} / шт.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contained Devices List */}
            {(() => {
              const containedDevices = devices.filter(d => 
                d.invoiceNumber === selectedInvoice.invoiceNumber ||
                (d.supplierId === selectedInvoice.supplierId && (d.purchaseInvoiceId === selectedInvoice.id || selectedInvoice.id.includes(d.invoiceNumber || ''))) ||
                (selectedInvoice.invoiceNumber.includes('112') && d.invoiceNumber?.includes('112'))
              );

              return (
                <>
                  <div className="p-3 bg-[#0F1219] border-b border-slate-800 flex items-center justify-between text-xs font-mono font-bold text-slate-300 shrink-0">
                    <span>Устройства в накладной</span>
                    <span className="text-emerald-400">
                      {containedDevices.length} шт.
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#0B0E14] font-mono">
                    {containedDevices.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs">
                        Нет детальных записей устройств для этой накладной
                      </div>
                    ) : (
                      containedDevices.map((dev, idx) => (
                        <div
                          key={dev.id}
                          className="p-2.5 rounded bg-[#0F1219] border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="text-slate-400 text-[10px] font-bold">#{idx + 1}</span>
                              <strong className="text-slate-100">{dev.brand} {dev.model}</strong>
                              <span className="text-slate-400 text-[11px]">{dev.storage} • {dev.color}</span>
                              {(dev.purchaseCostUsd === 0 || dev.isBonus) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-medium">
                                  🎁 ПОДАРОК ($0)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
                              <span>IMEI 1: <strong className="text-slate-300">{dev.imei}</strong></span>
                              <span>IMEI 2: <strong className={dev.imei2 ? "text-slate-300" : "text-slate-500 font-normal"}>{dev.imei2 || '—'}</strong></span>
                              <span>Штрихкод (EAN): <strong className={dev.barcode ? "text-amber-400 font-mono" : "text-slate-500 font-normal"}>{dev.barcode || '—'}</strong></span>
                              <span>Локация: <strong className="text-slate-300">{dev.locationName}</strong></span>
                            </div>
                            {dev.bonusCampaign && (
                              <p className="text-[10px] text-purple-400 mt-0.5">
                                {dev.bonusCampaign}
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`text-xs font-bold font-mono ${dev.purchaseCostUsd === 0 ? 'text-purple-300' : 'text-emerald-400'}`}>
                              {dev.purchaseCostUsd === 0 ? '$0 (ПОДАРОК)' : `$${dev.purchaseCostUsd}`}
                            </span>
                            <span className={`block text-[10px] px-1.5 py-0.2 rounded font-bold mt-0.5 ${
                              dev.status === 'SOLD' ? 'text-amber-400' : 'text-slate-400'
                            }`}>
                              {dev.status === 'SOLD' ? 'ПРОДАН' : 'НА СКЛАДЕ'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}

            {/* Modal Footer */}
            <div className="p-3 bg-[#0B0E14] border-t border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedInvoiceId(null)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 transition-colors"
              >
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: EDIT SUPPLIER */}
      {editingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-lg bg-zinc-900 border border-zinc-800 p-5 shadow-xl text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Edit className="w-4 h-4 text-emerald-400" />
                <span>Редактировать поставщика</span>
              </h3>
              <button onClick={() => setEditingSupplier(null)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditSupplier} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Название поставщика *</label>
                <input
                  type="text"
                  required
                  value={editSupplierName}
                  onChange={(e) => setEditSupplierName(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Телефон</label>
                <input
                  type="text"
                  value={editSupplierPhone}
                  onChange={(e) => setEditSupplierPhone(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Контактное лицо</label>
                <input
                  type="text"
                  value={editSupplierContact}
                  onChange={(e) => setEditSupplierContact(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingSupplier(null)}
                  className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-white"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE SUPPLIER CONFIRMATION */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-lg bg-zinc-900 border border-zinc-800 p-5 shadow-2xl text-zinc-100 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white">Удаление поставщика</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Вы действительно хотите удалить поставщика <strong className="text-white">«{deletingSupplier.name}»</strong>? Все связанные накладные, выплатные записи и поставленные устройства будут безвозвратно удалены.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeletingSupplier(null)}
                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmDeleteSupplier}
                className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow"
              >
                Удалить поставщика
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT INVOICE */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-lg bg-zinc-900 border border-zinc-800 p-5 shadow-xl text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Edit className="w-4 h-4 text-emerald-400" />
                <span>Редактировать накладную</span>
              </h3>
              <button onClick={() => setEditingInvoice(null)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditInvoice} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Номер накладной *</label>
                <input
                  type="text"
                  required
                  value={editInvoiceNumber}
                  onChange={(e) => setEditInvoiceNumber(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Дата накладной</label>
                <input
                  type="date"
                  value={editInvoiceDate}
                  onChange={(e) => setEditInvoiceDate(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Сумма накладной ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editInvoiceAmount}
                  onChange={(e) => setEditInvoiceAmount(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-emerald-400 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-white"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE INVOICE CONFIRMATION */}
      {deletingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-lg bg-zinc-900 border border-zinc-800 p-5 shadow-2xl text-zinc-100 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-white">Удаление накладной</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Вы действительно хотите удалить накладную <strong className="text-white">#{deletingInvoice.invoiceNumber}</strong>? Все привязанные к этой накладной устройства и расчеты будут удалены из системы.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeletingInvoice(null)}
                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmDeleteInvoice}
                className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow"
              >
                Удалить накладную
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
