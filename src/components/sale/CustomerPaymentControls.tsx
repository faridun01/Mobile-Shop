import React from 'react';
import { PaymentMethod } from '../../types';
import { decimal, moneyNumber, formatMoney } from '../../utils/money';
import { Banknote, CreditCard, Split, Clock, User, UserCheck, X, Phone, CheckCircle2 } from 'lucide-react';

/** Payment method, customer (required for a debt sale) and split / down-payment amounts at checkout. */
export interface CustomerPaymentControlsProps {
  paymentMethod: PaymentMethod;
  setPaymentMethod: (pm: PaymentMethod) => void;
  totalTjs: number;
  cashAmountInput: string;
  setCashAmountInput: (val: string) => void;
  cardAmountInput: string;
  setCardAmountInput: (val: string) => void;
  customerNameInput: string;
  setCustomerNameInput: (val: string) => void;
  customerPhoneInput: string;
  setCustomerPhoneInput: (val: string) => void;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (id: string | null) => void;
  customerSuggestions: Array<{ id: string; name: string; phone?: string; totalDebtTjs: number }>;
  setCustomerSuggestions: (items: Array<{ id: string; name: string; phone?: string; totalDebtTjs: number }>) => void;
  downpaymentInput: string;
  setDownpaymentInput: (val: string) => void;
  downpaymentMethod: 'CASH' | 'CARD';
  setDownpaymentMethod: (m: 'CASH' | 'CARD') => void;
}

