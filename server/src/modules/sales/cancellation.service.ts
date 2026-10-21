import { Prisma } from '@prisma/client';
import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { roundMoney } from '../../common/money';
import { resolveActor } from '../../common/actor';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { assertShiftOpen } from '../finance/shift-guard';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';
import { REFUND_CANCEL_SOURCE, isCardRefund } from '../finance/daily-closing.service';
import { syncStockAlerts } from '../stock-thresholds/stock-alerts';
import { readAllocations } from '../catalog/accessory-stock';
import { unitsFromEnd } from './returns.service';
import { RefundService } from './refund.service';

type Allocation = { ownerId: string; amountUsd: MoneyInput };
type AccessoryPart = { lineId: string; quantity: number; priceTjs: number; priceUsd: number; costUsd: number };

import { activeRefundLogs } from './cancellation-audit';
import { calculateRecognizedProfit } from './profit';

async function reverseOwners(tx: TransactionClient, rows: Allocation[]) {
  for (const row of rows) {
    const delta = D(row.amountUsd).negated();
    await tx.owner.update({ where: { id: row.ownerId }, data: {
      totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta },
    } });
  }
}

/** Consume the exact restored batches, never substitute FIFO batches with a different cost. */
async function consumeRestored(tx: TransactionClient, allocations: ReturnType<typeof readAllocations>) {
  for (const a of allocations) {
    await tx.$queryRaw`SELECT id FROM accessory_batches WHERE id = ${a.batchId} FOR UPDATE`;
    const batch = await tx.accessoryBatch.findUniqueOrThrow({ where: { id: a.batchId } });
    if (batch.quantityRemaining - batch.quantityReserved < a.quantity) {
      throw new Error('Возвращённые аксессуары уже проданы или зарезервированы — отмена невозможна');
    }
    await tx.accessoryBatch.update({ where: { id: a.batchId }, data: { quantityRemaining: { decrement: a.quantity } } });
  }
}

async function restoreSoldDevices(tx: TransactionClient, ids: string[], storeId: string, returnedAt: Date, receiptNumber: number) {
  if (!ids.length) return;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM devices WHERE id IN (${Prisma.join([...ids].sort())}) ORDER BY id FOR UPDATE`);
  // Even a phone moved away and back must not silently lose its subsequent operations.
  const subsequent = await tx.deviceTimelineEvent.findFirst({ where: {
    deviceId: { in: ids }, date: { gt: returnedAt },
    NOT: { type: 'REFUND', description: { startsWith: `Возврат по чеку #${receiptNumber}` } },
  } });
  if (subsequent) throw new Error('После возврата с товаром были другие операции — сначала отмените их');
  const updated = await tx.device.updateMany({ where: { id: { in: ids }, storeId, status: 'STORE_STOCK' }, data: { status: 'SOLD' } });
  if (updated.count !== ids.length) throw new Error('Возвращённый товар уже продан, перемещён или находится в ремонте — отмена невозможна');
}

async function restorePayout(tx: TransactionClient, input: {
  saleId: string; storeId: string; receiptNumber: number; amountTjs: MoneyInput; amountUsd: MoneyInput;
  rate: MoneyInput; actor: Awaited<ReturnType<typeof resolveActor>>; reason: string; referenceId: string;
  /** The refund was paid to a card: the money comes back the same way (the shift's bank figure). */
  card: boolean;
}) {
  const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId } });
  if (D(input.amountUsd).gt(0)) {
    const account = await getStoreCashAccount(tx, store.id, store.name);
    await tx.store.update({ where: { id: store.id }, data: { cashBalanceUsd: { increment: input.amountUsd } } });
    await postTransaction(tx, {
      type: 'ADJUSTMENT', direction: 'IN', numberPrefix: 'RC', accountId: account.id, balanceCurrency: 'USD',
      amount: input.amountTjs, currency: 'TJS', exchangeRate: input.rate,
      amountTjs: input.amountTjs, amountUsd: input.amountUsd, shopId: store.id,
      sourceType: REFUND_CANCEL_SOURCE, sourceId: input.referenceId, categoryName: 'Отмена возврата',
      description: `Отмена возврата по чеку #${input.receiptNumber} (${input.card ? 'переводом / картой' : 'наличными'}): ${input.reason}`,
      createdByUserId: input.actor.id,
    });
  }
  await tx.ledgerEntry.create({ data: {
    type: 'REFUND', amountTjs: input.amountTjs, amountUsd: input.amountUsd, exchangeRate: input.rate,
    storeId: store.id, storeName: store.name, userName: input.actor.name, referenceId: input.saleId,
    description: `Отмена возврата по чеку #${input.receiptNumber}: ${input.reason}`,
  } });
}

