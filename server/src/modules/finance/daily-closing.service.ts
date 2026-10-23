import type { DailyCashClosing, Prisma } from '@prisma/client';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { getBusinessDateKey, dateRangeForCustomDates } from '../../common/business-date';
import { roundMoney } from '../../common/money';
import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { resolveActor } from '../../common/actor';
import { onCommit } from '../../common/after-commit';
import { notifyAdmins } from '../notifications/notification.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { createExpense, cancelExpenseInTx, SHORTAGE_CATEGORY } from '../expenses/expenses.service';
import { getStoreCashAccount } from './account.service';
import { postTransaction, cancelTransaction } from './financial-transaction.service';
import { currentOwnerAllocations, readOwnerAllocations, replaceOwnerAllocations } from './owner-allocations';
import { SURPLUS_SOURCE } from './cash-balance';

type Db = TransactionClient;
type Money = ReturnType<typeof D>;

// Ledger sources that move the store register's cash and are not already covered by the
// sales / refunds / expenses / customer-payment queries below.
const OTHER_LEDGER_SOURCES = ['OWNER_TRANSACTION', 'SUPPLIER_PAYMENT'];

/** Ledger source of the money a cancelled refund brings back into the register. */
export const REFUND_CANCEL_SOURCE = 'RETURN_CANCEL';

/** "Возврат по чеку #12 (наличными): причина" / "Отмена возврата по чеку #12 (переводом / картой): причина". */
const REFUND_DESCRIPTION = /^(?:Отмена возврата|Возврат) по чеку #(\d+)(?: \((?:наличными|переводом \/ картой)\))?: ([\s\S]*)$/;

/** Refund postings record their payout channel in this fixed prefix; a cancellation keeps the refund's. */
export const isCardRefund = (description: string | null | undefined) =>
  /^(?:Отмена возврата|Возврат) по чеку #\d+ \(переводом \/ картой\):/.test(description ?? '');

/**
 * When a closing's own bookings (shortage, surplus) happen: now for today's shift; the last
 * moment of the day for a past one, so they stay in that closed day and never reach today's.
 */
function closingMoment(businessDate: string): Date {
  if (businessDate === getBusinessDateKey()) return new Date();
  return new Date(dateRangeForCustomDates(businessDate, businessDate).lt.getTime() - 1);
}

export interface DailyClosingSummary {
  storeId: string;
  storeName: string;
  businessDate: string;
  alreadyClosed: boolean;
  closing?: DailyCashClosing;
  openingCashTjs: string;
  openingCashUsd: string;
  salesCashTjs: string;
  salesCashUsd: string;
  salesCardTjs: string;
  /** Bank takings in dollars. Set on closings made under the day-total rules; null on older ones. */
  salesCardUsd: string | null;
  salesCount: number;
  expensesCashTjs: string;
  expensesCashUsd: string;
  expensesCount: number;
  refundsCashTjs: string;
  refundsCashUsd: string;
  refundsCardTjs: string;
  refundsCardUsd: string;
  refundsCount: number;
  refundedReceipts?: { receiptNumber: number; amountTjs: string; amountUsd: string; reason?: string }[];
  collectionsCashTjs: string;
  collectionsCashUsd: string;
  collectionsCount: number;
  otherCashTjs: string;
  otherCashUsd: string;
  otherCount: number;
  expectedCashTjs: string;
  expectedCashUsd: string;
}

export interface CreateDailyClosingInput {
  storeId: string;
  businessDate?: string;
  // Omitted: the seller/partner confirms the day as calculated (actual = expected). Sent: a
  // counted amount, and any difference is recorded and reported to the admin.
  actualCashTjs?: MoneyInput | null;
  comment?: string;
}

/** USD equivalent of a TJS amount at the record's own snapshotted rate. */
function usdAt(tjs: Money, rate: MoneyInput | null | undefined): Money {
  return rate && D(rate).gt(0) ? tjs.div(rate) : D(0);
}

/**
 * Every USD figure on a closing is the dollar amount the register booked for that record, at
 * the record's own day's rate. A counted discrepancy is valued at the closing day's rate.
 */
async function rateForBusinessDate(db: Db, businessDate: string, strict: boolean): Promise<Money | null> {
  const exact = await db.exchangeRate.findUnique({ where: { date: businessDate } });
  if (exact?.rate && D(exact.rate).gt(0)) return D(exact.rate);
  const earlier = await db.exchangeRate.findFirst({ where: { date: { lte: businessDate } }, orderBy: { date: 'desc' } });
  if (earlier?.rate && D(earlier.rate).gt(0)) return D(earlier.rate);
  // A closing books its counted difference at that day's rate, never at a later day's.
  if (strict) {
    throw new Error(`Сначала задайте курс USD/TJS на ${businessDate}`);
  }
  // Only for showing a summary: a later rate when no earlier one exists.
  const latest = await db.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
  return latest?.rate && D(latest.rate).gt(0) ? D(latest.rate) : null;
}

