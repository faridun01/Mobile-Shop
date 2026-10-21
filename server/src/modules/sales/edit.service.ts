import type { Prisma, SaleReturn } from '@prisma/client';
import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { allocateMoney } from '../../common/allocation';
import { moneyEquals, requireNonNegativeMoney, requirePositiveMoney, roundMoney } from '../../common/money';
import { getBusinessDateKey } from '../../common/business-date';
import { allocateLikeBooked, allocateOwnerProfit, type OwnerProfitAllocation } from './profit';
import { getOwnersForStore, replaceOwnerAllocations } from '../finance/owner-allocations';
import { getStoreCashAccount } from '../finance/account.service';
import { cancelTransaction, postTransaction } from '../finance/financial-transaction.service';
import { DailyClosingService, isCardRefund } from '../finance/daily-closing.service';
import { activeRefundLogs } from './cancellation-audit';
import { salePaymentDescription } from './sales.service';

type Tx = TransactionClient;
type Money = Prisma.Decimal;
type Actor = Awaited<ReturnType<typeof resolveActor>>;
type Allocation = OwnerProfitAllocation;
type Day = { storeId: string; businessDate: string };

export interface SaleEditInput {
  /** New price of a phone/tablet line, TJS. Lines left out keep their price. */
  items?: { saleItemId: string; salePriceTjs: MoneyInput }[];
  /** New unit price of an accessory line, TJS. */
  accessories?: { lineId: string; unitPriceTjs: MoneyInput }[];
  /** Split and debt receipts: what was paid in cash and by card (the rest is the debt). */
  cashAmountTjs?: MoneyInput;
  cardAmountTjs?: MoneyInput;
}

export interface ReturnEditInput {
  /** New withheld amount (удержание) of a returned phone, TJS. */
  items?: { saleItemId: string; withheldTjs: MoneyInput }[];
  /** New withheld amount of returned accessory units (the return's accessory part), TJS. */
  accessories?: { lineId: string; withheldTjs: MoneyInput }[];
  /** How the money goes back when nothing was paid out before. */
  payoutMethod?: 'CASH' | 'CARD';
}

export interface ExchangeEditInput extends SaleEditInput {
  returnItems?: ReturnEditInput['items'];
  returnAccessories?: ReturnEditInput['accessories'];
  /** An exchange hands back one phone or one accessory line: its withheld amount, TJS. */
  returnWithheldTjs?: MoneyInput;
}

const refused = (message: string) => Object.assign(new Error(message), { statusCode: 409 });

const allocationsOf = (value: unknown): Allocation[] => (Array.isArray(value) ? value : [])
  .filter((row) => row && typeof row.ownerId === 'string')
  .map((row) => ({ ownerId: row.ownerId as string, amountUsd: roundMoney(D(row.amountUsd ?? 0)) }));

/** a + sign·b, per owner. */
function combine(a: Allocation[], b: Allocation[], sign: 1 | -1): Allocation[] {
  const sums = new Map<string, Money>();
  for (const row of a) sums.set(row.ownerId, (sums.get(row.ownerId) ?? D(0)).plus(row.amountUsd));
  for (const row of b) sums.set(row.ownerId, (sums.get(row.ownerId) ?? D(0)).plus(D(row.amountUsd).mul(sign)));
  return [...sums].map(([ownerId, amountUsd]) => ({ ownerId, amountUsd: roundMoney(amountUsd) }));
}

/**
 * The owners' part of a corrected amount, with the same shares the original amount was booked at
 * (whatever the shares are now); at today's shares when there is nothing to scale by.
 */
async function reallocate(tx: Tx, storeId: string, amountUsd: Money, booked: Allocation[], bookedTotalUsd: MoneyInput): Promise<Allocation[]> {
  if (amountUsd.isZero()) return [];
  return allocateLikeBooked(amountUsd, booked, bookedTotalUsd) ?? allocateOwnerProfit(amountUsd, await getOwnersForStore(tx, storeId));
}

/**
 * A correction belongs to the business day of the operation it corrects. Locks the store row (the
 * lock every register operation and the shift closing take) and refuses once a collection took
 * that money to Central Cash — the same rule as reopening a collected shift.
 */
async function lockEditableDay(tx: Tx, storeId: string, at: Date): Promise<Day> {
  await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
  const collected = await tx.cashHandover.findFirst({ where: { storeId, cancelledAt: null, createdAt: { gt: at } }, select: { id: true } });
  if (collected) throw refused('Деньги этой операции уже инкассированы. Сначала отмените инкассацию, затем исправьте операцию');
  return { storeId, businessDate: getBusinessDateKey(at) };
}

type Posting = { id: string; amountTjs: Money; amountUsd: Money; description: string; transactionDate: Date };

/**
 * Replaces an operation's register posting by the corrected one: the old one is reversed on its own
 * date and the new one booked on that same date, so the day's shift and the ledger both show the
 * corrected amount; the register moves by the difference.
 */
