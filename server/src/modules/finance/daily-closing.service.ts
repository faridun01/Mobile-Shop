import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { getBusinessDateKey, dateRangeForCustomDates } from '../../common/business-date';
import { roundMoney } from '../../common/money';
import { D, type MoneyInput } from '../../common/decimal';
import { resolveActor } from '../../common/actor';
import { onCommit } from '../../common/after-commit';
import { notifyAdmins } from '../notifications/notification.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export interface DailyClosingSummary {
  storeId: string;
  storeName: string;
  businessDate: string;
  alreadyClosed: boolean;
  closing?: any;
  openingCashTjs: string;
  openingCashUsd: string;
  salesCashTjs: string;
  salesCashUsd: string;
  salesCardTjs: string;
  salesCount: number;
  expensesCashTjs: string;
  expensesCashUsd: string;
  expensesCount: number;
  refundsCashTjs: string;
  refundsCashUsd: string;
  refundsCount: number;
  collectionsCashTjs: string;
  collectionsCashUsd: string;
  collectionsCount: number;
  expectedCashTjs: string;
  expectedCashUsd: string;
}

export interface CreateDailyClosingInput {
  storeId: string;
  businessDate?: string;
  actualCashTjs: MoneyInput;
  actualCashUsd: MoneyInput;
  comment?: string;
  initialOpeningCashTjs?: MoneyInput;
  initialOpeningCashUsd?: MoneyInput;
}

