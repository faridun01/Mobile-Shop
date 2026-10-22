import React from 'react';
import { ArrowRight, Banknote, TrendingUp } from 'lucide-react';
import type { Sale } from '../../types';
import { cn } from '../../utils/cn';
import { formatMoney } from '../../utils/money';
import { formatBusinessDate } from '../../utils/businessDate';
import { exchangeBreakdown, receiptProfitTimeline, type Amount, type ProfitLine } from '../../utils/exchangeBreakdown';

const day = (key: string) => formatBusinessDate(key, false);
const signedUsd = (usd: number) => `${usd > 0 ? '+' : usd < 0 ? '−' : ''}$${formatMoney(Math.abs(usd))}`;
const signedTjs = (tjs: number) => `${tjs < 0 ? '−' : ''}${formatMoney(Math.abs(tjs))} TJS`;

function MoneyCell({ amount, isAdmin, strong }: { amount: Amount; isAdmin: boolean; strong?: boolean }) {
  return (
    <span className={cn('font-mono text-right shrink-0', strong ? 'font-black text-fg' : 'font-semibold text-fg')}>
      {signedTjs(amount.tjs)}
      {isAdmin && <span className="block text-[11px] font-normal text-fg-subtle">{amount.usd < 0 ? '−' : ''}${formatMoney(Math.abs(amount.usd))}</span>}
    </span>
  );
}

function ProfitRows({ lines }: { lines: ProfitLine[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="text-fg-subtle min-w-0"><span className="font-semibold text-fg-muted">{day(line.day)}</span> · {line.label}</span>
          <span className={cn('font-mono font-semibold shrink-0', line.usd < 0 ? 'text-danger' : line.usd > 0 ? 'text-emerald-500' : 'text-fg-subtle')}>{signedUsd(line.usd)}</span>
        </div>
      ))}
    </>
  );
}

function TotalRow({ label, usd, accent }: { label: string; usd: number; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-3 items-baseline">
      <span className={cn('font-bold', accent ? 'text-fg' : 'text-fg-muted')}>{label}</span>
      <span className={cn('font-mono font-black shrink-0', accent ? 'text-sm' : '', usd < 0 ? 'text-danger' : 'text-emerald-500')}>{signedUsd(usd)}</span>
    </div>
  );
}

const Section = ({ icon: Icon, title, children }: { icon: typeof Banknote; title: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <p className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-accent" />{title}</p>
    {children}
  </div>
);

/**
 * On a receipt opened by an exchange: what the customer paid on each day — the old receipt's day,
 * whose shift may be closed long ago, and the exchange day, where only the difference moved the
 * register — and, for the admin, how the profit landed on each day and in total.
 */
export function ExchangeBreakdownCard({ sale, isAdmin, newSaleProfitUsd, onOpenReceipt }: {
  sale: Sale;
  isAdmin: boolean;
  newSaleProfitUsd?: number;
  onOpenReceipt: (receiptNumber: number) => void;
}) {
  const b = exchangeBreakdown(sale, isAdmin ? newSaleProfitUsd : undefined);
  if (!b) return null;
  const { oldPaid, exchangeDay: today, total } = b.money;
  const todayLabel = today.tjs > 0
    ? `доплата ${sale.paymentMethod === 'CARD' ? 'через банк' : sale.paymentMethod === 'SPLIT' ? 'наличными и банком' : 'наличными'}`
    : today.tjs < 0
      ? `выдано клиенту ${sale.paymentMethod === 'CARD' ? 'на карту' : 'наличными'}`
      : 'без доплаты';

  return (
    <div className="p-3 rounded-xl border border-accent/30 bg-accent/5 text-xs space-y-3">
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => onOpenReceipt(b.oldReceiptNumber)}
          className="font-bold text-accent underline underline-offset-2 cursor-pointer text-left"
        >
          Обмен по чеку #{b.oldReceiptNumber} →
        </button>
        <p className="text-fg-subtle flex items-center gap-1 flex-wrap">
          <span>{b.returnedGoods}</span><ArrowRight className="w-3 h-3 shrink-0" /><span className="font-semibold text-fg-muted">{b.newGoods}</span>
        </p>
      </div>

      <Section icon={Banknote} title="Деньги от клиента">
        <div className="flex justify-between gap-3">
          <span className="text-fg-subtle min-w-0"><span className="font-semibold text-fg-muted">{day(b.oldDay)}</span> · оплата по чеку #{b.oldReceiptNumber} за {b.returnedGoods}</span>
          <MoneyCell amount={oldPaid} isAdmin={isAdmin} />
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-fg-subtle min-w-0"><span className="font-semibold text-fg-muted">{day(b.exchangeDay)}</span> · {todayLabel}</span>
          <MoneyCell amount={today} isAdmin={isAdmin} />
        </div>
        <div className="flex justify-between gap-3 pt-1.5 border-t border-accent/20">
          <span className="font-bold text-fg">Всего клиент заплатил за {b.newGoods}</span>
          <MoneyCell amount={total} isAdmin={isAdmin} strong />
        </div>
        <p className="text-[11px] text-fg-subtle leading-snug">
          {b.sameDay
            ? `Обе операции в смене ${day(b.exchangeDay)}: в кассу за день пришло ${signedTjs(total.tjs)}.`
            : `${formatMoney(oldPaid.tjs)} TJS пришли в кассу ${day(b.oldDay)} и остаются в смене того дня. В смену ${day(b.exchangeDay)} попадает только ${today.tjs === 0 ? '0 TJS' : today.tjs > 0 ? `доплата ${formatMoney(today.tjs)} TJS` : `выдача −${formatMoney(Math.abs(today.tjs))} TJS`}.`}
        </p>
      </Section>

      {b.profit && (
        <Section icon={TrendingUp} title="Прибыль по дням">
          <ProfitRows lines={b.profit.lines} />
          <div className="pt-1.5 border-t border-accent/20 space-y-1">
            {!b.sameDay && <TotalRow label={`Прибыль за ${day(b.exchangeDay)}`} usd={b.profit.exchangeDayUsd} />}
            <TotalRow label={b.sameDay ? 'Итого прибыль по обмену' : 'Итого прибыль по обмену за оба дня'} usd={b.profit.totalUsd} accent />
          </div>
        </Section>
      )}
    </div>
  );
}

/** ADMIN-only: a receipt's profit day by day once goods came back from it. */
export function ReceiptProfitTimeline({ sale }: { sale: Sale }) {
  const timeline = receiptProfitTimeline(sale);
  if (!timeline) return null;
  return (
    <div className="p-3 rounded-xl border border-border bg-surface-raised/60 text-xs space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-accent" />Прибыль по чеку по дням</p>
      <ProfitRows lines={timeline.lines} />
      <div className="pt-1.5 border-t border-border">
        <TotalRow label="Итого по чеку" usd={timeline.totalUsd} accent />
      </div>
      <p className="text-[11px] text-fg-subtle leading-snug">
        Прибыль продажи осталась в отчёте своего дня; возврат отменяет её в день возврата. Возвращённый товар снова на складе по своей закупке.
      </p>
    </div>
  );
}
