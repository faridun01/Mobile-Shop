import type { DailyCashClosing, Prisma } from '@prisma/client';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { getBusinessDateKey, dateRangeForCustomDates } from '../../common/business-date';
import { roundMoney } from '../../common/money';
import { D, type MoneyInput } from '../../common/decimal';
import { resolveActor } from '../../common/actor';
import { onCommit } from '../../common/after-commit';
import { notifyAdmins } from '../notifications/notification.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

type Db = TransactionClient;
type Money = ReturnType<typeof D>;

// Ledger sources that move the store register's cash and are not already covered by the
// sales / refunds / expenses / customer-payment queries below.
const OTHER_LEDGER_SOURCES = ['OWNER_TRANSACTION', 'SUPPLIER_PAYMENT'];

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
  const latest = await db.exchangeRate.findFirst({ where: { date: { lte: businessDate } }, orderBy: { date: 'desc' } })
    ?? await db.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
  if (latest?.rate && D(latest.rate).gt(0)) return D(latest.rate);
  if (strict) {
    throw new Error(`Сначала задайте курс USD/TJS на ${businessDate}`);
  }
  return null;
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
    const existing = await db.dailyCashClosing.findUnique({
      where: {
        storeId_businessDate: { storeId, businessDate },
      },
    });

    if (existing) {
      return {
        storeId: store.id,
        storeName: store.name,
        businessDate,
        alreadyClosed: true,
        closing: existing,
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
      where: { storeId, createdAt: dateRange },
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
      where: { date: dateRange, sale: { storeId } },
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

    // 2c. Refunds made today: the customer gets back the somoni they paid, less the penalty; in
    // dollars that is the refund day's rate (the penalty is booked in dollars at the same rate).
    const refunds = await db.sale.findMany({
      // A receipt whose phones were returned one by one is counted through those returns (2c').
      where: { storeId, refundedAt: dateRange, status: 'REFUNDED', returns: { none: {} } },
      select: { id: true, receiptNumber: true, actualRefundAmountTjs: true, penaltyFeeTjs: true, penaltyFeeUsd: true, refundReason: true },
    });
    let refundsCashTjs = D(0);
    let refundsCashUsd = D(0);
    const refundedReceipts: { receiptNumber: number; amountTjs: string; amountUsd: string; reason?: string }[] = [];
    for (const r of refunds) {
      const refundTjs = D(r.actualRefundAmountTjs ?? 0);
      if (refundTjs.isZero()) continue;
      const collectedTjs = refundTjs.plus(r.penaltyFeeTjs ?? 0);
      refundsCashTjs = refundsCashTjs.plus(refundTjs);
      const refundUsd = roundMoney(usdAt(collectedTjs, dayRate)).minus(r.penaltyFeeUsd ?? 0);
      refundsCashUsd = refundsCashUsd.plus(refundUsd);
      refundedReceipts.push({
        receiptNumber: r.receiptNumber,
        amountTjs: roundMoney(refundTjs).toString(),
        amountUsd: roundMoney(refundUsd).toString(),
        reason: r.refundReason ?? undefined,
      });
    }

    // 2c'. Phones returned today: only the money handed back left the register — an exchange's
    // credit paid for its new receipt instead (counted with that sale above).
    const returns = await db.saleReturn.findMany({
      where: { storeId, createdAt: dateRange, payoutTjs: { gt: 0 } },
      select: { payoutTjs: true, payoutUsd: true, reason: true, sale: { select: { receiptNumber: true } } },
    });
    for (const r of returns) {
      refundsCashTjs = refundsCashTjs.plus(r.payoutTjs);
      refundsCashUsd = refundsCashUsd.plus(r.payoutUsd);
      refundedReceipts.push({
        receiptNumber: r.sale.receiptNumber,
        amountTjs: roundMoney(r.payoutTjs).toString(),
        amountUsd: roundMoney(r.payoutUsd).toString(),
        reason: r.reason,
      });
    }

    // 2d. Expenses that actually left THIS register (a partner's paid store expense, or one the
    // admin paid from it). Read from the register's own ledger, not from Expense.storeId: unpaid
    // expenses and salaries are paid from Central Cash. A cancellation posts its own reversal (IN).
    const cashAccount = await db.financialAccount.findUnique({ where: { storeId }, select: { id: true } });
    const expenseRows = cashAccount
      ? await db.financialTransaction.findMany({
          where: { accountId: cashAccount.id, sourceType: 'EXPENSE', transactionDate: dateRange },
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
      refundsCount: refunds.length,
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
        },
      });

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
        : `${actor.name} закрыл день ${businessDate}. Наличные: ${actualTjs} TJS, банк: ${summary.salesCardTjs} TJS.`;

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

    return prisma.dailyCashClosing.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit || 100,
      include: {
        store: {
          select: { id: true, name: true },
        },
      },
    });
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