async function rebookPosting(tx: Tx, input: {
  old: Posting | null; storeId: string; actor: Actor; at: Date; rate: MoneyInput; saleId: string;
  direction: 'IN' | 'OUT'; amountTjs: Money; amountUsd: Money; description: string;
}) {
  const { old } = input;
  if (old && D(old.amountTjs).eq(input.amountTjs) && D(old.amountUsd).eq(input.amountUsd) && old.description === input.description) return;
  if (!old && input.amountTjs.isZero() && input.amountUsd.isZero()) return;
  const delta = roundMoney(input.amountUsd.minus(old?.amountUsd ?? 0).mul(input.direction === 'IN' ? 1 : -1));
  if (old) await cancelTransaction(tx, old.id, input.actor.id, { keepDate: true });
  if (!input.amountTjs.isZero() || !input.amountUsd.isZero()) {
    const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId }, select: { id: true, name: true } });
    const account = await getStoreCashAccount(tx, store.id, store.name);
    const income = input.direction === 'IN';
    await postTransaction(tx, {
      type: income ? 'INCOME' : 'REFUND', direction: input.direction, numberPrefix: income ? 'CR' : 'RF',
      accountId: account.id, balanceCurrency: 'USD',
      amount: input.amountTjs, currency: 'TJS', exchangeRate: input.rate, amountTjs: input.amountTjs, amountUsd: input.amountUsd,
      categoryName: income ? 'Продажа' : 'Возврат покупателю', shopId: input.storeId, sourceType: 'SALE', sourceId: input.saleId,
      description: input.description, createdByUserId: input.actor.id, guardBalance: false,
      transactionDate: old?.transactionDate ?? input.at,
    });
  }
  if (delta.lt(0)) {
    const guard = await tx.store.updateMany({ where: { id: input.storeId, cashBalanceUsd: { gte: delta.negated() } }, data: { cashBalanceUsd: { increment: delta } } });
    if (guard.count !== 1) throw refused('В кассе магазина недостаточно средств для этого исправления');
  } else if (delta.gt(0)) {
    await tx.store.update({ where: { id: input.storeId }, data: { cashBalanceUsd: { increment: delta } } });
  }
}

/** A refund's live register posting: its amount, booked closest to the moment it was made. */
async function findRefundPosting(tx: Tx, saleId: string, amountTjs: MoneyInput, amountUsd: MoneyInput, at: Date): Promise<Posting | null> {
  if (D(amountTjs).isZero() && D(amountUsd).isZero()) return null;
  const rows = await tx.financialTransaction.findMany({
    where: { sourceType: 'SALE', sourceId: saleId, type: 'REFUND', direction: 'OUT', status: 'POSTED', reversedTransactionId: null, amountTjs: D(amountTjs), amountUsd: D(amountUsd) },
    select: { id: true, amountTjs: true, amountUsd: true, description: true, transactionDate: true },
  });
  const nearest = rows.sort((a, b) => Math.abs(a.transactionDate.getTime() - at.getTime()) - Math.abs(b.transactionDate.getTime() - at.getTime()))[0];
  if (!nearest || Math.abs(nearest.transactionDate.getTime() - at.getTime()) > 10 * 60 * 1000) {
    throw new Error('Не найдена кассовая проводка этого возврата — исправление невозможно, требуется сверка');
  }
  return nearest;
}

const saleInclude = { saleItems: true, accessoryItems: true, exchangeReturn: true } as const;
type SaleRow = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;
type ReturnRow = SaleReturn;

/** Only a receipt nothing happened to after it can be re-priced: returns, refunds and repayments booked its old amounts. */
async function assertSaleEditable(tx: Tx, sale: SaleRow) {
  if (sale.annulledAt) throw refused('Чек аннулирован — исправление невозможно');
  if (sale.status !== 'COMPLETED') throw refused('Чек уже возвращён — исправьте сам возврат');
  const [returns, exchanges, repayments, history, closedBonus] = await Promise.all([
    tx.saleReturn.count({ where: { saleId: sale.id } }),
    tx.exchangeEvent.count({ where: { saleId: sale.id } }),
    tx.customerPaymentAllocation.count({ where: { saleId: sale.id } }),
    tx.auditLog.count({ where: { targetId: sale.id, action: { in: ['REFUND', 'SALE_RETURN', 'REFUND_CANCEL', 'SALE_RETURN_CANCEL', 'EXCHANGE'] } } }),
    tx.bonusPoolEntry.count({ where: { saleId: sale.id, status: { not: 'PENDING' } } }),
  ]);
  if (returns) throw refused('По чеку уже есть возвраты: исправьте или отмените их, затем исправьте продажу');
  if (exchanges) throw refused('По чеку был обмен старого образца — исправление невозможно, используйте аннуляцию');
  if (repayments) throw refused('По чеку уже принимались оплаты долга — сначала отмените их');
  if (history) throw refused('По чеку уже были возвраты или их отмены — исправление невозможно, используйте аннуляцию');
  if (closedBonus) throw refused('Бонус по чеку уже распределён — сначала отмените распределение');
}

interface SaleCalc {
  totalTjs: Money; totalUsd: Money; cashTjs: Money; cardTjs: Money; debtTjs: Money; upfrontTjs: Money; upfrontUsd: Money;
  items: { row: SaleRow['saleItems'][number]; priceTjs: Money; priceUsd: Money; isBelowCost: boolean }[];
  lines: { row: SaleRow['accessoryItems'][number]; unitTjs: Money; priceTjs: Money; priceUsd: Money; isBelowCost: boolean }[];
  regularProfitUsd: Money; bonusProfitUsd: Money; hasBelowCostItem: boolean;
  tradeIn?: { creditTjs: Money; creditUsd: Money };
}