export class CancellationService {
  static async cancelSale(saleId: string, userId: string, reason: string) {
    if (!reason?.trim()) throw new Error('Укажите причину отмены');
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    return RefundService.refund({ saleId, refundedByUserId: userId, reason: `Отмена продажи: ${reason.trim()}`,
      refundAmountTjs: D(sale.totalTjs).minus(sale.debtAmountTjs), penaltyFeeTjs: 0, paymentMethod: 'CASH', cancelSale: true });
  }

  static async cancelReturn(saleId: string, returnId: string | undefined, userId: string, reason: string) {
    if (!reason?.trim()) throw new Error('Укажите причину отмены');
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`;
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: {
        saleItems: true, accessoryItems: true, exchangeEvents: true, exchangeReturn: true,
        returns: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      } });
      const actor = await resolveActor(tx, userId);
      if (sale.annulledAt) throw new Error('Чек аннулирован — оформите новую продажу');
      await assertShiftOpen(tx, sale.storeId);
      if (sale.exchangeEvents.length || sale.exchangeReturn) throw new Error('Сначала отмените связанные операции обмена');
      const logs = await tx.auditLog.findMany({ where: { targetId: sale.id }, orderBy: { createdAt: 'desc' } });
      if (returnId) {
        const ret = sale.returns.find((row) => row.id === returnId);
        if (!ret) throw new Error('Возврат уже отменён или не найден');
        if (ret.exchangeSaleId) throw new Error('Возврат связан с новым чеком обмена — сначала отмените обмен');
        if (sale.returns[0]?.id !== returnId) throw new Error('Сначала отмените более поздний возврат по этому чеку');
        const items = sale.saleItems.filter((item) => item.returnId === ret.id);
        if (items.some((item) => item.isBonus)) {
          const distributed = await tx.bonusDistributionLog.findFirst({ where: { createdAt: { gte: sale.createdAt } } });
          const collected = await tx.cashHandover.findFirst({ where: { storeId: sale.storeId, cancelledAt: null, createdAt: { gte: sale.createdAt } } });
          if (distributed || collected) throw new Error('Бонус по товару уже обработан — сначала отмените распределение или инкассацию');
        }
        const log = logs.find((row) => row.action === 'SALE_RETURN' && (row.financialDetails as { saleReturnId?: string } | null)?.saleReturnId === ret.id);
        if (!log) throw new Error('Не найдена исходная запись возврата для точной отмены');
        await restoreSoldDevices(tx, items.map((item) => item.deviceId), sale.storeId, ret.createdAt, sale.receiptNumber);
        for (const part of (Array.isArray(ret.accessoryLines) ? ret.accessoryLines : []) as AccessoryPart[]) {
          const line = sale.accessoryItems.find((row) => row.id === part.lineId);
          if (!line || line.returnedQuantity < part.quantity) throw new Error('Количество возвращённых аксессуаров изменилось');
          await consumeRestored(tx, unitsFromEnd(readAllocations(line.allocations), line.returnedQuantity - part.quantity, part.quantity));
          await tx.saleAccessoryItem.update({ where: { id: line.id }, data: {
            returnedQuantity: { decrement: part.quantity }, returnedPriceTjs: { decrement: part.priceTjs },
            returnedPriceUsd: { decrement: part.priceUsd }, returnedCostUsd: { decrement: part.costUsd },
          } });
        }
        await reverseOwners(tx, (ret.ownerProfitAllocations ?? []) as Allocation[]);
        for (const item of items.filter((row) => row.isBonus)) {
          await tx.bonusPoolEntry.create({ data: {
            saleId: sale.id, deviceId: item.deviceId, imei: item.imei, brand: item.brand, model: item.model,
            salePriceTjs: item.salePriceTjs, salePriceUsd: item.salePriceUsd, profitTjs: item.salePriceTjs,
            profitUsd: item.salePriceUsd, status: 'PENDING', createdAt: sale.createdAt,
          } });
        }
        await restorePayout(tx, { saleId, storeId: sale.storeId, receiptNumber: sale.receiptNumber,
          amountTjs: ret.payoutTjs, amountUsd: ret.payoutUsd, rate: ret.exchangeRate, actor, reason, referenceId: ret.id,
          card: ret.payoutMethod === 'CARD' });
        await tx.saleItem.updateMany({ where: { returnId: ret.id }, data: {
          returnId: null, returnWithheldTjs: null, returnWithheldUsd: null, returnCreditTjs: null, returnCreditUsd: null,
        } });
        // The immutable audit snapshot retains the full cancelled operation, while live return
        // aggregates and foreign keys describe only returns still in effect.
        await tx.saleReturn.delete({ where: { id: ret.id } });
        const remaining = await tx.saleReturn.aggregate({ where: { saleId }, _sum: { withheldTjs: true, withheldUsd: true, creditTjs: true } });
        await tx.sale.update({ where: { id: saleId }, data: {
          status: 'COMPLETED', refundedAt: null, refundedByUserId: null, refundReason: null,
          penaltyFeeTjs: remaining._sum.withheldTjs, penaltyFeeUsd: remaining._sum.withheldUsd,
          actualRefundAmountTjs: remaining._sum.creditTjs,
        } });
        await tx.auditLog.create({ data: {
          userId: actor.id, userName: actor.name, userRole: actor.role, action: 'SALE_RETURN_CANCEL', targetId: saleId,
          receiptNumber: sale.receiptNumber, details: `Чек #${sale.receiptNumber}: отменён возврат. Причина: ${reason}`,
          financialDetails: moneyJson({ saleReturnId: ret.id, profitDeltaUsd: D((log.financialDetails as { profitDeltaUsd: number }).profitDeltaUsd).negated(),
            originalReturn: { ...ret, items, sale: { id: saleId, receiptNumber: sale.receiptNumber } },
            reportEvent: {
              storeId: sale.storeId, saleId, receiptNumber: sale.receiptNumber, originalDate: ret.createdAt,
              revenueUsd: D(ret.bookedUsd).minus(ret.fxUsd).negated(),
              revenueTjs: D(ret.creditTjs).plus(ret.withheldTjs).negated(),
              profitUsd: items.reduce((sum, item) => sum.minus(item.salePriceUsd).plus(item.costBasisUsd), D(0))
                .plus(((ret.accessoryLines ?? []) as AccessoryPart[]).reduce((sum, part) => sum.minus(part.priceUsd).plus(part.costUsd), D(0))).plus(ret.fxUsd),
              bonusUsd: items.filter((item) => item.isBonus).reduce((sum, item) => sum.minus(item.salePriceUsd), D(0)),
              rate: ret.exchangeRate, penaltyTjs: ret.withheldTjs, penaltyUsd: ret.withheldUsd, reason: ret.reason,
            },
            ownerProfitAllocations: ((ret.ownerProfitAllocations ?? []) as Allocation[]).map((row) => ({ ...row, amountUsd: D(row.amountUsd).negated() })),
          }),
        } });
      } else {
        if (sale.status !== 'REFUNDED' || sale.returns.length) throw new Error('Выберите конкретный возврат для отмены');
        const log = activeRefundLogs(logs).find((row) => row.action === 'REFUND');
        const details = log?.financialDetails as { isCancellation?: boolean; amountUsd?: number; amountTjs?: number; exchangeRate?: number;
          debtBeforeTjs?: number; ownerProfitAllocations?: Allocation[]; bonusReversalAllocations?: Allocation[]; fxGainUsd?: number } | undefined;
        if (!log || !details || details.amountUsd === undefined || !details.exchangeRate || !Array.isArray(details.ownerProfitAllocations)) {
          throw new Error('Не сохранены исходные суммы возврата для точной отмены');
        }
        if (details.isCancellation) throw new Error('Продажа уже отменена — оформите новый чек');
        if (sale.saleItems.some((item) => item.isBonus)) throw new Error('Возврат бонусного товара требует восстановления бонусного периода администратором');
        await restoreSoldDevices(tx, sale.saleItems.map((item) => item.deviceId), sale.storeId, sale.refundedAt ?? log.createdAt, sale.receiptNumber);
        for (const line of sale.accessoryItems) {
          await consumeRestored(tx, readAllocations(line.allocations));
          await tx.saleAccessoryItem.update({ where: { id: line.id }, data: {
            returnedQuantity: 0, returnedPriceTjs: 0, returnedPriceUsd: 0, returnedCostUsd: 0,
          } });
        }
        await reverseOwners(tx, [...details.ownerProfitAllocations, ...(details.bonusReversalAllocations ?? [])]);
        const repaid = await tx.customerPaymentAllocation.aggregate({ where: { saleId }, _sum: { allocatedAmountTjs: true } });
        const debt = details.debtBeforeTjs !== undefined ? D(details.debtBeforeTjs)
          : roundMoney(D(sale.totalTjs).minus(sale.cashAmountTjs).minus(sale.cardAmountTjs).minus(repaid._sum.allocatedAmountTjs ?? 0));
        if (debt.lt(0)) throw new Error('Не удалось восстановить исходный долг по чеку');
        if (debt.gt(0)) {
          if (!sale.customerId) throw new Error('Не найден клиент для восстановления долга');
          await tx.customer.update({ where: { id: sale.customerId }, data: { totalDebtTjs: { increment: debt } } });
        }
        // The refund being cancelled is the receipt's latest refund posting; it recorded how it was paid.
        const refundPosting = await tx.financialTransaction.findFirst({
          where: { type: 'REFUND', direction: 'OUT', sourceType: 'SALE', sourceId: saleId, status: 'POSTED', reversedTransactionId: null },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { description: true },
        });
        await restorePayout(tx, { saleId, storeId: sale.storeId, receiptNumber: sale.receiptNumber,
          amountTjs: details.amountTjs ?? sale.actualRefundAmountTjs ?? 0, amountUsd: details.amountUsd,
          rate: details.exchangeRate, actor, reason, referenceId: log.id, card: isCardRefund(refundPosting?.description) });
        await tx.sale.update({ where: { id: saleId }, data: { status: 'COMPLETED', refundedAt: null, refundedByUserId: null,
          refundReason: null, penaltyFeeTjs: null, penaltyFeeUsd: null, actualRefundAmountTjs: null, debtAmountTjs: debt } });
        await tx.auditLog.create({ data: {
          userId: actor.id, userName: actor.name, userRole: actor.role, action: 'REFUND_CANCEL', targetId: saleId,
          receiptNumber: sale.receiptNumber, details: `Чек #${sale.receiptNumber}: отменён возврат всего чека. Причина: ${reason}`,
          financialDetails: moneyJson({ refundLogId: log.id, storeId: sale.storeId, originalRefund: { ...sale, refundDetails: details },
            ownerProfitAllocations: [...details.ownerProfitAllocations, ...(details.bonusReversalAllocations ?? [])]
              .map((row) => ({ ...row, amountUsd: D(row.amountUsd).negated() })),
            reportEvent: {
              storeId: sale.storeId, saleId, receiptNumber: sale.receiptNumber, originalDate: sale.refundedAt ?? log.createdAt,
              revenueUsd: D(sale.totalUsd).minus(details.fxGainUsd ?? 0).negated(), revenueTjs: D(sale.totalTjs).negated(),
              profitUsd: D(calculateRecognizedProfit(logs, D(sale.totalUsd).minus(sale.saleItems.reduce((sum, item) => sum.plus(item.costBasisUsd), D(0))) )).negated().plus(details.fxGainUsd ?? 0),
              bonusUsd: 0, rate: sale.exchangeRate ?? details.exchangeRate, penaltyTjs: sale.penaltyFeeTjs ?? 0,
              penaltyUsd: sale.penaltyFeeUsd ?? 0, reason: sale.refundReason,
            },
          }),
        } });
      }
      await tx.deviceTimelineEvent.createMany({ data: sale.saleItems.filter((item) => returnId ? item.returnId === returnId : true).map((item) => ({
        deviceId: item.deviceId, type: 'REFUND_CANCEL', userName: actor.name,
        description: `Отмена возврата по чеку #${sale.receiptNumber}: ${reason}`,
      })) });
      await syncStockAlerts(tx, [sale.storeId]);
      return { storeId: sale.storeId, saleId };
    }, { maxWait: 10000, timeout: 25000 });
  }
}
