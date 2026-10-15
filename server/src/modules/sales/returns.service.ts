import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireNonNegativeMoney, roundMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { allocateLikeBooked, allocateOwnerProfit, type OwnerProfitAllocation } from './profit';
import { getOwnersForStore } from '../finance/owner-allocations';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';
import { assertShiftOpen } from '../finance/shift-guard';
import { syncStockAlerts } from '../stock-thresholds/stock-alerts';
import { returnOvercollectedBonus } from '../finance/cash-collection.service';

export interface ReturnItemInput {
  saleItemId: string;
  /** The amount kept from this phone's price (удержание), in TJS; 0 or more. */
  withheldTjs: MoneyInput;
}

export interface ReturnInput {
  saleId: string;
  items: ReturnItemInput[];
  reason: string;
  userId: string;
  /** How the money goes back to the customer; not needed when it all goes to an exchange. */
  payoutMethod?: 'CASH' | 'CARD';
  /** First half of an exchange: up to this much of the credit pays for the new receipt. */
  exchangeNewTotalTjs?: Prisma.Decimal;
}

export interface ReturnResult {
  saleReturnId: string;
  storeId: string;
  receiptNumber: number;
  customerId: string | null;
  customerName: string | null;
  creditTjs: Prisma.Decimal;
  creditUsd: Prisma.Decimal;
  /** Part of the credit applied to the exchange receipt (0 for a plain return). */
  appliedTjs: Prisma.Decimal;
  appliedUsd: Prisma.Decimal;
  payoutTjs: Prisma.Decimal;
  payoutUsd: Prisma.Decimal;
}

/**
 * A return of one or more phones from a receipt — on its own, or as the first half of an
 * exchange. Each phone goes back to stock at its own cost, its booked profit is reversed, and the
 * customer gets its price back less the withheld amount; the withheld part (and the difference
 * of today's rate from the sale's) stays with the owners, exactly like a refund penalty.
 */