/** The receipt as if it had been rung up with the corrected prices, at its own rate. */
function calcSale(sale: SaleRow, input: SaleEditInput, rate: Money, tradeInFor?: (totalTjs: Money, totalUsd: Money) => { creditTjs: Money; creditUsd: Money } | undefined): SaleCalc {
  const itemPrices = new Map<string, MoneyInput>();
  for (const row of input.items ?? []) {
    if (!sale.saleItems.some((item) => item.id === row.saleItemId)) throw new Error('Позиция не найдена в этом чеке');
    itemPrices.set(row.saleItemId, row.salePriceTjs);
  }
  const unitPrices = new Map<string, MoneyInput>();
  for (const row of input.accessories ?? []) {
    if (!sale.accessoryItems.some((line) => line.id === row.lineId)) throw new Error('Аксессуар не найден в этом чеке');
    unitPrices.set(row.lineId, row.unitPriceTjs);
  }
  const items = sale.saleItems.map((row) => ({ row, priceTjs: requirePositiveMoney(itemPrices.get(row.id) ?? row.salePriceTjs, `Цена ${row.model}`) }));
  const lines = sale.accessoryItems.map((row) => {
    const unitTjs = requirePositiveMoney(unitPrices.get(row.id) ?? row.unitPriceTjs, `Цена ${row.name}`);
    return { row, unitTjs, priceTjs: roundMoney(unitTjs.mul(row.quantity)) };
  });
  const totalTjs = [...items, ...lines].reduce((sum, x) => sum.plus(x.priceTjs), D(0));
  const totalUsd = roundMoney(totalTjs.div(rate));
  const split = allocateMoney(totalUsd, [...items.map((x) => x.priceTjs), ...lines.map((x) => x.priceTjs)]);

  let regularRevenueUsd = D(0);
  let regularCostUsd = D(0);
  let bonusProfitUsd = D(0);
  const pricedItems = items.map((x, i) => {
    const priceUsd = split[i];
    const isBelowCost = !x.row.isBonus && x.priceTjs.lt(D(x.row.costBasisUsd).mul(rate));
    if (x.row.isBonus) bonusProfitUsd = bonusProfitUsd.plus(priceUsd);
    else { regularRevenueUsd = regularRevenueUsd.plus(priceUsd); regularCostUsd = regularCostUsd.plus(x.row.costBasisUsd); }
    return { ...x, priceUsd, isBelowCost };
  });
  const pricedLines = lines.map((x, i) => {
    const priceUsd = split[items.length + i];
    regularRevenueUsd = regularRevenueUsd.plus(priceUsd);
    regularCostUsd = regularCostUsd.plus(x.row.costUsd);
    return { ...x, priceUsd, isBelowCost: x.priceTjs.lt(D(x.row.costUsd).mul(rate)) };
  });

  const tradeIn = tradeInFor?.(totalTjs, totalUsd);
  if (tradeIn && tradeIn.creditTjs.gt(totalTjs)) throw new Error('Сумма нового чека не может быть меньше зачёта по обмену');
  const payableTjs = totalTjs.minus(tradeIn?.creditTjs ?? 0);
  let cashTjs = D(0);
  let cardTjs = D(0);
  let debtTjs = D(0);
  if (sale.paymentMethod === 'CASH') cashTjs = payableTjs;
  else if (sale.paymentMethod === 'CARD') cardTjs = payableTjs;
  else if (sale.paymentMethod === 'SPLIT') {
    cashTjs = requireNonNegativeMoney(input.cashAmountTjs ?? sale.cashAmountTjs, 'Сумма наличными');
    cardTjs = requireNonNegativeMoney(input.cardAmountTjs ?? sale.cardAmountTjs, 'Сумма по карте');
    if (!moneyEquals(cashTjs.plus(cardTjs), payableTjs)) {
      throw new Error(`Наличные и карта вместе должны составлять ${roundMoney(payableTjs)} TJS`);
    }
  } else if (sale.paymentMethod === 'DEBT') {
    cashTjs = requireNonNegativeMoney(input.cashAmountTjs ?? sale.cashAmountTjs, 'Сумма наличными');
    cardTjs = requireNonNegativeMoney(input.cardAmountTjs ?? sale.cardAmountTjs, 'Сумма по карте');
    debtTjs = totalTjs.minus(cashTjs).minus(cardTjs);
    if (debtTjs.lte(0)) throw new Error('При продаже в долг сумма долга должна быть больше 0: уменьшите первый взнос');
  } else {
    throw new Error('Неизвестный способ оплаты чека');
  }
  const upfrontTjs = cashTjs.plus(cardTjs);
  const upfrontUsd = tradeIn ? roundMoney(totalUsd.minus(tradeIn.creditUsd)) : roundMoney(upfrontTjs.div(rate));
  if (upfrontUsd.lt(0)) throw new Error('Зачёт по обмену больше суммы нового чека');
  return {
    totalTjs, totalUsd, cashTjs, cardTjs, debtTjs, upfrontTjs, upfrontUsd, items: pricedItems, lines: pricedLines,
    regularProfitUsd: roundMoney(regularRevenueUsd.minus(regularCostUsd)), bonusProfitUsd: roundMoney(bonusProfitUsd),
    hasBelowCostItem: [...pricedItems, ...pricedLines].some((x) => x.isBelowCost), tradeIn,
  };
}