export const CustomerPaymentControls: React.FC<CustomerPaymentControlsProps> = ({
  paymentMethod,
  setPaymentMethod,
  totalTjs,
  cashAmountInput,
  setCashAmountInput,
  cardAmountInput,
  setCardAmountInput,
  customerNameInput,
  setCustomerNameInput,
  customerPhoneInput,
  setCustomerPhoneInput,
  selectedCustomerId,
  setSelectedCustomerId,
  customerSuggestions,
  setCustomerSuggestions,
  downpaymentInput,
  setDownpaymentInput,
  downpaymentMethod,
  setDownpaymentMethod,
}) => {
  const isDebt = paymentMethod === 'DEBT';
  const remainingDebt = Math.max(0, totalTjs - (parseFloat(downpaymentInput) || 0));

  return (
    <div className="space-y-2.5">
      {/* Payment Method Selector */}
      <div className="grid grid-cols-4 gap-1">
        {([
          { id: 'CASH' as const, label: 'Нал.', icon: Banknote },
          { id: 'CARD' as const, label: 'Банк', icon: CreditCard },
          { id: 'SPLIT' as const, label: 'Смеш.', icon: Split },
          { id: 'DEBT' as const, label: 'В долг', icon: Clock },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPaymentMethod(id);
              if (id === 'CASH') {
                setCashAmountInput(totalTjs.toString());
                setCardAmountInput('0');
              } else if (id === 'CARD') {
                setCardAmountInput(totalTjs.toString());
                setCashAmountInput('0');
              } else if (id === 'SPLIT') {
                const half = Math.floor(totalTjs / 2);
                setCashAmountInput(half.toString());
                setCardAmountInput(moneyNumber(decimal(totalTjs).minus(half)).toString());
              } else if (id === 'DEBT') {
                setDownpaymentInput('0');
              }
            }}
            className={`h-9 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer select-none ${
              paymentMethod === id
                ? id === 'DEBT'
                  ? 'border-warning bg-warning/15 text-warning font-bold shadow-sm'
                  : 'border-accent bg-accent/15 text-accent font-bold shadow-sm'
                : 'border-border bg-surface text-fg-muted hover:text-fg hover:bg-surface-raised'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Customer details block */}
      <div
        className={`p-2.5 rounded-xl border space-y-2 relative transition-all ${
          isDebt
            ? 'bg-warning/10 border-warning/35'
            : 'bg-surface-raised/70 border-border'
        }`}
      >
        <div className="flex items-center justify-between text-[11px]">
          {isDebt ? (
            <span className="flex items-center gap-1 font-bold text-warning">
              <Clock className="w-3.5 h-3.5 shrink-0" /> Продажа в долг
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-medium text-fg">
              <User className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Покупатель</span>
              <span className="text-[10px] text-fg-subtle font-normal">(не обязательно)</span>
            </span>
          )}

          {selectedCustomerId ? (
            <div className="flex items-center gap-1 bg-accent/15 border border-accent/30 text-accent px-1.5 py-0.5 rounded text-[10px] font-medium">
              <UserCheck className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[120px]">В базе</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomerId(null);
                  setCustomerNameInput('');
                  setCustomerPhoneInput('');
                }}
                className="text-fg-subtle hover:text-danger ml-0.5 p-0.5 cursor-pointer"
                title="Очистить клиента"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-1.5 relative">
          {/* Phone Field */}
          <div>
            <label className="text-[10px] text-fg-subtle block mb-0.5">
              Телефон {isDebt && <span className="text-warning font-bold">*</span>}
            </label>
            <div className="relative">
              <Phone className="w-3 h-3 absolute left-2 top-2.5 text-fg-subtle pointer-events-none" />
              <input
                type="tel"
                value={customerPhoneInput}
                onChange={(e) => {
                  setCustomerPhoneInput(e.target.value);
                  setSelectedCustomerId(null);
                }}
                placeholder="+992..."
                className={`w-full h-7 rounded-md bg-surface border pl-6 pr-2 text-xs font-mono text-fg focus:outline-none ${
                  isDebt
                    ? 'border-warning/50 focus:border-warning focus:ring-1 focus:ring-warning/30'
                    : 'border-border focus:border-accent focus:ring-1 focus:ring-accent/30'
                }`}
              />
            </div>
          </div>

          {/* Name Field */}
          <div>
            <label className="text-[10px] text-fg-subtle block mb-0.5">
              Имя {isDebt && !customerPhoneInput.trim() && <span className="text-warning font-bold">*</span>}
            </label>
            <input
              type="text"
              value={customerNameInput}
              onChange={(e) => {
                setCustomerNameInput(e.target.value);
                setSelectedCustomerId(null);
              }}
              placeholder="Имя Фамилия"
              className={`w-full h-7 rounded-md bg-surface border px-2 text-xs text-fg focus:outline-none ${
                isDebt
                  ? 'border-warning/50 focus:border-warning focus:ring-1 focus:ring-warning/30'
                  : 'border-border focus:border-accent focus:ring-1 focus:ring-accent/30'
              }`}
            />
          </div>

          {/* Autocomplete Dropdown */}
          {customerSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-surface border border-border rounded-lg shadow-xl overflow-hidden divide-y divide-border max-h-52 overflow-y-auto">
              {customerSuggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCustomerNameInput(c.name);
                    setCustomerPhoneInput(c.phone || '');
                    setSelectedCustomerId(c.id);
                    setCustomerSuggestions([]);
                  }}
                  className="w-full text-left p-2 hover:bg-surface-raised flex items-center justify-between text-xs cursor-pointer transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-fg block truncate">{c.name}</span>
                    {c.phone && <span className="text-fg-subtle text-[10px] font-mono block truncate">{c.phone}</span>}
                  </div>
                  {c.totalDebtTjs > 0 && (
                    <span className="text-[10px] font-bold text-danger shrink-0">
                      Долг: {formatMoney(c.totalDebtTjs)} TJS
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Micro-caption when typing phone or name */}
        {!selectedCustomerId && (customerPhoneInput.trim() || customerNameInput.trim()) ? (
          <p className="text-[10px] text-accent/90 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>Новый клиент сохранится в базу при продаже</span>
          </p>
        ) : null}

        {/* Downpayment if DEBT */}
        {isDebt && (
          <div className="pt-2 border-t border-warning/25 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <span className="text-[10px] text-fg-subtle block mb-0.5">Первый взнос (TJS):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={totalTjs}
                  value={downpaymentInput}
                  onChange={(e) => setDownpaymentInput(e.target.value)}
                  className="w-full h-7 rounded-md bg-surface border border-warning/50 px-2 text-xs font-mono font-semibold text-fg focus:outline-none focus:border-warning"
                />
              </div>
              <div>
                <span className="text-[10px] text-fg-subtle block mb-0.5">Способ взноса:</span>
                <div className="grid grid-cols-2 gap-1 h-7">
                  <button
                    type="button"
                    onClick={() => setDownpaymentMethod('CASH')}
                    className={`rounded-md text-[10px] font-semibold border flex items-center justify-center cursor-pointer transition-colors ${
                      downpaymentMethod === 'CASH'
                        ? 'bg-accent/15 border-accent text-accent font-bold'
                        : 'bg-surface border-border text-fg-muted hover:text-fg'
                    }`}
                  >
                    Нал
                  </button>
                  <button
                    type="button"
                    onClick={() => setDownpaymentMethod('CARD')}
                    className={`rounded-md text-[10px] font-semibold border flex items-center justify-center cursor-pointer transition-colors ${
                      downpaymentMethod === 'CARD'
                        ? 'bg-accent/15 border-accent text-accent font-bold'
                        : 'bg-surface border-border text-fg-muted hover:text-fg'
                    }`}
                  >
                    Банк
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-warning/20 font-bold">
              <span className="text-fg-subtle text-[11px]">Останется в долг:</span>
              <span className="text-warning text-sm font-mono">{formatMoney(remainingDebt)} TJS</span>
            </div>
          </div>
        )}
      </div>

      {/* Split payment inputs */}
      {paymentMethod === 'SPLIT' && (
        <div className="grid grid-cols-2 gap-1.5 p-2 rounded-lg bg-surface-raised/40 border border-border">
          <div>
            <span className="text-[10px] text-fg-subtle block mb-0.5">Наличные:</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max={totalTjs}
              value={cashAmountInput}
              onChange={(e) => {
                const valStr = e.target.value;
                const raw = parseFloat(valStr);
                if (!isNaN(raw)) {
                  const clamped = Math.min(totalTjs, Math.max(0, raw));
                  setCashAmountInput(raw > totalTjs ? totalTjs.toString() : valStr);
                  setCardAmountInput(Number(Math.max(0, totalTjs - clamped).toFixed(2)).toString());
                } else {
                  setCashAmountInput(valStr);
                  setCardAmountInput(totalTjs.toString());
                }
              }}
              className="w-full h-7 rounded-md bg-surface border border-border px-2 text-xs font-mono font-semibold text-fg focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <span className="text-[10px] text-fg-subtle block mb-0.5">Банк:</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max={totalTjs}
              value={cardAmountInput}
              onChange={(e) => {
                const valStr = e.target.value;
                const raw = parseFloat(valStr);
                if (!isNaN(raw)) {
                  const clamped = Math.min(totalTjs, Math.max(0, raw));
                  setCardAmountInput(raw > totalTjs ? totalTjs.toString() : valStr);
                  setCashAmountInput(Number(Math.max(0, totalTjs - clamped).toFixed(2)).toString());
                } else {
                  setCardAmountInput(valStr);
                  setCashAmountInput(totalTjs.toString());
                }
              }}
              className="w-full h-7 rounded-md bg-surface border border-border px-2 text-xs font-mono font-semibold text-fg focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
};
