import React, { useMemo, useState } from 'react';
import type { Sale, SaleEditParams } from '../../types';
import { Button } from '../ui/Button';
import { decimal, formatMoney, moneyNumber } from '../../utils/money';

export type SaleEditTarget = { kind: 'SALE' } | { kind: 'EXCHANGE' } | { kind: 'RETURN'; returnId: string } | { kind: 'REFUND' };

const parse = (value: string) => {
  const text = value.replace(',', '.').trim();
  return /^\d+(?:\.\d{0,2})?$/.test(text) ? decimal(text) : null;
};
const text = (value: number | undefined) => String(value ?? 0);

const inputClass = 'w-full h-10 rounded-lg bg-bg border border-border px-3 text-sm font-semibold font-mono text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent';

const Row: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="flex items-center justify-between gap-2 text-xs font-medium text-fg-muted">
      <span className="min-w-0 truncate">{label}</span>
      {hint && <span className="shrink-0 text-fg-subtle font-normal">{hint}</span>}
    </span>
    {children}
  </label>
);

const Line: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <div className="flex justify-between gap-2"><span className="text-fg-subtle">{label}</span><span className={`font-mono font-semibold ${tone ?? 'text-fg'}`}>{value}</span></div>
);

/**
 * Admin correction of a past operation: the receipt's prices (and its cash/card split or first
 * payment), a return's or refund's withheld amount, or an exchange (withheld + new prices). The
 * server recalculates everything at the operation's own rate and day.
 */