/** Writes a corrected receipt: its register posting, lines, debt, bonus pool, owners' profit and the sale's own record. */
async function applySale(tx: Tx, sale: SaleRow, calc: SaleCalc, rate: Money, actor: Actor, tradeInReceiptNumber?: number) {
  const saleLog = await tx.auditLog.findFirst({ where: { targetId: sale.id, action: { in: ['SALE', 'SALE_BELOW_COST'] } } });
  const details = (saleLog?.financialDetails ?? null) as Record<string, unknown> | null;
  if (!saleLog || !details || !Array.isArray(details.ownerProfitAllocations)) {
    throw new Error('Не сохранено исходное распределение прибыли чека — исправление невозможно, требуется сверка');
  }

  // 1. The register: what the receipt took up front, at the receipt's own rate.
  const oldPostings = await tx.financialTransaction.findMany({
    where: { sourceType: 'SALE', sourceId: sale.id, direction: 'IN', status: 'POSTED', reversedTransactionId: null },
    select: { id: true, amountTjs: true, amountUsd: true, description: true, transactionDate: true },
  });
  if (oldPostings.length > 1) throw new Error('У чека несколько кассовых проводок — исправление невозможно, требуется сверка');
  const customer = sale.customerId ? await tx.customer.findUnique({ where: { id: sale.customerId }, select: { name: true } }) : null;
  const description = `Чек #${sale.receiptNumber}: ${salePaymentDescription({
    paymentMethod: sale.paymentMethod, cashAmountTjs: calc.cashTjs, cardAmountTjs: calc.cardTjs, debtAmountTjs: calc.debtTjs,
    customerName: sale.customerName ?? customer?.name, tradeInReceiptNumber,
  })}`;
  await rebookPosting(tx, {
    old: oldPostings[0] ?? null, storeId: sale.storeId, actor, at: sale.createdAt, rate, saleId: sale.id,
    direction: 'IN', amountTjs: calc.upfrontTjs.isZero() ? D(0) : calc.upfrontTjs, amountUsd: calc.upfrontTjs.isZero() ? D(0) : calc.upfrontUsd, description,
  });

  // 2. The receipt and its lines.
  await tx.sale.update({ where: { id: sale.id }, data: {
    totalTjs: calc.totalTjs, totalUsd: calc.totalUsd, cashAmountTjs: calc.cashTjs, cardAmountTjs: calc.cardTjs, debtAmountTjs: calc.debtTjs,
    hasBelowCostItem: calc.hasBelowCostItem,
    ...(sale.exchangeTradeInCreditTjs !== null || calc.tradeIn
      ? { exchangeTradeInCreditTjs: calc.tradeIn?.creditTjs ?? null, exchangeTradeInCreditUsd: calc.tradeIn?.creditUsd ?? null }
      : {}),
  } });
  for (const x of calc.items) {
    await tx.saleItem.update({ where: { id: x.row.id }, data: { salePriceTjs: x.priceTjs, salePriceUsd: x.priceUsd, isBelowCost: x.isBelowCost } });
    if (x.row.isBonus) {
      await tx.bonusPoolEntry.updateMany({ where: { saleId: sale.id, deviceId: x.row.deviceId, status: 'PENDING' }, data: {
        salePriceTjs: x.priceTjs, salePriceUsd: x.priceUsd, profitTjs: x.priceTjs, profitUsd: x.priceUsd,
      } });
    }
    if (!x.priceTjs.eq(x.row.salePriceTjs)) {
      const events = await tx.deviceTimelineEvent.findMany({ where: { deviceId: x.row.deviceId, type: 'SALE', description: { contains: `(чек #${sale.receiptNumber})` } } });
      for (const event of events) {
        await tx.deviceTimelineEvent.update({ where: { id: event.id }, data: {
          priceTjs: x.priceTjs, priceUsd: x.priceUsd,
          description: event.description.replace(/^Продано за [\d.]+ TJS/, `Продано за ${x.priceTjs} TJS`),
        } });
      }
    }
  }
  for (const x of calc.lines) {
    await tx.saleAccessoryItem.update({ where: { id: x.row.id }, data: { unitPriceTjs: x.unitTjs, salePriceTjs: x.priceTjs, salePriceUsd: x.priceUsd, isBelowCost: x.isBelowCost } });
  }

  // 3. The customer's debt follows the receipt's.
  const debtDelta = calc.debtTjs.minus(sale.debtAmountTjs);
  if (!debtDelta.isZero()) {
    if (!sale.customerId) throw new Error('У чека в долг не указан клиент');
    await tx.customer.update({ where: { id: sale.customerId }, data: { totalDebtTjs: { increment: debtDelta } } });
  }

  // 4. Owners: the corrected profit with the shares the receipt was booked at.
  const booked = allocationsOf(details.ownerProfitAllocations);
  const bookedProfit = typeof details.recognizedProfitUsd === 'number' ? details.recognizedProfitUsd : 0;
  const allocations = await reallocate(tx, sale.storeId, calc.regularProfitUsd, booked, bookedProfit);
  await replaceOwnerAllocations(tx, booked, allocations, 1);
  await tx.auditLog.update({ where: { id: saleLog.id }, data: {
    action: calc.hasBelowCostItem ? 'SALE_BELOW_COST' : 'SALE',
    financialDetails: moneyJson({
      ...details, amountTjs: calc.totalTjs, amountUsd: calc.totalUsd, debtAmountTjs: calc.debtTjs,
      ...(calc.tradeIn ? { tradeInCreditTjs: calc.tradeIn.creditTjs, tradeInCreditUsd: calc.tradeIn.creditUsd } : {}),
      recognizedProfitUsd: calc.regularProfitUsd, bonusProfitUsd: calc.bonusProfitUsd, ownerProfitAllocations: moneyJson(allocations),
    }),
  } });

  // 5. The journal only grows: the correction is its own line.
  const deltaTjs = calc.totalTjs.minus(sale.totalTjs);
  const deltaUsd = calc.totalUsd.minus(sale.totalUsd);
  if (!deltaTjs.isZero() || !deltaUsd.isZero()) {
    const store = await tx.store.findUnique({ where: { id: sale.storeId }, select: { name: true } });
    await tx.ledgerEntry.create({ data: {
      type: 'SALE', description: `Исправление чека #${sale.receiptNumber}: сумма ${sale.totalTjs} → ${calc.totalTjs} TJS`,
      amountTjs: deltaTjs, amountUsd: deltaUsd, exchangeRate: rate, storeId: sale.storeId, storeName: store?.name, userName: actor.name, referenceId: sale.id,
    } });
  }
  return { totalTjs: { before: D(sale.totalTjs), after: calc.totalTjs }, totalUsd: { before: D(sale.totalUsd), after: calc.totalUsd }, profitUsd: { before: D(bookedProfit), after: calc.regularProfitUsd } };
}

type AccessoryPart = {
  lineId: string; productId?: string; name?: string; quantity: number; priceTjs: number; priceUsd: number; costUsd: number;
  withheldTjs?: number; withheldUsd?: number; creditTjs?: number; creditUsd?: number;
};

interface ReturnCalc {
  items: { row: SaleRow['saleItems'][number]; withheldTjs: Money; withheldUsd: Money; creditTjs: Money; creditUsd: Money; fxUsd: Money }[];
  parts: (AccessoryPart & { withheld: Money; withheldUsdNew: Money; credit: Money; creditUsdNew: Money; fxUsd: Money })[];
  withheldTjs: Money; withheldUsd: Money; creditTjs: Money; creditUsd: Money; fxUsd: Money;
}