export class DailyClosingService {
  /**
   * Calculates the expected cash and all breakdown figures for a store on a given business day.
   */
  public static async getSummary(
    storeId: string,
    businessDateInput?: string,
    initialOpening?: { tjs?: MoneyInput; usd?: MoneyInput }
  ): Promise<DailyClosingSummary> {
    const businessDate = businessDateInput || getBusinessDateKey();
    const store = await prisma.store.findUnique({
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
    const existing = await prisma.dailyCashClosing.findUnique({
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
        expectedCashTjs: existing.expectedCashTjs.toString(),
        expectedCashUsd: existing.expectedCashUsd.toString(),
      };
    }

    // 2. Opening Balance from previous closing (or fallback to initial)
    const prevClosing = await prisma.dailyCashClosing.findFirst({
      where: {
        storeId,
        businessDate: { lt: businessDate },
      },
      orderBy: { businessDate: 'desc' },
    });

    const openingTjs = prevClosing
      ? D(prevClosing.actualCashTjs)
      : initialOpening?.tjs !== undefined
      ? D(initialOpening.tjs)
      : D(0);

    const openingUsd = prevClosing
      ? D(prevClosing.actualCashUsd)
      : initialOpening?.usd !== undefined
      ? D(initialOpening.usd)
      : D(0);

    // 3. Transactions on this businessDate
    const dateRange = dateRangeForCustomDates(businessDate, businessDate);

    // 3a. Sales
    const sales = await prisma.sale.findMany({
      where: {
        storeId,
        createdAt: dateRange,
        status: { in: ['COMPLETED', 'EXCHANGED'] },
      },
      select: {
        id: true,
        cashAmountTjs: true,
        cardAmountTjs: true,
        totalUsd: true,
        exchangeRate: true,
      },
    });

    let salesCashTjs = D(0);
    let salesCardTjs = D(0);
    let salesCashUsd = D(0);
    for (const s of sales) {
      const cashTjs = D(s.cashAmountTjs || 0);
      salesCashTjs = salesCashTjs.plus(cashTjs);
      salesCardTjs = salesCardTjs.plus(D(s.cardAmountTjs || 0));
      if (cashTjs.gt(0) && s.exchangeRate && D(s.exchangeRate).gt(0)) {
        salesCashUsd = salesCashUsd.plus(cashTjs.div(s.exchangeRate));
      }
    }

    // 3b. Refunds
    const refunds = await prisma.sale.findMany({
      where: {
        storeId,
        refundedAt: dateRange,
        status: 'REFUNDED',
      },
      select: {
        id: true,
        cashAmountTjs: true,
        actualRefundAmountTjs: true,
        exchangeRate: true,
      },
    });

    let refundsCashTjs = D(0);
    let refundsCashUsd = D(0);
    for (const r of refunds) {
      const refTjs = D(r.actualRefundAmountTjs ?? r.cashAmountTjs ?? 0);
      refundsCashTjs = refundsCashTjs.plus(refTjs);
      if (refTjs.gt(0) && r.exchangeRate && D(r.exchangeRate).gt(0)) {
        refundsCashUsd = refundsCashUsd.plus(refTjs.div(r.exchangeRate));
      }
    }

    // 3c. Paid store expenses (paid from register)
    const expenses = await prisma.expense.findMany({
      where: {
        storeId,
        createdAt: dateRange,
        status: 'PAID',
        cancelledAt: null,
        paidFromCashRegister: true,
      },
      select: {
        id: true,
        amountTjs: true,
        amountUsd: true,
      },
    });

    let expensesCashTjs = D(0);
    let expensesCashUsd = D(0);
    for (const e of expenses) {
      expensesCashTjs = expensesCashTjs.plus(e.amountTjs || 0);
      expensesCashUsd = expensesCashUsd.plus(e.amountUsd || 0);
    }

    // 3d. Cash collections (инкассация)
    // Any collections on this businessDate, or collections performed between the previous
    // closing and this business day, are accounted for so money handed over to Central Cash
    // is never falsely expected in the retail store's drawer.
    const collectionsWhere: any = {
      storeId,
      cancelledAt: null,
    };
    if (prevClosing) {
      collectionsWhere.OR = [
        { businessDate },
        {
          createdAt: { gt: prevClosing.createdAt },
          businessDate: { lte: businessDate },
        },
      ];
    } else {
      collectionsWhere.businessDate = businessDate;
    }

    const collections = await prisma.cashHandover.findMany({
      where: collectionsWhere,
      select: {
        id: true,
        amountTjs: true,
        amountUsd: true,
      },
    });

    let collectionsCashTjs = D(0);
    let collectionsCashUsd = D(0);
    for (const c of collections) {
      collectionsCashTjs = collectionsCashTjs.plus(D(c.amountTjs || 0));
      collectionsCashUsd = collectionsCashUsd.plus(D(c.amountUsd || 0));
    }

    // 4. Expected Cash Calculation
    // Physical cash in drawer: cannot fall below 0 if collections emptied the register
    // (including any card receipts that were tracked in the register balance).
    const rawExpectedTjs = openingTjs
      .plus(salesCashTjs)
      .minus(refundsCashTjs)
      .minus(expensesCashTjs)
      .minus(collectionsCashTjs);
    const expectedCashTjs = roundMoney(rawExpectedTjs.lt(0) ? D(0) : rawExpectedTjs);

    const rawExpectedUsd = openingUsd
      .plus(salesCashUsd)
      .minus(refundsCashUsd)
      .minus(expensesCashUsd)
      .minus(collectionsCashUsd);
    const expectedCashUsd = roundMoney(rawExpectedUsd.lt(0) ? D(0) : rawExpectedUsd);

    return {
      storeId: store.id,
      storeName: store.name,
      businessDate,
      alreadyClosed: false,
      openingCashTjs: roundMoney(openingTjs).toString(),
      openingCashUsd: roundMoney(openingUsd).toString(),
      salesCashTjs: roundMoney(salesCashTjs).toString(),
      salesCashUsd: roundMoney(salesCashUsd).toString(),
      salesCardTjs: roundMoney(salesCardTjs).toString(),
      salesCount: sales.length,
      expensesCashTjs: roundMoney(expensesCashTjs).toString(),
      expensesCashUsd: roundMoney(expensesCashUsd).toString(),
      expensesCount: expenses.length,
      refundsCashTjs: roundMoney(refundsCashTjs).toString(),
      refundsCashUsd: roundMoney(refundsCashUsd).toString(),
      refundsCount: refunds.length,
      collectionsCashTjs: roundMoney(collectionsCashTjs).toString(),
      collectionsCashUsd: roundMoney(collectionsCashUsd).toString(),
      collectionsCount: collections.length,
      expectedCashTjs: expectedCashTjs.toString(),
      expectedCashUsd: expectedCashUsd.toString(),
    };
  }

  /**
   * Commits the daily cash closing.
   */
  public static async closeDay(userId: string, input: CreateDailyClosingInput) {
    const businessDate = input.businessDate || getBusinessDateKey();
    const actualTjs = roundMoney(D(input.actualCashTjs || 0));
    const actualUsd = roundMoney(D(input.actualCashUsd || 0));

    if (actualTjs.lt(0) || actualUsd.lt(0)) {
      throw Object.assign(new Error('Фактический остаток не может быть отрицательным'), { statusCode: 400 });
    }

    return prisma.$transaction(async (tx: TransactionClient) => {
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
        throw Object.assign(new Error(`Кассовая смена магазина ${store.name} за ${businessDate} уже закрыта`), { statusCode: 409 });
      }

      // Compute summary
      const summary = await DailyClosingService.getSummary(store.id, businessDate, {
        tjs: input.initialOpeningCashTjs,
        usd: input.initialOpeningCashUsd,
      });

      const differenceTjs = roundMoney(actualTjs.minus(D(summary.expectedCashTjs)));
      const differenceUsd = roundMoney(actualUsd.minus(D(summary.expectedCashUsd)));

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
          expensesCashTjs: summary.expensesCashTjs,
          expensesCashUsd: summary.expensesCashUsd,
          refundsCashTjs: summary.refundsCashTjs,
          refundsCashUsd: summary.refundsCashUsd,
          collectionsCashTjs: summary.collectionsCashTjs,
          collectionsCashUsd: summary.collectionsCashUsd,
          expectedCashTjs: summary.expectedCashTjs,
          expectedCashUsd: summary.expectedCashUsd,
          actualCashTjs: actualTjs.toString(),
          actualCashUsd: actualUsd.toString(),
          differenceTjs: differenceTjs.toString(),
          differenceUsd: differenceUsd.toString(),
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
          details: `Закрытие смены за ${businessDate}: ожидалось ${summary.expectedCashTjs} TJS / $${summary.expectedCashUsd}, факт ${actualTjs} TJS / $${actualUsd}, расхождение ${differenceTjs} TJS / $${differenceUsd}. ${input.comment ? `Комментарий: ${input.comment}` : ''}`,
          financialDetails: {
            closingId: closing.id,
            storeId: store.id,
            businessDate,
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
      const hasDiscrepancy = !differenceTjs.isZero() || !differenceUsd.isZero();
      const statusTitle = differenceTjs.isNegative()
        ? `⚠️ Недостача в кассе: ${store.name}`
        : differenceTjs.gt(0)
        ? `ℹ️ Излишек в кассе: ${store.name}`
        : `Кассовая смена закрыта: ${store.name}`;

      const statusMsg = hasDiscrepancy
        ? `${actor.name} закрыл день ${businessDate}. Факт: ${actualTjs} TJS ($${actualUsd}). Расхождение: ${differenceTjs} TJS / $${differenceUsd}.${input.comment ? ` Примечание: «${input.comment}»` : ''}`
        : `${actor.name} закрыл день ${businessDate}. Касса сошлась копейка в копейку: ${actualTjs} TJS / $${actualUsd}.`;

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
    const where: any = {};
    if (filter.storeId && filter.storeId !== 'all') {
      where.storeId = filter.storeId;
    }
    if (filter.startDate || filter.endDate) {
      where.businessDate = {};
      if (filter.startDate) where.businessDate.gte = filter.startDate;
      if (filter.endDate) where.businessDate.lte = filter.endDate;
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