export class ReturnsService {
  public static async returnItems(input: ReturnInput) {
    return prisma.$transaction(async (tx) => {
      const rate = await requireTodayRate(tx);
      return ReturnsService.returnItemsInTx(tx, input, D(rate));
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async returnItemsInTx(tx: TransactionClient, input: ReturnInput, rate: Prisma.Decimal): Promise<ReturnResult> {
    const reason = input.reason?.trim();
    if (!reason) throw new Error('Укажите причину возврата');
    if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('Выберите телефоны для возврата');
    const itemIds = input.items.map((item) => item.saleItemId);
    if (new Set(itemIds).size !== itemIds.length) throw new Error('Один телефон указан для возврата дважды');
    if (input.payoutMethod && !['CASH', 'CARD'].includes(input.payoutMethod)) throw new Error('Некорректный способ возврата денег');

    const actor = await resolveActor(tx, input.userId);
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${input.saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true, exchangeEvents: { select: { id: true } } } });
    if (!sale) throw new Error('Чек не найден');
    if (sale.status === 'REFUNDED') throw new Error('Этот чек уже полностью возвращён');
    if (D(sale.debtAmountTjs).gt(0)) {
      throw new Error('По чеку есть непогашенный долг: оформите возврат всего чека или сначала примите оплату долга');
    }
    if (sale.exchangeEvents.length > 0) {
      throw new Error('По этому чеку был обмен старого образца — оформите возврат всего чека');
    }

    const items = input.items.map((entry) => {
      const item = sale.saleItems.find((i) => i.id === entry.saleItemId);
      if (!item) throw new Error('Телефон не найден в этом чеке');
      if (item.returnId) throw new Error(`Телефон ${item.model} (IMEI ${item.imei}) уже возвращён`);
      const withheldTjs = requireNonNegativeMoney(entry.withheldTjs ?? 0, 'Удержание');
      if (withheldTjs.gt(item.salePriceTjs)) {
        throw new Error(`Удержание за ${item.model} не может быть больше его цены в чеке (${item.salePriceTjs} TJS)`);
      }
      // Today's dollars of what the customer paid for it, the withheld part, and the credit;
      // the booked dollars minus today's are the owners' exchange-rate result.
      const priceTodayUsd = roundMoney(D(item.salePriceTjs).div(rate));
      const withheldUsd = roundMoney(withheldTjs.div(rate));
      return {
        item,
        withheldTjs,
        withheldUsd,
        creditTjs: D(item.salePriceTjs).minus(withheldTjs),
        creditUsd: roundMoney(priceTodayUsd.minus(withheldUsd)),
        fxUsd: roundMoney(D(item.salePriceUsd).minus(priceTodayUsd)),
        // A free bonus phone's price went to the bonus pool, never to the owners.
        bookedProfitUsd: item.isBonus ? D(0) : roundMoney(D(item.salePriceUsd).minus(item.costBasisUsd)),
      };
    });
    const sum = (pick: (x: (typeof items)[number]) => MoneyInput) => roundMoney(items.reduce((acc, x) => acc.plus(pick(x)), D(0)));
    const withheldTjs = sum((x) => x.withheldTjs);
    const withheldUsd = sum((x) => x.withheldUsd);
    const creditTjs = sum((x) => x.creditTjs);
    const creditUsd = sum((x) => x.creditUsd);
    const fxUsd = sum((x) => x.fxUsd);
    const bookedUsd = sum((x) => x.item.salePriceUsd);

    // An exchange applies the credit to the new receipt; whatever is left over (the new phone is
    // cheaper) goes back to the customer. Applied dollars never exceed the new receipt's own.
    let appliedTjs = D(0);
    let appliedUsd = D(0);
    if (input.exchangeNewTotalTjs) {
      const newTotalUsd = roundMoney(input.exchangeNewTotalTjs.div(rate));
      if (creditTjs.lte(input.exchangeNewTotalTjs)) {
        appliedTjs = creditTjs;
        appliedUsd = creditUsd;
      } else {
        appliedTjs = input.exchangeNewTotalTjs;
        appliedUsd = newTotalUsd;
      }
    }
    const payoutTjs = roundMoney(creditTjs.minus(appliedTjs));
    const payoutUsd = roundMoney(creditUsd.minus(appliedUsd));
    if (payoutUsd.lt(0)) throw new Error('Не удалось рассчитать сумму к выдаче клиенту');
    if (payoutTjs.gt(0) && !input.payoutMethod) throw new Error('Укажите, как вернуть деньги клиенту');

    // Phones go back to the store's stock at their own cost.
    const deviceIds = items.map((x) => x.item.deviceId);
    const restocked = await tx.device.updateMany({
      where: { id: { in: deviceIds }, status: 'SOLD' },
      data: { status: 'STORE_STOCK', storeId: sale.storeId },
    });
    if (restocked.count !== deviceIds.length) throw new Error('Не удалось вернуть телефоны на склад — их состояние изменилось');
    // The return's money and stock belong to today's shift, which must still be open.
    await assertShiftOpen(tx, sale.storeId);
    await syncStockAlerts(tx, [sale.storeId]);

    // A free bonus phone's sale is undone in the bonus pool too.
    for (const x of items.filter((y) => y.item.isBonus)) {
      const entry = await tx.bonusPoolEntry.findFirst({ where: { saleId: sale.id, deviceId: x.item.deviceId } });
      if (entry && entry.status !== 'PENDING') {
        throw new Error(`Бонусный телефон ${x.item.model} уже учтён в закрытом бонусном периоде — его возврат оформляет администратор вручную`);
      }
      if (entry) await tx.bonusPoolEntry.delete({ where: { id: entry.id } });
    }
    // Their money may already be on the Bonus Account (collected before this return): hand it back to the Central Cash.
    if (items.some((y) => y.item.isBonus)) await returnOvercollectedBonus(tx, sale.storeId, actor, `возврат по чеку #${sale.receiptNumber}`);

    // Owners give back the phones' booked profit — with the shares the sale was booked at, however
    // they have changed since; the last phone of the receipt takes back exactly what is left — and
    // keep the withheld part and the rate result, which are new income at today's shares.
    const reversedUsd = sum((x) => x.bookedProfitUsd);
    const incomeUsd = roundMoney(withheldUsd.plus(fxUsd));
    const ownerDeltaUsd = roundMoney(incomeUsd.minus(reversedUsd));
    const owners = await getOwnersForStore(tx, sale.storeId);
    const saleLog = await tx.auditLog.findFirst({ where: { targetId: sale.id, action: { in: ['SALE', 'SALE_BELOW_COST'] } }, select: { financialDetails: true } });
    const saleDetails = (saleLog?.financialDetails ?? {}) as { recognizedProfitUsd?: unknown; ownerProfitAllocations?: unknown };
    const booked: OwnerProfitAllocation[] = Array.isArray(saleDetails.ownerProfitAllocations)
      ? (saleDetails.ownerProfitAllocations as { ownerId: string; amountUsd: number }[]).map((row) => ({ ownerId: row.ownerId, amountUsd: D(row.amountUsd) }))
      : [];
    const earlierReturns = await tx.auditLog.findMany({ where: { targetId: sale.id, action: 'SALE_RETURN' }, select: { financialDetails: true } });
    const reversedBefore = new Map<string, Prisma.Decimal>();
    for (const log of earlierReturns) {
      const rows = (log.financialDetails as { reversedAllocations?: { ownerId: string; amountUsd: number }[] } | null)?.reversedAllocations ?? [];
      for (const row of rows) reversedBefore.set(row.ownerId, (reversedBefore.get(row.ownerId) ?? D(0)).plus(row.amountUsd));
    }
    const lastPhones = sale.saleItems.filter((i) => i.returnId).length + items.length === sale.saleItems.length;
    let reversal: OwnerProfitAllocation[] | null = null;
    if (reversedUsd.isZero()) reversal = [];
    else if (lastPhones && booked.length) reversal = booked.map((row) => ({ ownerId: row.ownerId, amountUsd: roundMoney(D(row.amountUsd).minus(reversedBefore.get(row.ownerId) ?? 0)) }));
    else reversal = allocateLikeBooked(reversedUsd, booked, typeof saleDetails.recognizedProfitUsd === 'number' ? saleDetails.recognizedProfitUsd : 0);
    // A sale booked before allocations were recorded (or with a zero profit to scale by): today's shares.
    if (reversal === null) reversal = allocateOwnerProfit(reversedUsd, owners);
    const deltas = new Map<string, Prisma.Decimal>();
    for (const row of incomeUsd.isZero() ? [] : allocateOwnerProfit(incomeUsd, owners)) deltas.set(row.ownerId, (deltas.get(row.ownerId) ?? D(0)).plus(row.amountUsd));
    for (const row of reversal) deltas.set(row.ownerId, (deltas.get(row.ownerId) ?? D(0)).minus(row.amountUsd));
    const ownerProfitAllocations: OwnerProfitAllocation[] = [...deltas].map(([ownerId, amountUsd]) => ({ ownerId, amountUsd: roundMoney(amountUsd) }));
    for (const { ownerId, amountUsd } of ownerProfitAllocations) {
      if (D(amountUsd).isZero()) continue;
      await tx.owner.update({ where: { id: ownerId }, data: { totalAccruedProfitUsd: { increment: amountUsd }, availableProfitUsd: { increment: amountUsd } } });
    }

    const store = await tx.store.findUniqueOrThrow({ where: { id: sale.storeId } });
    if (payoutTjs.gt(0)) {
      const guard = await tx.store.updateMany({
        where: { id: sale.storeId, cashBalanceUsd: { gte: payoutUsd } },
        data: { cashBalanceUsd: { decrement: payoutUsd } },
      });
      if (guard.count !== 1) throw new Error('В кассе недостаточно средств для возврата денег клиенту');
      const cashAccount = await getStoreCashAccount(tx, sale.storeId, store.name);
      await postTransaction(tx, {
        type: 'REFUND',
        direction: 'OUT',
        numberPrefix: 'RF',
        accountId: cashAccount.id,
        balanceCurrency: 'USD',
        amount: payoutTjs,
        currency: 'TJS',
        exchangeRate: rate,
        amountTjs: payoutTjs,
        amountUsd: payoutUsd,
        categoryName: 'Возврат покупателю',
        shopId: sale.storeId,
        sourceType: 'SALE',
        sourceId: sale.id,
        description: `Возврат по чеку #${sale.receiptNumber} (${input.payoutMethod === 'CARD' ? 'переводом / картой' : 'наличными'}): ${reason}`,
        createdByUserId: actor.id,
      });
      await tx.ledgerEntry.create({
        data: {
          type: 'REFUND',
          description: `Возврат по чеку #${sale.receiptNumber}: ${reason}`,
          amountTjs: payoutTjs.negated(),
          amountUsd: payoutUsd.negated(),
          exchangeRate: rate,
          storeId: sale.storeId,
          storeName: store.name,
          userName: actor.name,
          referenceId: sale.id,
        },
      });
    }

    const saleReturn = await tx.saleReturn.create({
      data: {
        saleId: sale.id,
        storeId: sale.storeId,
        userId: actor.id,
        reason,
        exchangeRate: rate,
        bookedUsd,
        fxUsd,
        withheldTjs,
        withheldUsd,
        creditTjs,
        creditUsd,
        payoutTjs,
        payoutUsd,
        payoutMethod: payoutTjs.gt(0) ? input.payoutMethod ?? null : null,
        ownerProfitAllocations: moneyJson(ownerProfitAllocations),
      },
    });
    for (const x of items) {
      await tx.saleItem.update({
        where: { id: x.item.id },
        data: { returnId: saleReturn.id, returnWithheldTjs: x.withheldTjs, returnWithheldUsd: x.withheldUsd, returnCreditTjs: x.creditTjs, returnCreditUsd: x.creditUsd },
      });
    }
    await tx.deviceTimelineEvent.createMany({
      data: items.map((x) => ({
        deviceId: x.item.deviceId,
        type: 'REFUND' as const,
        description: `Возврат по чеку #${sale.receiptNumber}${x.withheldTjs.gt(0) ? `, удержано ${x.withheldTjs} TJS` : ''}: ${reason}`,
        userName: actor.name,
      })),
    });

    // Every phone of the receipt returned: the receipt itself is returned.
    const returnedBefore = sale.saleItems.filter((i) => i.returnId);
    if (returnedBefore.length + items.length === sale.saleItems.length) {
      const all = [...returnedBefore.map((i) => ({ withheldTjs: D(i.returnWithheldTjs ?? 0), withheldUsd: D(i.returnWithheldUsd ?? 0), creditTjs: D(i.returnCreditTjs ?? 0) })), ...items];
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundedByUserId: actor.id,
          refundReason: reason,
          penaltyFeeTjs: roundMoney(all.reduce((acc, x) => acc.plus(x.withheldTjs), D(0))),
          penaltyFeeUsd: roundMoney(all.reduce((acc, x) => acc.plus(x.withheldUsd), D(0))),
          actualRefundAmountTjs: roundMoney(all.reduce((acc, x) => acc.plus(x.creditTjs), D(0))),
        },
      });
    }

    const phones = items.map((x) => `${x.item.model} (IMEI ${x.item.imei})`).join(', ');
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'SALE_RETURN',
        details: `Чек #${sale.receiptNumber}: возврат ${phones}. Зачёт ${creditTjs} TJS${withheldTjs.gt(0) ? `, удержано ${withheldTjs} TJS` : ''}${payoutTjs.gt(0) ? `, выдано клиенту ${payoutTjs} TJS` : ''}. Причина: ${reason}`,
        financialDetails: moneyJson({
          saleReturnId: saleReturn.id,
          exchangeRate: rate,
          items: items.map((x) => ({ saleItemId: x.item.id, deviceId: x.item.deviceId, withheldTjs: x.withheldTjs, withheldUsd: x.withheldUsd, creditTjs: x.creditTjs, creditUsd: x.creditUsd, fxUsd: x.fxUsd, bookedProfitUsd: x.bookedProfitUsd })),
          withheldTjs, withheldUsd, creditTjs, creditUsd, fxUsd, payoutTjs, payoutUsd,
          profitDeltaUsd: ownerDeltaUsd,
          reversedAllocations: moneyJson(reversal),
          ownerProfitAllocations: moneyJson(ownerProfitAllocations),
        }),
        receiptNumber: sale.receiptNumber,
        targetId: sale.id,
      },
    });

    return {
      saleReturnId: saleReturn.id,
      storeId: sale.storeId,
      receiptNumber: sale.receiptNumber,
      customerId: sale.customerId,
      customerName: sale.customerName,
      creditTjs,
      creditUsd,
      appliedTjs,
      appliedUsd,
      payoutTjs,
      payoutUsd,
    };
  }
}