/** A return as if it had been made with the corrected withheld amounts, at the return's own rate. */
function calcReturn(sale: SaleRow, ret: ReturnRow, input: { items?: ReturnEditInput['items']; accessories?: ReturnEditInput['accessories'] }, rate: Money): ReturnCalc {
  const returned = sale.saleItems.filter((item) => item.returnId === ret.id);
  const itemWithheld = new Map<string, MoneyInput>();
  for (const row of input.items ?? []) {
    if (!returned.some((item) => item.id === row.saleItemId)) throw new Error('Телефон не входит в этот возврат');
    itemWithheld.set(row.saleItemId, row.withheldTjs);
  }
  const accessoryParts = (Array.isArray(ret.accessoryLines) ? ret.accessoryLines : []) as AccessoryPart[];
  const partWithheld = new Map<string, MoneyInput>();
  for (const row of input.accessories ?? []) {
    if (!accessoryParts.some((part) => part.lineId === row.lineId)) throw new Error('Аксессуар не входит в этот возврат');
    partWithheld.set(row.lineId, row.withheldTjs);
  }
  const items = returned.map((row) => {
    const withheldTjs = requireNonNegativeMoney(itemWithheld.get(row.id) ?? row.returnWithheldTjs ?? 0, 'Удержание');
    if (withheldTjs.gt(row.salePriceTjs)) throw new Error(`Удержание за ${row.model} не может быть больше его цены в чеке (${row.salePriceTjs} TJS)`);
    const priceTodayUsd = roundMoney(D(row.salePriceTjs).div(rate));
    const withheldUsd = roundMoney(withheldTjs.div(rate));
    return {
      row, withheldTjs, withheldUsd, creditTjs: D(row.salePriceTjs).minus(withheldTjs),
      creditUsd: roundMoney(priceTodayUsd.minus(withheldUsd)), fxUsd: roundMoney(D(row.salePriceUsd).minus(priceTodayUsd)),
    };
  });
  const parts = accessoryParts.map((part) => {
    const withheld = requireNonNegativeMoney(partWithheld.get(part.lineId) ?? part.withheldTjs ?? 0, 'Удержание');
    if (withheld.gt(part.priceTjs)) throw new Error(`Удержание за ${part.name ?? 'аксессуар'} не может быть больше его цены (${part.priceTjs} TJS)`);
    const priceTodayUsd = roundMoney(D(part.priceTjs).div(rate));
    const withheldUsdNew = roundMoney(withheld.div(rate));
    return {
      ...part, withheld, withheldUsdNew, credit: D(part.priceTjs).minus(withheld),
      creditUsdNew: roundMoney(priceTodayUsd.minus(withheldUsdNew)), fxUsd: roundMoney(D(part.priceUsd).minus(priceTodayUsd)),
    };
  });
  const sum = (values: MoneyInput[]) => roundMoney(values.reduce<Money>((acc, v) => acc.plus(v), D(0)));
  return {
    items, parts,
    withheldTjs: sum([...items.map((x) => x.withheldTjs), ...parts.map((x) => x.withheld)]),
    withheldUsd: sum([...items.map((x) => x.withheldUsd), ...parts.map((x) => x.withheldUsdNew)]),
    creditTjs: sum([...items.map((x) => x.creditTjs), ...parts.map((x) => x.credit)]),
    creditUsd: sum([...items.map((x) => x.creditUsd), ...parts.map((x) => x.creditUsdNew)]),
    fxUsd: sum([...items.map((x) => x.fxUsd), ...parts.map((x) => x.fxUsd)]),
  };
}

