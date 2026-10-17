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
import { allocationsCostUsd, readAllocations, restoreAllocations, type BatchAllocation } from '../catalog/accessory-stock';

/**
 * The next `count` units of a line to come back, taken from the end of its allocations (the units
 * sold last come back first) after the `alreadyReturned` units that came back before.
 */
function unitsFromEnd(allocations: BatchAllocation[], alreadyReturned: number, count: number): BatchAllocation[] {
  const taken: BatchAllocation[] = [];
  let skip = alreadyReturned;
  let left = count;
  for (const a of [...allocations].reverse()) {
    if (left === 0) break;
    const usable = Math.max(0, a.quantity - skip);
    skip = Math.max(0, skip - a.quantity);
    if (usable === 0) continue;
    const take = Math.min(usable, left);
    taken.push({ ...a, quantity: take });
    left -= take;
  }
  if (left > 0) throw new Error('Распределение аксессуара по партиям не сходится с количеством в чеке');
  return taken;
}

export interface ReturnItemInput {
  saleItemId: string;
  /** The amount kept from this phone's price (удержание), in TJS; 0 or more. */
  withheldTjs: MoneyInput;
}

export interface ReturnAccessoryInput {
  lineId: string;
  quantity: number;
  /** The amount kept from these units' price, in TJS; 0 or more. */
  withheldTjs: MoneyInput;
}

export interface ReturnInput {
  saleId: string;
  items: ReturnItemInput[];
  /** Accessory units returned, by receipt line. */
  accessories?: ReturnAccessoryInput[];
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
    const inputItems = Array.isArray(input.items) ? input.items : [];
    const inputAccessories = Array.isArray(input.accessories) ? input.accessories : [];
    if (inputItems.length === 0 && inputAccessories.length === 0) throw new Error('Выберите товары для возврата');
    const itemIds = inputItems.map((item) => item.saleItemId);
    if (new Set(itemIds).size !== itemIds.length) throw new Error('Один телефон указан для возврата дважды');
    const lineIds = inputAccessories.map((line) => line.lineId);
    if (new Set(lineIds).size !== lineIds.length) throw new Error('Один аксессуар указан для возврата дважды');
    if (input.payoutMethod && !['CASH', 'CARD'].includes(input.payoutMethod)) throw new Error('Некорректный способ возврата денег');