type ExchangeSettlement = { cashAmountTjs: MoneyInput | null; cardAmountTjs: MoneyInput | null; paymentMethod: string | null; differenceTjs: MoneyInput };

// Exchanges made before the split columns existed fall back to the payment method.
const exchangeCash = (ev: ExchangeSettlement) =>
  ev.cashAmountTjs !== null ? D(ev.cashAmountTjs) : ev.paymentMethod === 'CARD' ? D(0) : D(ev.differenceTjs);
const exchangeCard = (ev: ExchangeSettlement) =>
  ev.cardAmountTjs !== null ? D(ev.cardAmountTjs) : ev.paymentMethod === 'CARD' ? D(ev.differenceTjs) : D(0);

export class DailyClosingService {
  /**
   * Calculates the expected cash and all breakdown figures for a store on a given business day.
   * `db` lets closeDay compute the summary inside its own transaction.
   */
  public static async getSummary(
    storeId: string,
    businessDateInput?: string,
    db: Db = prisma,
    closingRate?: Money,
    recompute = false,
    excludeShortageExpenseId?: string | null,
  ): Promise<DailyClosingSummary> {
    const businessDate = businessDateInput || getBusinessDateKey();
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, isMainWarehouse: true, active: true },
    });
    if (!store) {
      throw Object.assign(new Error('Магазин не найден'), { statusCode: 404 });
    }
    if (store.isMainWarehouse) {
      throw Object.assign(new Error('Центральная касса не имеет розничных смен: закрытие смены применимо только к магазинам'), { statusCode: 400 });
    }

    // 1. Check if already closed
    const existing = recompute ? null : await db.dailyCashClosing.findUnique({
      where: {
        storeId_businessDate: { storeId, businessDate },
      },
    });

    if (existing) {
      // Old snapshots predate refund channel columns. Resolve those from the original
      // business day's records, never by dividing a bank amount by today's rate.
      const source = existing.refundsCardTjs == null || existing.refundsCardUsd == null
        ? await DailyClosingService.getSummary(storeId, businessDate, db, closingRate, true)
        : undefined;
      const closing = { ...existing, refundsCardTjs: D(existing.refundsCardTjs ?? source?.refundsCardTjs ?? 0),
        refundsCardUsd: D(existing.refundsCardUsd ?? source?.refundsCardUsd ?? 0) };
      return {
        storeId: store.id,
        storeName: store.name,
        businessDate,
        alreadyClosed: true,
        closing,
        openingCashTjs: existing.openingCashTjs.toString(),
        openingCashUsd: existing.openingCashUsd.toString(),
        salesCashTjs: existing.salesCashTjs.toString(),
        salesCashUsd: existing.salesCashUsd.toString(),
        salesCardTjs: existing.salesCardTjs.toString(),
        salesCardUsd: existing.salesCardUsd?.toString() ?? null,
        salesCount: 0,
        expensesCashTjs: existing.expensesCashTjs.toString(),
        expensesCashUsd: existing.expensesCashUsd.toString(),
        expensesCount: 0,
        refundsCashTjs: existing.refundsCashTjs.toString(),
        refundsCashUsd: existing.refundsCashUsd.toString(),
        refundsCardTjs: closing.refundsCardTjs.toString(),
        refundsCardUsd: closing.refundsCardUsd.toString(),
        refundedReceipts: source?.refundedReceipts,
        refundsCount: 0,
        collectionsCashTjs: existing.collectionsCashTjs.toString(),
        collectionsCashUsd: existing.collectionsCashUsd.toString(),
        collectionsCount: 0,
        otherCashTjs: existing.otherCashTjs.toString(),
        otherCashUsd: existing.otherCashUsd.toString(),
        otherCount: 0,
        expectedCashTjs: existing.expectedCashTjs.toString(),
        expectedCashUsd: existing.expectedCashUsd.toString(),
      };
    }

    // 2. A day stands on its own: it starts from 0, and its total is the money the register took
    // in that day — sales (cash and bank), exchange settlements and debt repayments, less refunds
    // and expenses paid from this register. Collections are not part of a day: they gather the
    // totals of closed days. Every USD figure is the dollar amount the register itself booked.
    const dateRange = dateRangeForCustomDates(businessDate, businessDate);
    const dayRate = closingRate ?? (await rateForBusinessDate(db, businessDate, false));

    // 2a. Sales rung up today, whatever their status now: a sale refunded later still brought its
    // money in that day, and the refund is counted on its own day. An exchange adds its settlement
    // to the sale's cash/card columns, so that part is taken back out here and counted on the day
    // the exchange happened (2b).
    const sales = await db.sale.findMany({
      where: { storeId, createdAt: dateRange, annulledAt: null },
      select: {
        id: true,
        cashAmountTjs: true,
        cardAmountTjs: true,
        exchangeRate: true,
        totalUsd: true,
        exchangeTradeInCreditUsd: true,
        exchangeEvents: { select: { cashAmountTjs: true, cardAmountTjs: true, paymentMethod: true, differenceTjs: true } },
      },
    });

    let salesCashTjs = D(0);
    let salesCardTjs = D(0);
    let salesCashUsd = D(0);
    let salesCardUsd = D(0);
    for (const s of sales) {
      const cashTjs = s.exchangeEvents.reduce((sum, ev) => sum.minus(exchangeCash(ev)), D(s.cashAmountTjs || 0));
      const cardTjs = s.exchangeEvents.reduce((sum, ev) => sum.minus(exchangeCard(ev)), D(s.cardAmountTjs || 0));
      // The register booked the paid part as one amount at the sale's rate; cash is converted on
      // its own and bank is the rest, so the two add up to exactly what the register received.
      // A receipt opened by an exchange: the returned phone's credit paid part of it, and the
      // register took the receipt's dollars minus the credit's own dollars.
      const paidUsd = s.exchangeTradeInCreditUsd != null
        ? roundMoney(D(s.totalUsd).minus(s.exchangeTradeInCreditUsd))
        : roundMoney(usdAt(cashTjs.plus(cardTjs), s.exchangeRate));
      const paidTjs = cashTjs.plus(cardTjs);
      const cashUsd = s.exchangeTradeInCreditUsd != null
        ? (paidTjs.isZero() ? D(0) : roundMoney(paidUsd.mul(cashTjs).div(paidTjs)))
        : roundMoney(usdAt(cashTjs, s.exchangeRate));
      salesCashTjs = salesCashTjs.plus(cashTjs);
      salesCardTjs = salesCardTjs.plus(cardTjs);
      salesCashUsd = salesCashUsd.plus(cashUsd);
      salesCardUsd = salesCardUsd.plus(paidUsd.minus(cashUsd));
    }

    // 2b. Exchange settlements made today (negative when the customer was paid out). The register
    // moved by the new price minus the trade-in credit, each in dollars at the exchange's rate.
    const exchanges = await db.exchangeEvent.findMany({
      where: { date: dateRange, sale: { storeId, annulledAt: null } },
      select: { cashAmountTjs: true, cardAmountTjs: true, paymentMethod: true, differenceTjs: true, newPriceUsd: true, exchangeInValueUsd: true },
    });
    for (const ev of exchanges) {
      const cashTjs = exchangeCash(ev);
      const cardTjs = exchangeCard(ev);
      const diffTjs = D(ev.differenceTjs);
      const diffUsd = diffTjs.isZero() ? D(0) : D(ev.newPriceUsd).minus(ev.exchangeInValueUsd);
      const cashUsd = diffTjs.isZero() ? D(0) : roundMoney(diffUsd.mul(cashTjs).div(diffTjs));
      salesCashTjs = salesCashTjs.plus(cashTjs);
      salesCardTjs = salesCardTjs.plus(cardTjs);
      salesCashUsd = salesCashUsd.plus(cashUsd);
      salesCardUsd = salesCardUsd.plus(diffUsd.minus(cashUsd));
    }

    // 2c. Money handed back today, read from the register's own postings: every refund paid from it
    // (a whole receipt or chosen goods), at the somoni and dollars it booked, less every cancelled
    // refund brought back today. A refund stays on the day it was paid and its cancellation counts
    // on its own day, so each day matches its drawer even when the two days differ. Postings an
    // annulment reversed are left out together with their reversal.
    const cashAccount = await db.financialAccount.findUnique({ where: { storeId }, select: { id: true } });
    const refundRows = cashAccount
      ? await db.financialTransaction.findMany({
          where: {
            accountId: cashAccount.id, transactionDate: dateRange, status: 'POSTED', reversedTransactionId: null,
            OR: [
              { type: 'REFUND', direction: 'OUT', sourceType: 'SALE' },
              { sourceType: REFUND_CANCEL_SOURCE, direction: 'IN' },
            ],
          },
          orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
          select: { sourceType: true, sourceId: true, amountTjs: true, amountUsd: true, description: true },
        })
      : [];
    const refundSales = new Map((await db.sale.findMany({
      where: { id: { in: refundRows.filter((row) => row.sourceType === 'SALE' && row.sourceId).map((row) => row.sourceId!) } },
      select: { id: true, receiptNumber: true },
    })).map((sale) => [sale.id, sale.receiptNumber]));
    let refundsCashTjs = D(0);
    let refundsCashUsd = D(0);
    let refundsCardTjs = D(0);
    let refundsCardUsd = D(0);
    let refundsCount = 0;
    const refundedReceipts: { receiptNumber: number; amountTjs: string; amountUsd: string; reason?: string }[] = [];
    for (const row of refundRows) {
      const cancel = row.sourceType === REFUND_CANCEL_SOURCE;
      const sign = cancel ? -1 : 1;
      const amountTjs = D(row.amountTjs).mul(sign);
      const amountUsd = D(row.amountUsd).mul(sign);
      refundsCashTjs = refundsCashTjs.plus(amountTjs);
      refundsCashUsd = refundsCashUsd.plus(amountUsd);
      if (isCardRefund(row.description)) {
        refundsCardTjs = refundsCardTjs.plus(amountTjs);
        refundsCardUsd = refundsCardUsd.plus(amountUsd);
      }
      if (!cancel) refundsCount++;
      const parsed = REFUND_DESCRIPTION.exec(row.description);
      refundedReceipts.push({
        receiptNumber: (row.sourceId && refundSales.get(row.sourceId)) || Number(parsed?.[1] ?? 0),
        amountTjs: roundMoney(amountTjs).toString(),
        amountUsd: roundMoney(amountUsd).toString(),
        reason: parsed?.[2] ? `${cancel ? 'отмена возврата: ' : ''}${parsed[2]}` : cancel ? 'отмена возврата' : undefined,
      });
    }

    // 2c'. Full refunds made before refunds were posted to the register: the refund day's rate.
    const legacyRefunds = await db.sale.findMany({
      where: { storeId, annulledAt: null, refundedAt: dateRange, status: 'REFUNDED', returns: { none: {} }, actualRefundAmountTjs: { gt: 0 } },
      select: { id: true, receiptNumber: true, actualRefundAmountTjs: true, penaltyFeeTjs: true, penaltyFeeUsd: true, refundReason: true },
    });
    const postedRefunds = legacyRefunds.length
      ? new Set((await db.financialTransaction.findMany({
          where: { type: 'REFUND', sourceType: 'SALE', sourceId: { in: legacyRefunds.map((r) => r.id) } },
          select: { sourceId: true },
        })).map((row) => row.sourceId))
      : new Set<string | null>();
    for (const r of legacyRefunds.filter((sale) => !postedRefunds.has(sale.id))) {
      const refundTjs = D(r.actualRefundAmountTjs ?? 0);
      const refundUsd = roundMoney(usdAt(refundTjs.plus(r.penaltyFeeTjs ?? 0), dayRate)).minus(r.penaltyFeeUsd ?? 0);
      refundsCashTjs = refundsCashTjs.plus(refundTjs);
      refundsCashUsd = refundsCashUsd.plus(refundUsd);
      refundsCount++;
      refundedReceipts.push({
        receiptNumber: r.receiptNumber,
        amountTjs: roundMoney(refundTjs).toString(),
        amountUsd: roundMoney(refundUsd).toString(),
        reason: r.refundReason ?? undefined,
      });
    }

    // 2d. Expenses that actually left THIS register (a partner's paid store expense, or one the
    // admin paid from it). Read from the register's own ledger, not from Expense.storeId: unpaid
    // expenses and salaries are paid from Central Cash. A cancellation posts its own reversal (IN).
    const expenseRows = cashAccount
      ? await db.financialTransaction.findMany({
          where: { accountId: cashAccount.id, sourceType: 'EXPENSE', transactionDate: dateRange,
            ...(excludeShortageExpenseId ? { NOT: { sourceId: excludeShortageExpenseId } } : {}),
          },
          select: { direction: true, amountTjs: true, amountUsd: true },
        })
      : [];
    let expensesCashTjs = D(0);
    let expensesCashUsd = D(0);
    for (const row of expenseRows) {
      const sign = row.direction === 'IN' ? -1 : 1;
      expensesCashTjs = expensesCashTjs.plus(D(row.amountTjs).mul(sign));
      expensesCashUsd = expensesCashUsd.plus(D(row.amountUsd).mul(sign));
    }
    const expensesCount = expenseRows.filter((row) => row.direction !== 'IN').length;

    // 2e. Customer debt repaid at this register today, plus older register moves (supplier
    // payments, capital moves made before they went to Central Cash) on their own date.
    let otherCashTjs = D(0);
    let otherCashUsd = D(0);
    const customerPayments = await db.customerPayment.findMany({
      where: { storeId, createdAt: dateRange, sourceAccount: 'STORE_CASH' },
      select: { amountTjs: true, exchangeRate: true },
    });
    for (const p of customerPayments) {
      otherCashTjs = otherCashTjs.plus(p.amountTjs);
      otherCashUsd = otherCashUsd.plus(roundMoney(usdAt(D(p.amountTjs), p.exchangeRate)));
    }
    const ledgerRows = cashAccount
      ? await db.financialTransaction.findMany({
          where: {
            transactionDate: dateRange,
            sourceType: { in: OTHER_LEDGER_SOURCES },
            OR: [{ accountId: cashAccount.id }, { destinationAccountId: cashAccount.id }],
          },
          select: { destinationAccountId: true, direction: true, amountTjs: true, amountUsd: true },
        })
      : [];
    for (const row of ledgerRows) {
      // Money comes in when the register is a transfer's destination or the row is an IN;
      // it goes out on an OUT or when the register is a transfer's source.
      const sign = row.destinationAccountId === cashAccount!.id || row.direction === 'IN' ? 1 : -1;
      otherCashTjs = otherCashTjs.plus(D(row.amountTjs).mul(sign));
      otherCashUsd = otherCashUsd.plus(D(row.amountUsd).mul(sign));
    }

    // 3. The day's total: everything the register took in that day, cash and bank together.
    const expectedCashTjs = roundMoney(salesCashTjs.plus(salesCardTjs).plus(otherCashTjs).minus(refundsCashTjs).minus(expensesCashTjs));
    const expectedCashUsd = roundMoney(salesCashUsd.plus(salesCardUsd).plus(otherCashUsd).minus(refundsCashUsd).minus(expensesCashUsd));

    return {
      storeId: store.id,
      storeName: store.name,
      businessDate,
      alreadyClosed: false,
      openingCashTjs: '0',
      openingCashUsd: '0',
      salesCashTjs: roundMoney(salesCashTjs).toString(),
      salesCashUsd: roundMoney(salesCashUsd).toString(),
      salesCardTjs: roundMoney(salesCardTjs).toString(),
      salesCardUsd: roundMoney(salesCardUsd).toString(),
      salesCount: sales.length,
      expensesCashTjs: roundMoney(expensesCashTjs).toString(),
      expensesCashUsd: roundMoney(expensesCashUsd).toString(),
      expensesCount,
      refundsCashTjs: roundMoney(refundsCashTjs).toString(),
      refundsCashUsd: roundMoney(refundsCashUsd).toString(),
      refundsCardTjs: roundMoney(refundsCardTjs).toString(),
      refundsCardUsd: roundMoney(refundsCardUsd).toString(),
      refundsCount,
      refundedReceipts,
      collectionsCashTjs: '0',
      collectionsCashUsd: '0',
      collectionsCount: 0,
      otherCashTjs: roundMoney(otherCashTjs).toString(),
      otherCashUsd: roundMoney(otherCashUsd).toString(),
      otherCount: customerPayments.length + ledgerRows.length,
      expectedCashTjs: expectedCashTjs.toString(),
      expectedCashUsd: expectedCashUsd.toString(),
    };
  }

  /**
   * Commits the daily cash closing.
   */
  public static async closeDay(userId: string, input: CreateDailyClosingInput) {
    const businessDate = input.businessDate || getBusinessDateKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new Error('Укажите дату смены в формате YYYY-MM-DD');
    }
    if (businessDate > getBusinessDateKey()) {
      throw new Error('Нельзя закрыть смену за будущую дату');
    }
    const counted = input.actualCashTjs !== undefined && input.actualCashTjs !== null && input.actualCashTjs !== ''
      ? roundMoney(D(input.actualCashTjs))
      : null;
    if (counted && counted.lt(0)) {
      throw Object.assign(new Error('Фактический остаток не может быть отрицательным'), { statusCode: 400 });
    }

    return prisma.$transaction(async (tx: TransactionClient) => {
      // Same store-row lock every register operation takes (assertShiftOpen): an operation either
      // commits before the closing counts the day, or sees the closing and is refused.
      await tx.$queryRaw`SELECT id FROM stores WHERE id = ${input.storeId} FOR UPDATE`;
      const actor = await resolveActor(tx, userId);
      const store = await tx.store.findUnique({
        where: { id: input.storeId },
        select: { id: true, name: true, isMainWarehouse: true, active: true },
      });
      if (!store || !store.active) {
        throw Object.assign(new Error('Магазин не найден или не активен'), { statusCode: 404 });
      }
      if (store.isMainWarehouse) {
        throw Object.assign(new Error('Центральная касса не имеет розничных смен: закрытие смены применимо только к магазинам'), { statusCode: 400 });
      }

      // Check if already closed
      const existing = await tx.dailyCashClosing.findUnique({
        where: {
          storeId_businessDate: { storeId: store.id, businessDate },
        },
      });
      if (existing) {
        throw Object.assign(new Error(`Кассовая смена магазина ${store.name} за ${businessDate} уже закрыта.`), { statusCode: 409 });
      }

      const rate = (await rateForBusinessDate(tx, businessDate, true))!;
      const summary = await DailyClosingService.getSummary(store.id, businessDate, tx, rate);

      const actualTjs = counted ?? roundMoney(D(summary.expectedCashTjs));
      const differenceTjs = roundMoney(actualTjs.minus(D(summary.expectedCashTjs)));
      // The discrepancy happened today, so it is valued at today's rate; the actual USD
      // equivalent is the expected book value plus that discrepancy.
      const differenceUsd = roundMoney(differenceTjs.div(rate));
      const actualUsd = roundMoney(D(summary.expectedCashUsd).plus(differenceUsd));

      // The register must hold exactly the somoni that were counted. A shortage is a real loss of
      // the store: it leaves the register as a store expense (CASH_SHORTAGE); a surplus comes in
      // as the store owners' income (below, once the closing row exists). Both are booked in the
      // closed day at that day's rate, so they match the closing to the cent and never land in
      // the next day's shift when a day is closed the morning after.
      const at = closingMoment(businessDate);
      let shortageExpenseId: string | null = null;
      if (differenceTjs.isNegative()) {
        const shortage = await createExpense(tx, {
          category: SHORTAGE_CATEGORY,
          amountTjs: differenceTjs.negated(),
          storeId: store.id,
          targetType: 'STORE',
          paidFromCashRegister: true,
          createdByUserId: actor.id,
          comment: `Недостача при закрытии смены ${businessDate}${input.comment?.trim() ? `: ${input.comment.trim()}` : ''}`,
        }, { rate, at });
        shortageExpenseId = shortage.id;
      }

      const closing = await tx.dailyCashClosing.create({
        data: {
          storeId: store.id,
          businessDate,
          closedByUserId: actor.id,
          closedByName: actor.name,
          openingCashTjs: summary.openingCashTjs,
          openingCashUsd: summary.openingCashUsd,
          salesCashTjs: summary.salesCashTjs,
          salesCashUsd: summary.salesCashUsd,
          salesCardTjs: summary.salesCardTjs,
          salesCardUsd: summary.salesCardUsd,
          expensesCashTjs: summary.expensesCashTjs,
          expensesCashUsd: summary.expensesCashUsd,
          refundsCashTjs: summary.refundsCashTjs,
          refundsCashUsd: summary.refundsCashUsd,
          refundsCardTjs: summary.refundsCardTjs,
          refundsCardUsd: summary.refundsCardUsd,
          collectionsCashTjs: summary.collectionsCashTjs,
          collectionsCashUsd: summary.collectionsCashUsd,
          otherCashTjs: summary.otherCashTjs,
          otherCashUsd: summary.otherCashUsd,
          expectedCashTjs: summary.expectedCashTjs,
          expectedCashUsd: summary.expectedCashUsd,
          actualCashTjs: actualTjs.toString(),
          actualCashUsd: actualUsd.toString(),
          differenceTjs: differenceTjs.toString(),
          differenceUsd: differenceUsd.toString(),
          exchangeRate: rate,
          comment: input.comment?.trim() || null,
          shortageExpenseId,
        },
      });

      if (differenceTjs.gt(0)) {
        const surplusAllocations = await currentOwnerAllocations(tx, differenceUsd, store.id);
        await tx.store.update({ where: { id: store.id }, data: { cashBalanceUsd: { increment: differenceUsd } } });
        const cashAccount = await getStoreCashAccount(tx, store.id, store.name);
        await postTransaction(tx, {
          type: 'INCOME',
          direction: 'IN',
          numberPrefix: 'CR',
          accountId: cashAccount.id,
          balanceCurrency: 'USD',
          amount: differenceTjs,
          currency: 'TJS',
          exchangeRate: rate,
          amountTjs: differenceTjs,
          amountUsd: differenceUsd,
          categoryName: 'Излишек кассы',
          shopId: store.id,
          sourceType: SURPLUS_SOURCE,
          sourceId: closing.id,
          description: `Излишек при закрытии смены ${businessDate}${input.comment?.trim() ? `: ${input.comment.trim()}` : ''}`,
          createdByUserId: actor.id,
          transactionDate: at,
        });
        await replaceOwnerAllocations(tx, [], surplusAllocations, 1);
        await tx.dailyCashClosing.update({ where: { id: closing.id }, data: { surplusOwnerAllocations: moneyJson(surplusAllocations) } });
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          storeName: store.name,
          action: 'DAILY_CASH_CLOSING',
          targetId: closing.id,
          details: `Закрытие смены за ${businessDate}: ожидалось ${summary.expectedCashTjs} TJS, факт ${actualTjs} TJS, расхождение ${differenceTjs} TJS (≈ $${differenceUsd} по курсу ${rate}). ${input.comment ? `Комментарий: ${input.comment}` : ''}`,
          financialDetails: {
            closingId: closing.id,
            storeId: store.id,
            businessDate,
            exchangeRate: rate.toString(),
            expectedCashTjs: summary.expectedCashTjs,
            expectedCashUsd: summary.expectedCashUsd,
            actualCashTjs: actualTjs.toString(),
            actualCashUsd: actualUsd.toString(),
            differenceTjs: differenceTjs.toString(),
            differenceUsd: differenceUsd.toString(),
          },
        },
      });

      // Realtime notification to admins if there is a shortage or discrepancy
      const hasDiscrepancy = !differenceTjs.isZero();
      const statusTitle = differenceTjs.isNegative()
        ? `⚠️ Недостача в кассе: ${store.name}`
        : differenceTjs.gt(0)
        ? `ℹ️ Излишек в кассе: ${store.name}`
        : `Кассовая смена закрыта: ${store.name}`;

      const statusMsg = hasDiscrepancy
        ? `${actor.name} закрыл день ${businessDate}. Факт: ${actualTjs} TJS. Расхождение: ${differenceTjs} TJS (≈ $${differenceUsd}).${input.comment ? ` Примечание: «${input.comment}»` : ''}`
        : `${actor.name} закрыл день ${businessDate}. Итог: ${actualTjs} TJS. Наличные: ${actualTjs.minus(D(summary.salesCardTjs).minus(summary.refundsCardTjs))} TJS, банк: ${D(summary.salesCardTjs).minus(summary.refundsCardTjs)} TJS.`;

      await notifyAdmins(tx, {
        actionType: 'DAILY_CASH_CLOSING',
        title: statusTitle,
        message: statusMsg,
        dedupeKey: `DAILY_CASH_CLOSING:${closing.id}`,
        store: { id: store.id, name: store.name },
        actor: { id: actor.id, name: actor.name },
        amountTjs: differenceTjs.abs().toString(),
        amountUsd: differenceUsd.abs().toString(),
        documentRef: `Z-${businessDate}-${store.name}`,
        targetType: 'DAILY_CLOSING',
        targetId: closing.id,
        targetRoute: '/finance',
        details: {
          closingId: closing.id,
          hasDiscrepancy,
          differenceTjs: differenceTjs.toString(),
          differenceUsd: differenceUsd.toString(),
        },
      });

      onCommit(() => {
        RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
        RealtimeSyncGateway.broadcast('FINANCE_UPDATED', {});
      });

      return closing;
    });
  }

  /**
   * Annulment removes its flows from their original days. Refresh saved closings atomically
   * with that correction, preserving the discrepancy already booked for each counted day.
   */
  public static async refreshClosedDays(db: Db, days: { storeId: string; businessDate: string }[]) {
    const changes: { before: DailyCashClosing; after: DailyCashClosing }[] = [];
    for (const day of new Map(days.map((day) => [`${day.storeId}:${day.businessDate}`, day])).values()) {
      const closing = await db.dailyCashClosing.findUnique({ where: { storeId_businessDate: day } });
      if (!closing) continue;
      const summary = await DailyClosingService.getSummary(day.storeId, day.businessDate, db,
        closing.exchangeRate ? D(closing.exchangeRate) : undefined, true, closing.shortageExpenseId);
      const legacy = closing.salesCardUsd == null;
      const expectedTjs = D(summary.expectedCashTjs)
        .plus(legacy ? closing.openingCashTjs : 0)
        .minus(legacy ? D(summary.salesCardTjs).minus(summary.refundsCardTjs) : 0)
        .minus(legacy ? closing.collectionsCashTjs : 0);
      const expectedUsd = D(summary.expectedCashUsd)
        .plus(legacy ? closing.openingCashUsd : 0)
        .minus(legacy ? D(summary.salesCardUsd ?? 0).minus(summary.refundsCardUsd) : 0)
        .minus(legacy ? closing.collectionsCashUsd : 0);
      const after = await db.dailyCashClosing.update({ where: { id: closing.id }, data: {
        salesCashTjs: summary.salesCashTjs, salesCashUsd: summary.salesCashUsd,
        salesCardTjs: summary.salesCardTjs, salesCardUsd: legacy ? null : summary.salesCardUsd,
        expensesCashTjs: summary.expensesCashTjs, expensesCashUsd: summary.expensesCashUsd,
        refundsCashTjs: summary.refundsCashTjs, refundsCashUsd: summary.refundsCashUsd,
        refundsCardTjs: summary.refundsCardTjs, refundsCardUsd: summary.refundsCardUsd,
        otherCashTjs: summary.otherCashTjs, otherCashUsd: summary.otherCashUsd,
        expectedCashTjs: roundMoney(expectedTjs), expectedCashUsd: roundMoney(expectedUsd),
        actualCashTjs: roundMoney(expectedTjs.plus(closing.differenceTjs)),
        actualCashUsd: roundMoney(expectedUsd.plus(closing.differenceUsd)),
      } });
      changes.push({ before: closing, after });
    }
    return changes;
  }

  /**
   * Retrieves closing records with optional filters.
   */
  public static async list(filter: {
    storeId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) {
    const where: Prisma.DailyCashClosingWhereInput = {};
    if (filter.storeId && filter.storeId !== 'all') {
      where.storeId = filter.storeId;
    }
    if (filter.startDate || filter.endDate) {
      where.businessDate = {
        ...(filter.startDate ? { gte: filter.startDate } : {}),
        ...(filter.endDate ? { lte: filter.endDate } : {}),
      };
    }

    const rows = await prisma.dailyCashClosing.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit || 100,
      include: {
        store: {
          select: { id: true, name: true },
        },
      },
    });
    return Promise.all(rows.map(async (closing) => {
      if (closing.refundsCardTjs != null && closing.refundsCardUsd != null) return closing;
      const source = await DailyClosingService.getSummary(closing.storeId, closing.businessDate, prisma, undefined, true);
      return { ...closing, refundsCardTjs: D(source.refundsCardTjs), refundsCardUsd: D(source.refundsCardUsd) };
    }));
  }

  /**
   * Deletes / re-opens a closing record (ADMIN only).
   */
  public static async delete(id: string, actorUserId: string) {
    return prisma.$transaction(async (tx: TransactionClient) => {
      const actor = await resolveActor(tx, actorUserId);
      const closing = await tx.dailyCashClosing.findUnique({
        where: { id },
        include: { store: { select: { id: true, name: true } } },
      });
      if (!closing) {
        throw Object.assign(new Error('Запись закрытия смены не найдена'), { statusCode: 404 });
      }

      // A collected day stays closed: its money already went to Central Cash, and closing it again
      // would put it into the next collection a second time. Cancelling that collection first
      // (which returns the money to the store) makes the day reopenable again.
      await tx.$queryRaw`SELECT id FROM stores WHERE id = ${closing.storeId} FOR UPDATE`;
      const collected = await tx.cashHandover.findFirst({
        where: { storeId: closing.storeId, cancelledAt: null, createdAt: { gt: closing.createdAt } },
        select: { id: true, createdAt: true },
      });
      if (collected) {
        throw Object.assign(
          new Error(`Смену за ${closing.businessDate} нельзя переоткрыть: по ней уже проведена инкассация. Сначала отмените инкассацию, затем переоткройте смену.`),
          { statusCode: 409 },
        );
      }

      await tx.dailyCashClosing.delete({ where: { id } });
      // The shortage this closing booked goes back into the register, and out of the owners' loss.
      if (closing.shortageExpenseId) await cancelExpenseInTx(tx, closing.shortageExpenseId, actor.id, true);
      // The surplus it put into the register comes out again, and out of the owners' income —
      // both in the reopened day, so that day's figures are as before the closing.
      const surplus = await tx.financialTransaction.findFirst({
        where: { sourceType: SURPLUS_SOURCE, sourceId: closing.id, status: 'POSTED', reversedTransactionId: null },
      });
      if (surplus) {
        await tx.store.update({ where: { id: closing.storeId }, data: { cashBalanceUsd: { decrement: surplus.amountUsd } } });
        await cancelTransaction(tx, surplus.id, actor.id, { keepDate: true });
        await replaceOwnerAllocations(tx, readOwnerAllocations(closing.surplusOwnerAllocations ?? []), [], 1);
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          storeName: closing.store?.name || 'Магазин',
          action: 'DAILY_CASH_CLOSING_REOPENED',
          targetId: closing.id,
          details: `Переоткрыта смена за ${closing.businessDate} магазина «${closing.store?.name}», закрытая ранее (${closing.actualCashTjs} TJS). Запись удалена для повторного закрытия.`,
        },
      });

      onCommit(() => {
        RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: closing.storeId });
        RealtimeSyncGateway.broadcast('FINANCE_UPDATED', {});
      });

      return { success: true, message: 'Смена переоткрыта для редактирования' };
    });
  }
}