/** Writes a corrected return: its payout posting, rows, owners' income and its own record. */
async function applyReturn(tx: Tx, sale: SaleRow, ret: ReturnRow, calc: ReturnCalc, payout: { tjs: Money; usd: Money; method: 'CASH' | 'CARD' }, actor: Actor) {
  const log = (await tx.auditLog.findMany({ where: { targetId: sale.id, action: 'SALE_RETURN' } }))
    .find((row) => (row.financialDetails as { saleReturnId?: string } | null)?.saleReturnId === ret.id);
  const details = (log?.financialDetails ?? null) as Record<string, unknown> | null;
  if (!log || !details) throw new Error('Не найдена исходная запись возврата — исправление невозможно, требуется сверка');
  if (payout.usd.lt(0)) throw new Error('Не удалось рассчитать сумму к выдаче клиенту');

  // 1. The register: what was handed back, at the return's own rate.
  const old = await findRefundPosting(tx, sale.id, ret.payoutTjs, ret.payoutUsd, ret.createdAt);
  const method = payout.method;
  await rebookPosting(tx, {
    old, storeId: sale.storeId, actor, at: ret.createdAt, rate: ret.exchangeRate, saleId: sale.id, direction: 'OUT',
    amountTjs: payout.tjs, amountUsd: payout.usd,
    description: `Возврат по чеку #${sale.receiptNumber} (${method === 'CARD' ? 'переводом / картой' : 'наличными'}): ${ret.reason}`,
  });

  // 2. Owners keep the withheld part and the rate result: the same reversal, a corrected income.
  const reversal = allocationsOf(details.reversedAllocations);
  const before = allocationsOf(ret.ownerProfitAllocations);
  const oldIncome = roundMoney(D(ret.withheldUsd).plus(ret.fxUsd));
  const newIncome = roundMoney(calc.withheldUsd.plus(calc.fxUsd));
  const income = await reallocate(tx, sale.storeId, newIncome, combine(before, reversal, 1), oldIncome);
  const after = combine(income, reversal, -1);
  await replaceOwnerAllocations(tx, before, after, 1);

  // 3. The return, its lines and the receipt's return totals.
  await tx.saleReturn.update({ where: { id: ret.id }, data: {
    withheldTjs: calc.withheldTjs, withheldUsd: calc.withheldUsd, creditTjs: calc.creditTjs, creditUsd: calc.creditUsd,
    payoutTjs: payout.tjs, payoutUsd: payout.usd, payoutMethod: payout.tjs.gt(0) ? method : null,
    ownerProfitAllocations: moneyJson(after),
    ...(calc.parts.length ? { accessoryLines: moneyJson(calc.parts.map(({ withheld, withheldUsdNew, credit, creditUsdNew, fxUsd: _fx, ...part }) => ({
      ...part, withheldTjs: withheld, withheldUsd: withheldUsdNew, creditTjs: credit, creditUsd: creditUsdNew,
    }))) } : {}),
  } });
  for (const x of calc.items) {
    await tx.saleItem.update({ where: { id: x.row.id }, data: {
      returnWithheldTjs: x.withheldTjs, returnWithheldUsd: x.withheldUsd, returnCreditTjs: x.creditTjs, returnCreditUsd: x.creditUsd,
    } });
  }
  if (sale.status === 'REFUNDED') {
    const all = await tx.saleReturn.aggregate({ where: { saleId: sale.id }, _sum: { withheldTjs: true, withheldUsd: true, creditTjs: true } });
    await tx.sale.update({ where: { id: sale.id }, data: {
      penaltyFeeTjs: roundMoney(all._sum.withheldTjs ?? 0), penaltyFeeUsd: roundMoney(all._sum.withheldUsd ?? 0), actualRefundAmountTjs: roundMoney(all._sum.creditTjs ?? 0),
    } });
  }
  const oldDelta = typeof details.profitDeltaUsd === 'number' ? details.profitDeltaUsd : 0;
  const itemDetails = Array.isArray(details.items) ? details.items as Record<string, unknown>[] : [];
  const accessoryDetails = Array.isArray(details.accessories) ? details.accessories as Record<string, unknown>[] : [];
  await tx.auditLog.update({ where: { id: log.id }, data: { financialDetails: moneyJson({
    ...details,
    items: itemDetails.map((row) => {
      const x = calc.items.find((item) => item.row.id === row.saleItemId);
      return x ? { ...row, withheldTjs: x.withheldTjs, withheldUsd: x.withheldUsd, creditTjs: x.creditTjs, creditUsd: x.creditUsd } : row;
    }),
    accessories: accessoryDetails.map((row) => {
      const x = calc.parts.find((part) => part.lineId === row.lineId);
      return x ? { ...row, withheldTjs: x.withheld, creditTjs: x.credit } : row;
    }),
    withheldTjs: calc.withheldTjs, withheldUsd: calc.withheldUsd, creditTjs: calc.creditTjs, creditUsd: calc.creditUsd,
    payoutTjs: payout.tjs, payoutUsd: payout.usd,
    profitDeltaUsd: roundMoney(D(oldDelta).plus(newIncome).minus(oldIncome)),
    ownerProfitAllocations: moneyJson(after),
  }) } });

  // 4. The journal: the corrected payout as its own line.
  const deltaTjs = payout.tjs.minus(ret.payoutTjs);
  const deltaUsd = payout.usd.minus(ret.payoutUsd);
  if (!deltaTjs.isZero() || !deltaUsd.isZero()) {
    const store = await tx.store.findUnique({ where: { id: sale.storeId }, select: { name: true } });
    await tx.ledgerEntry.create({ data: {
      type: 'REFUND', description: `Исправление возврата по чеку #${sale.receiptNumber}: выдано ${ret.payoutTjs} → ${payout.tjs} TJS`,
      amountTjs: deltaTjs.negated(), amountUsd: deltaUsd.negated(), exchangeRate: ret.exchangeRate,
      storeId: sale.storeId, storeName: store?.name, userName: actor.name, referenceId: sale.id,
    } });
  }
  return { withheldTjs: { before: D(ret.withheldTjs), after: calc.withheldTjs }, payoutTjs: { before: D(ret.payoutTjs), after: payout.tjs }, payoutUsd: { before: D(ret.payoutUsd), after: payout.usd } };
}

async function lockSales(tx: Tx, ids: string[]) {
  for (const id of [...ids].sort()) await tx.$queryRaw`SELECT id FROM sales WHERE id = ${id} FOR UPDATE`;
}

async function record(tx: Tx, actor: Actor, sale: { id: string; receiptNumber: number; storeId: string }, kind: string, details: string, changes: Record<string, unknown>, days: Day[]) {
  const correctedClosings = await DailyClosingService.refreshClosedDays(tx, days);
  await tx.auditLog.create({ data: {
    userId: actor.id, userName: actor.name, userRole: actor.role, action: 'SALE_EDITED', targetId: sale.id, receiptNumber: sale.receiptNumber,
    details, financialDetails: moneyJson({ kind, storeId: sale.storeId, ...changes, correctedClosings: correctedClosings.map((c) => ({ businessDate: c.after.businessDate, before: c.before.expectedCashTjs, after: c.after.expectedCashTjs })) }),
  } });
}

/**
 * Admin corrections of past operations. Each one recalculates the operation as if it had been
 * made correctly at its own rate and on its own day: the register posting is rebooked on that
 * day, the owners' profit, the customer's debt and the closed shift of that day are recalculated,
 * and everything happens in one transaction. Money already collected is never touched.
 */