export const SaleEditForm: React.FC<{
  sale: Sale;
  target: SaleEditTarget;
  onSubmit: (params: SaleEditParams) => Promise<{ success: boolean; message?: string }>;
  onBack: () => void;
  onDone: () => void;
}> = ({ sale, target, onSubmit, onBack, onDone }) => {
  const priced = target.kind === 'SALE' || target.kind === 'EXCHANGE';
  const ret = target.kind === 'RETURN' ? sale.returns?.find((r) => r.id === target.returnId) : undefined;
  const openItems = sale.items.filter((item) => item.id && !item.returnId);
  const returnedItems = ret ? sale.items.filter((item) => item.returnId === ret.id) : [];

  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(openItems.map((item) => [item.id!, text(item.salePriceTjs)])));
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>(() => Object.fromEntries((sale.accessoryItems ?? []).map((line) => [line.id, text(line.unitPriceTjs)])));
  const [cash, setCash] = useState(text(sale.cashAmountTjs));
  const [card, setCard] = useState(text(sale.cardAmountTjs));
  const [exchangeWithheld, setExchangeWithheld] = useState(text(sale.exchangeFrom?.withheldTjs));
  const [withheld, setWithheld] = useState<Record<string, string>>(() => Object.fromEntries([
    ...returnedItems.map((item) => [item.id!, text(item.returnWithheldTjs)]),
    ...(ret?.accessoryLines ?? []).map((part) => [`acc:${part.lineId}`, text(part.withheldTjs)]),
  ]));
  const [payoutMethod, setPayoutMethod] = useState<'CASH' | 'CARD'>(ret?.payoutMethod ?? 'CASH');
  const [penalty, setPenalty] = useState(text(sale.penaltyFeeTjs));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the corrected operation comes to, in TJS (the server books the dollars at its rate).
  const preview = useMemo(() => {
    const invalid = (message: string) => ({ error: message, lines: [] as { label: string; value: string; tone?: string }[] });
    if (priced) {
      let total = decimal(0);
      for (const item of openItems) {
        const value = parse(prices[item.id!] ?? '');
        if (!value || value.lte(0)) return invalid(`Укажите цену ${item.model}`);
        total = total.plus(value);
      }
      for (const line of sale.accessoryItems ?? []) {
        const value = parse(unitPrices[line.id] ?? '');
        if (!value || value.lte(0)) return invalid(`Укажите цену ${line.name}`);
        total = total.plus(value.mul(line.quantity).toDecimalPlaces(2));
      }
      const lines: { label: string; value: string; tone?: string }[] = [{ label: 'Итого по чеку', value: `${formatMoney(moneyNumber(total))} TJS` }];
      let payable = total;
      if (target.kind === 'EXCHANGE' && sale.exchangeFrom) {
        const w = parse(exchangeWithheld);
        // The returned goods' price is what their credit and withheld amount add up to.
        const returnedPrice = decimal(sale.exchangeFrom.creditTjs).plus(sale.exchangeFrom.withheldTjs);
        if (!w || w.gt(returnedPrice)) return invalid(`Удержание не может быть больше цены сданного товара (${formatMoney(moneyNumber(returnedPrice))} TJS)`);
        const credit = returnedPrice.minus(w);
        const applied = credit.lte(total) ? credit : total;
        payable = total.minus(applied);
        lines.push({ label: 'Зачёт за сданный товар', value: `${formatMoney(moneyNumber(credit))} TJS` });
        if (credit.gt(total)) lines.push({ label: 'Сдача клиенту', value: `${formatMoney(moneyNumber(credit.minus(total)))} TJS`, tone: 'text-danger' });
        else lines.push({ label: 'Доплата клиента', value: `${formatMoney(moneyNumber(payable))} TJS`, tone: 'text-accent' });
      }
      if (sale.paymentMethod === 'SPLIT' || sale.paymentMethod === 'DEBT') {
        const c = parse(cash);
        const k = parse(card);
        if (!c || !k) return invalid('Укажите суммы наличными и по карте');
        if (sale.paymentMethod === 'SPLIT' && !c.plus(k).eq(payable)) return invalid(`Наличные и карта вместе должны составлять ${formatMoney(moneyNumber(payable))} TJS`);
        if (sale.paymentMethod === 'DEBT') {
          const debt = total.minus(c).minus(k);
          if (debt.lte(0)) return invalid('Сумма долга должна быть больше 0: уменьшите первый взнос');
          lines.push({ label: 'Долг клиента', value: `${formatMoney(moneyNumber(debt))} TJS`, tone: 'text-warning' });
        }
      }
      return { error: null, lines };
    }
    if (target.kind === 'RETURN' && ret) {
      let credit = decimal(0);
      let kept = decimal(0);
      for (const item of returnedItems) {
        const w = parse(withheld[item.id!] ?? '');
        if (!w || w.gt(item.salePriceTjs)) return invalid(`Удержание за ${item.model} — от 0 до ${formatMoney(item.salePriceTjs)} TJS`);
        credit = credit.plus(decimal(item.salePriceTjs).minus(w));
        kept = kept.plus(w);
      }
      for (const part of ret.accessoryLines ?? []) {
        const w = parse(withheld[`acc:${part.lineId}`] ?? '');
        if (!w || w.gt(part.priceTjs)) return invalid(`Удержание за ${part.name} — от 0 до ${formatMoney(part.priceTjs)} TJS`);
        credit = credit.plus(decimal(part.priceTjs).minus(w));
        kept = kept.plus(w);
      }
      return { error: null, lines: [
        { label: 'Удержано', value: `${formatMoney(moneyNumber(kept))} TJS`, tone: 'text-warning' },
        { label: 'Выдать клиенту', value: `${formatMoney(moneyNumber(credit))} TJS`, tone: 'text-danger' },
      ] };
    }
    if (target.kind === 'REFUND') {
      const collected = decimal(sale.actualRefundAmountTjs ?? 0).plus(sale.penaltyFeeTjs ?? 0);
      const p = parse(penalty);
      if (!p || p.gt(collected)) return invalid(`Штраф — от 0 до ${formatMoney(moneyNumber(collected))} TJS`);
      return { error: null, lines: [
        { label: 'Получено по чеку', value: `${formatMoney(moneyNumber(collected))} TJS` },
        { label: 'Вернуть клиенту', value: `${formatMoney(moneyNumber(collected.minus(p)))} TJS`, tone: 'text-danger' },
      ] };
    }
    return invalid('Операция не найдена');
  }, [priced, openItems, prices, unitPrices, sale, target.kind, exchangeWithheld, cash, card, ret, returnedItems, withheld, penalty]);

  const submit = async () => {
    if (preview.error || submitting) return;
    const num = (value: string) => moneyNumber(parse(value)!);
    let params: SaleEditParams;
    if (target.kind === 'RETURN') {
      params = {
        saleId: sale.id, kind: 'RETURN', returnId: target.returnId,
        items: returnedItems.map((item) => ({ saleItemId: item.id!, withheldTjs: num(withheld[item.id!]) })),
        accessories: (ret?.accessoryLines ?? []).map((part) => ({ lineId: part.lineId, withheldTjs: num(withheld[`acc:${part.lineId}`]) })),
        ...(ret && ret.payoutTjs <= 0 ? { payoutMethod } : {}),
      };
    } else if (target.kind === 'REFUND') {
      params = { saleId: sale.id, kind: 'REFUND', penaltyFeeTjs: num(penalty) };
    } else {
      const common = {
        items: openItems.map((item) => ({ saleItemId: item.id!, salePriceTjs: num(prices[item.id!]) })),
        accessories: (sale.accessoryItems ?? []).map((line) => ({ lineId: line.id, unitPriceTjs: num(unitPrices[line.id]) })),
        ...(sale.paymentMethod === 'SPLIT' || sale.paymentMethod === 'DEBT' ? { cashAmountTjs: num(cash), cardAmountTjs: num(card) } : {}),
      };
      params = target.kind === 'EXCHANGE'
        ? { saleId: sale.id, kind: 'EXCHANGE', ...common, returnWithheldTjs: num(exchangeWithheld) }
        : { saleId: sale.id, kind: 'SALE', ...common };
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(params);
      if (result.success) onDone();
      else setError(result.message || 'Не удалось исправить операцию');
    } finally {
      setSubmitting(false);
    }
  };

  const title = target.kind === 'SALE' ? 'Исправить продажу' : target.kind === 'EXCHANGE' ? 'Исправить обмен' : 'Исправить возврат';
  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-bold text-fg">{title}</p>
        <p className="mt-1 text-xs text-fg-muted">
          Пересчёт по курсу самой операции{sale.exchangeRate ? ` (${sale.exchangeRate})` : ''}: касса, прибыль владельцев, долг клиента и Z-отчёт смены того дня
          пересчитаются автоматически. После инкассации исправление недоступно.
        </p>
      </div>

      {priced && (
        <div className="space-y-3">
          {openItems.map((item) => (
            <Row key={item.id} label={`${item.brand} ${item.model}`} hint={`было ${formatMoney(item.salePriceTjs)} TJS`}>
              <input className={inputClass} inputMode="decimal" value={prices[item.id!] ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [item.id!]: e.target.value }))} />
            </Row>
          ))}
          {(sale.accessoryItems ?? []).map((line) => (
            <Row key={line.id} label={`${line.brand} ${line.name} — цена за 1 шт. (${line.quantity} шт.)`} hint={`было ${formatMoney(line.unitPriceTjs)} TJS`}>
              <input className={inputClass} inputMode="decimal" value={unitPrices[line.id] ?? ''} onChange={(e) => setUnitPrices((p) => ({ ...p, [line.id]: e.target.value }))} />
            </Row>
          ))}
          {target.kind === 'EXCHANGE' && sale.exchangeFrom && (
            <Row label={`Удержание за сданный товар (чек #${sale.exchangeFrom.receiptNumber})`} hint={`было ${formatMoney(sale.exchangeFrom.withheldTjs)} TJS`}>
              <input className={inputClass} inputMode="decimal" value={exchangeWithheld} onChange={(e) => setExchangeWithheld(e.target.value)} />
            </Row>
          )}
          {(sale.paymentMethod === 'SPLIT' || sale.paymentMethod === 'DEBT') && (
            <div className="grid grid-cols-2 gap-2">
              <Row label={sale.paymentMethod === 'DEBT' ? 'Взнос наличными' : 'Наличными'}>
                <input className={inputClass} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
              </Row>
              <Row label={sale.paymentMethod === 'DEBT' ? 'Взнос картой' : 'Картой'}>
                <input className={inputClass} inputMode="decimal" value={card} onChange={(e) => setCard(e.target.value)} />
              </Row>
            </div>
          )}
        </div>
      )}

      {target.kind === 'RETURN' && ret && (
        <div className="space-y-3">
          {returnedItems.map((item) => (
            <Row key={item.id} label={`Удержание: ${item.brand} ${item.model}`} hint={`цена ${formatMoney(item.salePriceTjs)} TJS`}>
              <input className={inputClass} inputMode="decimal" value={withheld[item.id!] ?? ''} onChange={(e) => setWithheld((w) => ({ ...w, [item.id!]: e.target.value }))} />
            </Row>
          ))}
          {(ret.accessoryLines ?? []).map((part) => (
            <Row key={part.lineId} label={`Удержание: ${part.name} × ${part.quantity}`} hint={`цена ${formatMoney(part.priceTjs)} TJS`}>
              <input className={inputClass} inputMode="decimal" value={withheld[`acc:${part.lineId}`] ?? ''} onChange={(e) => setWithheld((w) => ({ ...w, [`acc:${part.lineId}`]: e.target.value }))} />
            </Row>
          ))}
          {ret.payoutTjs <= 0 && (
            <Row label="Как вернуть деньги клиенту">
              <select className={inputClass} value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value as 'CASH' | 'CARD')}>
                <option value="CASH">Наличными</option>
                <option value="CARD">На карту</option>
              </select>
            </Row>
          )}
        </div>
      )}

      {target.kind === 'REFUND' && (
        <Row label="Штраф (удержание) при возврате, TJS" hint={`было ${formatMoney(sale.penaltyFeeTjs ?? 0)} TJS`}>
          <input className={inputClass} inputMode="decimal" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
        </Row>
      )}

      <div className="p-3 rounded-lg bg-surface border border-border space-y-1 text-xs">
        {preview.lines.map((line) => <Line key={line.label} {...line} />)}
        {preview.error && <p className="text-danger" role="alert">{preview.error}</p>}
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" fullWidth disabled={submitting} onClick={onBack}>Назад</Button>
        <Button variant="primary" fullWidth loading={submitting} disabled={Boolean(preview.error)} onClick={submit}>Сохранить</Button>
      </div>
    </div>
  );
};