    const actor = await resolveActor(tx, input.userId);
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${input.saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true, accessoryItems: true, exchangeEvents: { select: { id: true } } } });
    if (!sale) throw new Error('Чек не найден');
    if (sale.status === 'REFUNDED') throw new Error('Этот чек уже полностью возвращён');
    if (D(sale.debtAmountTjs).gt(0)) {
      throw new Error('По чеку есть непогашенный долг: оформите возврат всего чека или сначала примите оплату долга');
    }
    if (sale.exchangeEvents.length > 0) {
      throw new Error('По этому чеку был обмен старого образца — оформите возврат всего чека');
    }

    const items = inputItems.map((entry) => {
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
    // Accessory units: their share of the line's price, booked dollars and cost. The units sold
    // last come back first, into their own batches; the last units of a line take exactly what is
    // left of it, so a line returned in parts adds up to the cent.
    const accessories = inputAccessories.map((entry) => {
      const line = (sale.accessoryItems ?? []).find((l) => l.id === entry.lineId);
      if (!line) throw new Error('Аксессуар не найден в этом чеке');
      const remaining = line.quantity - line.returnedQuantity;
      const quantity = Number(entry.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining) {
        throw new Error(`${line.brand} ${line.name}: можно вернуть от 1 до ${remaining} шт.`);
      }
      const last = quantity === remaining;
      const priceTjs = last ? roundMoney(D(line.salePriceTjs).minus(line.returnedPriceTjs)) : roundMoney(D(line.salePriceTjs).mul(quantity).div(line.quantity));
      const priceUsd = last ? roundMoney(D(line.salePriceUsd).minus(line.returnedPriceUsd)) : roundMoney(D(line.salePriceUsd).mul(quantity).div(line.quantity));
      const restore = unitsFromEnd(readAllocations(line.allocations), line.returnedQuantity, quantity);
      const costUsd = last ? roundMoney(D(line.costUsd).minus(line.returnedCostUsd)) : allocationsCostUsd(restore);
      const withheldTjs = requireNonNegativeMoney(entry.withheldTjs ?? 0, 'Удержание');
      if (withheldTjs.gt(priceTjs)) throw new Error(`Удержание за ${line.name} не может быть больше его цены (${priceTjs} TJS)`);
      const priceTodayUsd = roundMoney(priceTjs.div(rate));
      const withheldUsd = roundMoney(withheldTjs.div(rate));
      return {
        line, quantity, priceTjs, priceUsd, costUsd, restore,
        withheldTjs, withheldUsd,
        creditTjs: priceTjs.minus(withheldTjs),
        creditUsd: roundMoney(priceTodayUsd.minus(withheldUsd)),
        fxUsd: roundMoney(priceUsd.minus(priceTodayUsd)),
        bookedProfitUsd: roundMoney(priceUsd.minus(costUsd)),
      };
    });

    type Part = { withheldTjs: MoneyInput; withheldUsd: MoneyInput; creditTjs: MoneyInput; creditUsd: MoneyInput; fxUsd: MoneyInput; bookedUsd: MoneyInput; bookedProfitUsd: MoneyInput };
    const parts: Part[] = [
      ...items.map((x) => ({ ...x, bookedUsd: x.item.salePriceUsd })),
      ...accessories.map((x) => ({ ...x, bookedUsd: x.priceUsd })),
    ];
    const sum = (pick: (x: Part) => MoneyInput) => roundMoney(parts.reduce((acc, x) => acc.plus(pick(x)), D(0)));
    const withheldTjs = sum((x) => x.withheldTjs);
    const withheldUsd = sum((x) => x.withheldUsd);
    const creditTjs = sum((x) => x.creditTjs);
    const creditUsd = sum((x) => x.creditUsd);
    const fxUsd = sum((x) => x.fxUsd);
    const bookedUsd = sum((x) => x.bookedUsd);

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
    // Accessory units go back into the batches they were sold from, at their own cost.
    for (const x of accessories) {
      await restoreAllocations(tx, x.restore);
      await tx.saleAccessoryItem.update({
        where: { id: x.line.id },
        data: {
          returnedQuantity: { increment: x.quantity },
          returnedPriceTjs: { increment: x.priceTjs },
          returnedPriceUsd: { increment: x.priceUsd },
          returnedCostUsd: { increment: x.costUsd },
        },
      });
    }
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
    // The last goods of the receipt — every phone and every accessory unit — take back exactly
    // what is left of the booked profit.
    const accessoryUnitsLeft = (sale.accessoryItems ?? []).reduce((acc, l) => acc + l.quantity - l.returnedQuantity, 0)
      - accessories.reduce((acc, x) => acc + x.quantity, 0);
    const lastPhones = sale.saleItems.filter((i) => i.returnId).length + items.length === sale.saleItems.length && accessoryUnitsLeft === 0;
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
        accessoryLines: accessories.length
          ? moneyJson(accessories.map((x) => ({
              lineId: x.line.id, productId: x.line.productId, name: `${x.line.brand} ${x.line.name}`.trim(), quantity: x.quantity,
              priceTjs: x.priceTjs, priceUsd: x.priceUsd, costUsd: x.costUsd,
              withheldTjs: x.withheldTjs, withheldUsd: x.withheldUsd, creditTjs: x.creditTjs, creditUsd: x.creditUsd,
            })))
          : undefined,
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

    // Every phone and every accessory unit of the receipt returned: the receipt itself is returned,
    // with the totals of all its returns (this one included).
    if (lastPhones) {
      const all = await tx.saleReturn.aggregate({ where: { saleId: sale.id }, _sum: { withheldTjs: true, withheldUsd: true, creditTjs: true } });
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundedByUserId: actor.id,
          refundReason: reason,
          penaltyFeeTjs: roundMoney(all._sum.withheldTjs ?? 0),
          penaltyFeeUsd: roundMoney(all._sum.withheldUsd ?? 0),
          actualRefundAmountTjs: roundMoney(all._sum.creditTjs ?? 0),
        },
      });
    }

    const phones = [
      ...items.map((x) => `${x.item.model} (${x.item.category === 'TABLET' ? 'SN' : 'IMEI'} ${x.item.imei})`),
      ...accessories.map((x) => `${x.line.brand} ${x.line.name} × ${x.quantity}`),
    ].join(', ');
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
          accessories: accessories.map((x) => ({ lineId: x.line.id, quantity: x.quantity, priceTjs: x.priceTjs, priceUsd: x.priceUsd, costUsd: x.costUsd, withheldTjs: x.withheldTjs, creditTjs: x.creditTjs, fxUsd: x.fxUsd, bookedProfitUsd: x.bookedProfitUsd })),
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