export class SaleEditService {
  static async editSale(saleId: string, input: SaleEditInput, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      await lockSales(tx, [saleId]);
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: saleInclude });
      if (sale.exchangeReturn) throw refused('Это чек обмена — исправьте его через «Исправить обмен»');
      await assertSaleEditable(tx, sale);
      if (!sale.exchangeRate) throw new Error('У чека не сохранён курс — исправление невозможно');
      const rate = D(sale.exchangeRate);
      const day = await lockEditableDay(tx, sale.storeId, sale.createdAt);
      const calc = calcSale(sale, input, rate);
      const changes = await applySale(tx, sale, calc, rate, actor);
      await record(tx, actor, sale, 'SALE', `Чек #${sale.receiptNumber}: исправлена продажа — сумма ${sale.totalTjs} → ${calc.totalTjs} TJS ($${sale.totalUsd} → $${calc.totalUsd})`, changes, [day]);
      return { storeId: sale.storeId, saleId };
    }, { maxWait: 10000, timeout: 30000 });
  }

  static async editReturn(saleId: string, returnId: string, input: ReturnEditInput, userId: string) {
    if (input.payoutMethod && !['CASH', 'CARD'].includes(input.payoutMethod)) throw new Error('Некорректный способ возврата денег');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      await lockSales(tx, [saleId]);
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: saleInclude });
      if (sale.annulledAt) throw refused('Чек аннулирован — исправление невозможно');
      const ret = await tx.saleReturn.findUnique({ where: { id: returnId } });
      if (!ret || ret.saleId !== sale.id) throw new Error('Возврат не найден в этом чеке');
      if (ret.exchangeSaleId) throw refused('Это возврат в рамках обмена — исправьте обмен в его новом чеке');
      const day = await lockEditableDay(tx, sale.storeId, ret.createdAt);
      const rate = D(ret.exchangeRate);
      const calc = calcReturn(sale, ret, input, rate);
      const method = input.payoutMethod ?? (ret.payoutMethod as 'CASH' | 'CARD' | null) ?? 'CASH';
      const changes = await applyReturn(tx, sale, ret, calc, { tjs: calc.creditTjs, usd: calc.creditUsd, method }, actor);
      await record(tx, actor, sale, 'RETURN', `Чек #${sale.receiptNumber}: исправлен возврат — удержано ${ret.withheldTjs} → ${calc.withheldTjs} TJS, выдано ${ret.payoutTjs} → ${calc.creditTjs} TJS`, { returnId, ...changes }, [day]);
      return { storeId: sale.storeId, saleId };
    }, { maxWait: 10000, timeout: 30000 });
  }

  /** A whole-receipt refund: its withheld penalty, and with it the amount handed back. */
  static async editRefund(saleId: string, penaltyFeeTjs: MoneyInput, userId: string) {
    const penaltyTjs = requireNonNegativeMoney(penaltyFeeTjs, 'Штраф');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      await lockSales(tx, [saleId]);
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: saleInclude });
      if (sale.annulledAt) throw refused('Чек аннулирован — исправление невозможно');
      if (sale.status !== 'REFUNDED') throw refused('Чек не возвращён');
      if (await tx.saleReturn.count({ where: { saleId } })) throw refused('Возврат оформлен по позициям — исправьте нужный возврат');
      const logs = await tx.auditLog.findMany({ where: { targetId: saleId }, orderBy: { createdAt: 'desc' } });
      const refundLog = activeRefundLogs(logs).find((log) => log.action === 'REFUND');
      const details = (refundLog?.financialDetails ?? null) as Record<string, unknown> | null;
      if (!refundLog || !details || typeof details.amountUsd !== 'number' || typeof details.exchangeRate !== 'number' || !Array.isArray(details.ownerProfitAllocations)) {
        throw new Error('Не сохранены исходные суммы возврата — исправление невозможно, требуется сверка');
      }
      if (details.isCancellation) throw refused('Это отмена продажи — в ней нет штрафа для исправления');
      const refundedAt = sale.refundedAt ?? refundLog.createdAt;
      const day = await lockEditableDay(tx, sale.storeId, refundedAt);
      const rate = D(details.exchangeRate);
      const oldPenaltyTjs = D(sale.penaltyFeeTjs ?? 0);
      const oldPenaltyUsd = D(sale.penaltyFeeUsd ?? (typeof details.penaltyUsd === 'number' ? details.penaltyUsd : 0));
      const oldRefundTjs = D(sale.actualRefundAmountTjs ?? 0);
      const oldRefundUsd = D(details.amountUsd);
      const collectedTjs = oldRefundTjs.plus(oldPenaltyTjs);
      if (penaltyTjs.gt(collectedTjs)) throw new Error('Штраф не может превышать фактически полученную сумму по чеку');
      const collectedUsd = oldRefundUsd.plus(oldPenaltyUsd);
      const penaltyUsd = roundMoney(penaltyTjs.div(rate));
      const refundTjs = collectedTjs.minus(penaltyTjs);
      const refundUsd = roundMoney(collectedUsd.minus(penaltyUsd));

      // The register: the posting this refund made, rebooked on its day with its channel.
      const old = await findRefundPosting(tx, saleId, oldRefundTjs, oldRefundUsd, refundedAt);
      const card = isCardRefund(old?.description);
      await rebookPosting(tx, {
        old, storeId: sale.storeId, actor, at: refundedAt, rate, saleId, direction: 'OUT', amountTjs: refundTjs, amountUsd: refundUsd,
        description: `Возврат по чеку #${sale.receiptNumber} (${card ? 'переводом / картой' : 'наличными'}): ${sale.refundReason ?? ''}`,
      });

      // Owners: the refund reversed the booked profit and kept the penalty and the rate result;
      // only the penalty part changes, split like the refund's own income.
      const booked = logs.filter((log) => ['SALE', 'SALE_BELOW_COST', 'EXCHANGE'].includes(log.action))
        .reduce<Allocation[]>((acc, log) => combine(acc, allocationsOf((log.financialDetails as { ownerProfitAllocations?: unknown } | null)?.ownerProfitAllocations), 1), []);
      const before = allocationsOf(details.ownerProfitAllocations);
      const otherIncome = D(typeof details.fxGainUsd === 'number' ? details.fxGainUsd : 0).plus(typeof details.resoldTradeInAdjustmentUsd === 'number' ? details.resoldTradeInAdjustmentUsd : 0);
      const oldIncome = roundMoney(oldPenaltyUsd.plus(otherIncome));
      const income = await reallocate(tx, sale.storeId, roundMoney(penaltyUsd.plus(otherIncome)), combine(before, booked, 1), oldIncome);
      const after = combine(income, booked, -1);
      await replaceOwnerAllocations(tx, before, after, 1);

      await tx.sale.update({ where: { id: saleId }, data: { penaltyFeeTjs: penaltyTjs, penaltyFeeUsd: penaltyUsd, actualRefundAmountTjs: refundTjs } });
      await tx.auditLog.update({ where: { id: refundLog.id }, data: { financialDetails: moneyJson({
        ...details, amountTjs: refundTjs, amountUsd: refundUsd, penaltyTjs, penaltyUsd, ownerProfitAllocations: moneyJson(after),
      }) } });
      if (!refundTjs.eq(oldRefundTjs) || !refundUsd.eq(oldRefundUsd)) {
        const store = await tx.store.findUnique({ where: { id: sale.storeId }, select: { name: true } });
        await tx.ledgerEntry.create({ data: {
          type: 'REFUND', description: `Исправление возврата по чеку #${sale.receiptNumber}: выдано ${oldRefundTjs} → ${refundTjs} TJS`,
          amountTjs: refundTjs.minus(oldRefundTjs).negated(), amountUsd: refundUsd.minus(oldRefundUsd).negated(), exchangeRate: rate,
          storeId: sale.storeId, storeName: store?.name, userName: actor.name, referenceId: saleId,
        } });
      }
      await record(tx, actor, sale, 'REFUND', `Чек #${sale.receiptNumber}: исправлен возврат — штраф ${oldPenaltyTjs} → ${penaltyTjs} TJS, выдано ${oldRefundTjs} → ${refundTjs} TJS`, {
        penaltyTjs: { before: oldPenaltyTjs, after: penaltyTjs }, refundTjs: { before: oldRefundTjs, after: refundTjs }, refundUsd: { before: oldRefundUsd, after: refundUsd },
      }, [day]);
      return { storeId: sale.storeId, saleId };
    }, { maxWait: 10000, timeout: 30000 });
  }

  /**
   * An exchange: the returned goods' withheld amount (and with it their credit) and the new
   * receipt's prices, recalculated together — the credit pays the new receipt first, the rest is
   * the customer's surcharge, or the change handed back.
   */
  static async editExchange(newSaleId: string, input: ExchangeEditInput, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const head = await tx.sale.findUniqueOrThrow({ where: { id: newSaleId }, include: { exchangeReturn: true } });
      if (!head.exchangeReturn) throw refused('Это не чек обмена');
      await lockSales(tx, [newSaleId, head.exchangeReturn.saleId]);
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: newSaleId }, include: saleInclude });
      const ret = sale.exchangeReturn!;
      const original = await tx.sale.findUniqueOrThrow({ where: { id: ret.saleId }, include: saleInclude });
      if (original.annulledAt) throw refused('Исходный чек обмена аннулирован — исправление невозможно');
      await assertSaleEditable(tx, sale);
      const rate = D(ret.exchangeRate);
      const day = await lockEditableDay(tx, sale.storeId, ret.createdAt);
      let returned: { items?: ReturnEditInput['items']; accessories?: ReturnEditInput['accessories'] } = { items: input.returnItems, accessories: input.returnAccessories };
      if (input.returnWithheldTjs !== undefined) {
        const phones = original.saleItems.filter((item) => item.returnId === ret.id);
        const parts = (Array.isArray(ret.accessoryLines) ? ret.accessoryLines : []) as AccessoryPart[];
        if (phones.length + parts.length !== 1) throw new Error('Укажите удержание по каждому сданному товару');
        returned = phones.length
          ? { items: [{ saleItemId: phones[0].id, withheldTjs: input.returnWithheldTjs }] }
          : { accessories: [{ lineId: parts[0].lineId, withheldTjs: input.returnWithheldTjs }] };
      }
      const returnCalc = calcReturn(original, ret, returned, rate);
      const calc = calcSale(sale, input, D(sale.exchangeRate ?? rate), (totalTjs, totalUsd) => {
        const fits = returnCalc.creditTjs.lte(totalTjs);
        const creditTjs = fits ? returnCalc.creditTjs : totalTjs;
        const creditUsd = fits ? returnCalc.creditUsd : totalUsd;
        return creditTjs.gt(0) ? { creditTjs, creditUsd } : undefined;
      });
      const appliedTjs = calc.tradeIn?.creditTjs ?? D(0);
      const appliedUsd = calc.tradeIn?.creditUsd ?? D(0);
      const payoutMethod = (ret.payoutMethod as 'CASH' | 'CARD' | null) ?? (sale.paymentMethod === 'CARD' ? 'CARD' : 'CASH');
      // The new receipt first (money in), then the change handed back (money out).
      const saleChanges = await applySale(tx, sale, calc, D(sale.exchangeRate ?? rate), actor, original.receiptNumber);
      const returnChanges = await applyReturn(tx, original, ret, returnCalc, {
        tjs: roundMoney(returnCalc.creditTjs.minus(appliedTjs)), usd: roundMoney(returnCalc.creditUsd.minus(appliedUsd)), method: payoutMethod,
      }, actor);
      const exchangeLog = await tx.auditLog.findFirst({ where: { targetId: sale.id, action: 'SALE_EXCHANGE' } });
      if (exchangeLog) {
        await tx.auditLog.update({ where: { id: exchangeLog.id }, data: { financialDetails: moneyJson({
          ...((exchangeLog.financialDetails ?? {}) as Record<string, unknown>),
          creditTjs: returnCalc.creditTjs, appliedTjs, payoutTjs: roundMoney(returnCalc.creditTjs.minus(appliedTjs)),
        }) } });
      }
      await record(tx, actor, sale, 'EXCHANGE', `Обмен по чеку #${original.receiptNumber} → чек #${sale.receiptNumber}: исправлен — новый чек ${sale.totalTjs} → ${calc.totalTjs} TJS, удержано ${ret.withheldTjs} → ${returnCalc.withheldTjs} TJS`, {
        originalSaleId: original.id, returnId: ret.id, sale: saleChanges, return: returnChanges,
      }, [day]);
      return { storeId: sale.storeId, saleId: newSaleId };
    }, { maxWait: 10000, timeout: 30000 });
  }
}
