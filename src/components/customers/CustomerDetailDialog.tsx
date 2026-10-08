import React from 'react';
import { CreditCard, Edit2, HandCoins, MessageCircle, Receipt } from 'lucide-react';
import { Customer } from '../../types';
import { formatMoney } from '../../utils/money';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { LoadingState } from '../ui/Skeleton';
import { CustomerDetailResponse, PaymentTarget, getInitials, getWhatsAppLink } from './types';

interface CustomerDetailDialogProps {
  customer: Customer | null;
  detail: CustomerDetailResponse | null;
  loading: boolean;
  onClose: () => void;
  onAcceptPayment: (target: PaymentTarget) => void;
  onEdit: (customer: Customer) => void;
}

/** Contact card with the debt, payments and purchases loaded from the database. */
export const CustomerDetailDialog: React.FC<CustomerDetailDialogProps> = ({ customer, detail, loading, onClose, onAcceptPayment, onEdit }) => {
  const debt = detail?.totalDebtTjs ?? customer?.totalDebtTjs ?? 0;
  const paid = detail?.totalPaidTjs ?? customer?.totalPaidTjs ?? 0;
  const whatsApp = getWhatsAppLink(customer?.phone);

  return (
    <Dialog
      open={Boolean(customer)}
      onClose={onClose}
      title={customer?.name || 'Карточка клиента'}
      subtitle="Контактные данные, задолженность и история оплат из базы данных"
    >
      {customer && (
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {/* Contact Header */}
          <div className="p-4 rounded-2xl bg-surface-raised border border-border space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent font-bold text-base shrink-0">
                {getInitials(customer.name)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-fg truncate">{customer.name}</h3>
                <p className="text-xs text-fg-subtle mt-0.5">
                  В базе с {new Date(customer.createdAt).toLocaleDateString('ru-RU')}
                </p>
              </div>
            </div>

            {customer.phone && (
              <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-fg-subtle block">Телефон:</span>
                  <a href={`tel:${customer.phone}`} className="font-mono text-sm font-bold text-accent hover:underline">
                    {customer.phone}
                  </a>
                </div>
                {whatsApp && (
                  <a
                    href={whatsApp}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1 border border-emerald-500/20"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            )}

            {customer.note && (
              <div className="pt-2 border-t border-border">
                <span className="text-[10px] uppercase font-bold text-fg-subtle block">Заметка:</span>
                <p className="text-xs text-fg-muted mt-0.5">{customer.note}</p>
              </div>
            )}
          </div>

          {/* Financial overview */}
          <div className="p-3.5 rounded-2xl bg-surface border border-border space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
              Финансовый баланс клиента
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded-xl bg-surface-raised border border-border">
                <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Текущий долг</span>
                <p className="text-base sm:text-lg font-black font-mono text-warning mt-0.5">{formatMoney(debt)} TJS</p>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-raised border border-border">
                <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Всего оплачено</span>
                <p className="text-base sm:text-lg font-black font-mono text-success mt-0.5">{formatMoney(paid)} TJS</p>
              </div>
            </div>
            {debt > 0 && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={HandCoins}
                onClick={() => onAcceptPayment({ id: customer.id, name: customer.name, totalDebtTjs: debt })}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
              >
                Принять оплату долга в кассу
              </Button>
            )}
          </div>

          {/* Payment history */}
          <div className="p-3.5 rounded-2xl bg-surface border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-accent" />
                История оплат из базы данных
              </span>
              {detail?.payments?.length ? (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-surface-raised border border-border">
                  {detail.payments.length} оплат
                </span>
              ) : null}
            </div>
            {loading ? (
              <div className="py-4 text-center">
                <LoadingState label="Загрузка платежей…" />
              </div>
            ) : !detail?.payments || detail.payments.length === 0 ? (
              <p className="text-xs text-fg-subtle py-2 text-center">Платежей по долгам пока не зарегистрировано</p>
            ) : (
              <div className="divide-y divide-border/60 max-h-48 overflow-y-auto">
                {detail.payments.map((p) => (
                  <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-success font-mono">+{formatMoney(Number(p.amountTjs))} TJS</p>
                      <p className="text-[10px] text-fg-subtle">
                        {new Date(p.createdAt).toLocaleDateString('ru-RU')}{' '}
                        {new Date(p.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        {p.allocations?.length ? ` • Погашен чек №${p.allocations[0]?.sale?.receiptNumber}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] text-fg-subtle bg-surface-raised px-1.5 py-0.5 rounded border border-border">
                      {p.sourceAccount === 'STORE_CASH' ? 'Касса' : p.sourceAccount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Purchase history */}
          <div className="p-3.5 rounded-2xl bg-surface border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-accent" />
                История покупок
              </span>
              {detail?.sales?.length ? (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-surface-raised border border-border">
                  {detail.sales.length} покупок
                </span>
              ) : null}
            </div>
            {loading ? (
              <div className="py-4 text-center">
                <LoadingState label="Загрузка покупок…" />
              </div>
            ) : !detail?.sales || detail.sales.length === 0 ? (
              <p className="text-xs text-fg-subtle py-2 text-center">Покупок пока нет</p>
            ) : (
              <div className="divide-y divide-border/60 max-h-48 overflow-y-auto">
                {detail.sales.map((s) => (
                  <div key={s.id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-fg">
                        Чек №{s.receiptNumber}{' '}
                        <span className="font-mono text-fg-subtle font-normal">({formatMoney(Number(s.totalTjs))} TJS)</span>
                      </p>
                      <p className="text-[10px] text-fg-subtle">
                        {new Date(s.createdAt).toLocaleDateString('ru-RU')} {s.store?.name ? `• ${s.store.name}` : ''}
                        {Number(s.debtAmountTjs) > 0 && (
                          <span className="text-amber-500 font-semibold ml-1">• Долг: {formatMoney(Number(s.debtAmountTjs))} TJS</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" size="sm" leftIcon={Edit2} onClick={() => onEdit(customer)}>
              Редактировать
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};
