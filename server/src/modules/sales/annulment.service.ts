import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { resolveActor } from '../../common/actor';
import { roundMoney } from '../../common/money';
import { cancelTransaction } from '../finance/financial-transaction.service';
import { readAllocations, restoreAllocations } from '../catalog/accessory-stock';
import { syncStockAlerts } from '../stock-thresholds/stock-alerts';
import { exchangeCostRestorations } from './profit';
import { unitsFromEnd } from './returns.service';
import { reverseDistributedBonus } from '../bonuses/bonuses.service';
import { returnOvercollectedBonus } from '../finance/cash-collection.service';
import { DailyClosingService, REFUND_CANCEL_SOURCE } from '../finance/daily-closing.service';
import { getBusinessDateKey } from '../../common/business-date';

type OwnerRow = { ownerId: string; amountUsd: MoneyInput };
const PROFIT_ACTIONS = new Set(['SALE', 'SALE_BELOW_COST', 'EXCHANGE', 'REFUND', 'SALE_RETURN', 'SALE_RETURN_CANCEL', 'REFUND_CANCEL']);

/** One administrative action annuls the receipt, its returns and its linked exchange receipts. */
export class AnnulmentService {
  static async annul(saleId: string, userId: string, allowedStoreId?: string | null) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      // Serialize traversal and annulment of an exchange chain, including simultaneous clicks
      // on different receipts of that chain. The sale row locks also exclude normal returns.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('receipt-annulment'))::text`;
      let root = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { exchangeReturn: true } });
      const parents = new Set<string>();
      while (root.exchangeReturn) {
        if (parents.has(root.id)) throw new Error('Обнаружена циклическая связь чеков обмена');
        parents.add(root.id);
        root = await tx.sale.findUniqueOrThrow({ where: { id: root.exchangeReturn.saleId }, include: { exchangeReturn: true } });
      }
      const ids = new Set([root.id]);
      let frontier = [root.id];
      while (frontier.length) {
        // An exchange locks its source sale before adding the next receipt. Lock each
        // frontier first so a concurrent exchange cannot escape the chain being annulled.
        await tx.$queryRaw(Prisma.sql`SELECT id FROM sales WHERE id IN (${Prisma.join([...frontier].sort())}) ORDER BY id FOR UPDATE`);
        const children = await tx.saleReturn.findMany({ where: { saleId: { in: frontier }, exchangeSaleId: { not: null } }, select: { exchangeSaleId: true } });
        frontier = children.map((row) => row.exchangeSaleId!).filter((id) => !ids.has(id));
        frontier.forEach((id) => ids.add(id));
      }
      const receiptIds = [...ids].sort();
      await tx.$queryRaw(Prisma.sql`SELECT id FROM sales WHERE id IN (${Prisma.join(receiptIds)}) ORDER BY id FOR UPDATE`);
      const sales = await tx.sale.findMany({ where: { id: { in: receiptIds } }, include: {
        saleItems: true, accessoryItems: true, returns: true, exchangeEvents: true,
        paymentAllocations: { include: { payment: { include: { allocations: true } } } },
      } });
      if (sales.some((sale) => allowedStoreId !== undefined && sale.storeId !== allowedStoreId)) {
        throw Object.assign(new Error('Нет доступа к аннуляции чека другого магазина'), { statusCode: 403 });
      }
      if (sales.every((sale) => sale.annulledAt)) return { storeId: root.storeId, saleId, receiptIds, alreadyAnnulled: true };
      if (sales.some((sale) => sale.annulledAt)) throw new Error('Часть связанных чеков уже аннулирована — обновите историю');
      const logs = await tx.auditLog.findMany({ where: { targetId: { in: receiptIds } } });
      const ownerDeltas = new Map<string, ReturnType<typeof D>>();
      const add = (row: OwnerRow, sign: number) => ownerDeltas.set(row.ownerId, (ownerDeltas.get(row.ownerId) ?? D(0)).plus(D(row.amountUsd).mul(sign)));
      for (const sale of sales) {
        const original = logs.find((log) => log.targetId === sale.id && ['SALE', 'SALE_BELOW_COST'].includes(log.action));
        if (!original || !Array.isArray((original.financialDetails as { ownerProfitAllocations?: unknown } | null)?.ownerProfitAllocations)) {
          throw new Error('Не сохранены исходные доли прибыли чека — требуется сверка администратором');
        }
      }
      for (const log of logs.filter((log) => PROFIT_ACTIONS.has(log.action))) {
        const details = (log.financialDetails ?? {}) as { ownerProfitAllocations?: OwnerRow[]; bonusReversalAllocations?: OwnerRow[] };
        for (const row of [...(details.ownerProfitAllocations ?? []), ...(details.bonusReversalAllocations ?? [])]) add(row, -1);
      }
      const restorations = exchangeCostRestorations(logs);
      const deviceIds = [...new Set([...sales.flatMap((sale) => sale.saleItems.map((item) => item.deviceId)), ...restorations.map((row) => row.deviceId)])].sort();
      const receiptNumbers = new Set(sales.map((sale) => sale.receiptNumber));
      const timeline = deviceIds.length ? (await tx.deviceTimelineEvent.findMany({ where: {
        deviceId: { in: deviceIds }, type: { in: ['SALE', 'REFUND', 'EXCHANGE', 'REFUND_CANCEL'] },
      } })).filter((event) => [...event.description.matchAll(/чек(?:у|а)? #(\d+)\b/gi)].some((match) => receiptNumbers.has(Number(match[1])))) : [];
      if (deviceIds.length) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM devices WHERE id IN (${Prisma.join(deviceIds)}) ORDER BY id FOR UPDATE`);
        const resold = await tx.saleItem.findFirst({ where: { deviceId: { in: deviceIds }, returnId: null,
          sale: { id: { notIn: receiptIds }, status: { not: 'REFUNDED' }, annulledAt: null } } });
        if (resold) throw new Error('Телефон уже продан по другому чеку. Сначала аннулируйте более поздний чек');
        const devices = await tx.device.findMany({ where: { id: { in: deviceIds } } });
        for (const device of devices) {
          const sale = sales.find((row) => row.saleItems.some((item) => item.deviceId === device.id)) ?? sales[0];
          if (device.storeId !== sale.storeId || !['SOLD', 'STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'].includes(device.status)) {
            throw new Error('Телефон перемещён или находится в ремонте — сначала завершите связанную операцию');
          }
          await tx.device.update({ where: { id: device.id }, data: { status: 'STORE_STOCK', storeId: sale.storeId } });
        }
      }
      for (const row of restorations) await tx.device.update({ where: { id: row.deviceId }, data: { costBasisUsd: row.originalCostUsd } });
      // Restore only still-sold accessory units; units already returned remain in stock once.
      for (const line of sales.flatMap((sale) => sale.accessoryItems)) {
        const remaining = line.quantity - line.returnedQuantity;
        if (remaining > 0) await restoreAllocations(tx, unitsFromEnd(readAllocations(line.allocations), line.returnedQuantity, remaining));
        await tx.saleAccessoryItem.update({ where: { id: line.id }, data: {
          returnedQuantity: line.quantity, returnedPriceTjs: line.salePriceTjs, returnedPriceUsd: line.salePriceUsd, returnedCostUsd: line.costUsd,
        } });
      }
      const payments = new Map(sales.flatMap((sale) => sale.paymentAllocations.map((row) => [row.payment.id, row.payment] as const)));
      for (const payment of payments.values()) {
        if (payment.allocations.some((row) => !ids.has(row.saleId))) throw new Error('Оплата долга покрывает другие чеки — сначала разделите эту оплату');
        for (const row of (payment.ownerProfitAllocations ?? []) as OwnerRow[]) add(row, -1);
        await tx.customer.update({ where: { id: payment.customerId }, data: { totalPaidTjs: { decrement: payment.amountTjs } } });
        await tx.customerPayment.delete({ where: { id: payment.id } });
      }
      for (const sale of sales) {
        if (sale.customerId && D(sale.debtAmountTjs).gt(0)) await tx.customer.update({ where: { id: sale.customerId }, data: { totalDebtTjs: { decrement: sale.debtAmountTjs } } });
        for (const row of await reverseDistributedBonus(tx, sale.id, `Аннуляция чека #${sale.receiptNumber}`, actor.name)) add(row, 1);
        await tx.bonusPoolEntry.updateMany({ where: { saleId: sale.id, status: 'PENDING' }, data: { status: 'ANNULLED', annulledAt: new Date(), annulledBy: actor.name } });
      }
      const correctionIds = [...sales.flatMap((sale) => sale.returns.map((row) => row.id)), ...logs.flatMap((log) => {
        const details = (log.financialDetails ?? {}) as { saleReturnId?: string };
        return [log.id, ...(details.saleReturnId ? [details.saleReturnId] : [])];
      })];
      const postings = await tx.financialTransaction.findMany({ where: { status: 'POSTED', reversedTransactionId: null, OR: [
        { sourceType: 'SALE', sourceId: { in: receiptIds } },
        { sourceType: REFUND_CANCEL_SOURCE, sourceId: { in: correctionIds } },
        { sourceType: 'CUSTOMER_PAYMENT', sourceId: { in: [...payments.keys()] } },
      ] }, orderBy: { id: 'asc' } });
      const cashChanges = new Map<string, { usd: ReturnType<typeof D>; tjs: ReturnType<typeof D> }>();
      const affectedDays = sales.flatMap((sale) => [sale.createdAt, ...(sale.refundedAt ? [sale.refundedAt] : []),
        ...sale.returns.map((ret) => ret.createdAt), ...sale.exchangeEvents.map((exchange) => exchange.date),
      ].map((date) => ({ storeId: sale.storeId, businessDate: getBusinessDateKey(date) })));
      for (const posting of postings) {
        if (posting.balanceCurrency !== 'USD' || !['IN', 'OUT'].includes(posting.direction)) throw new Error('Неизвестная проводка чека — требуется сверка');
        const account = await tx.financialAccount.findUniqueOrThrow({ where: { id: posting.accountId } });
        if (!account.storeId) throw new Error('Не найден магазин исходной кассовой проводки');
        // A collection took this money to Central Cash and froze its days: reversing it here would
        // take it out of a register that no longer holds it. Same rule as reopening a collected shift.
        const collected = await tx.cashHandover.findFirst({
          where: { storeId: account.storeId, cancelledAt: null, createdAt: { gt: posting.transactionDate } },
          select: { id: true },
        });
        if (collected) {
          throw Object.assign(new Error('Деньги по этому чеку уже инкассированы. Сначала отмените инкассацию, затем аннулируйте чек'), { statusCode: 409 });
        }
        affectedDays.push({ storeId: account.storeId, businessDate: getBusinessDateKey(posting.transactionDate) });
        const sign = posting.direction === 'IN' ? -1 : 1;
        const deltaUsd = D(posting.amountUsd).mul(sign);
        const deltaTjs = D(posting.amountTjs).mul(sign);
        await cancelTransaction(tx, posting.id, actor.id, { keepDate: true });
        await tx.store.update({ where: { id: account.storeId }, data: { cashBalanceUsd: { increment: deltaUsd } } });
        const prev = cashChanges.get(account.storeId) ?? { usd: D(0), tjs: D(0) };
        cashChanges.set(account.storeId, { usd: prev.usd.plus(deltaUsd), tjs: prev.tjs.plus(deltaTjs) });
      }
      for (const [storeId, delta] of cashChanges) {
        const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
        await tx.ledgerEntry.create({ data: { type: 'REFUND', storeId, storeName: store.name, userName: actor.name,
          amountTjs: roundMoney(delta.tjs), amountUsd: roundMoney(delta.usd), referenceId: root.id,
          description: `Аннуляция чека #${root.receiptNumber} со всеми возвратами`,
        } });
      }
      for (const [ownerId, amountUsd] of ownerDeltas) await tx.owner.update({ where: { id: ownerId }, data: {
        totalAccruedProfitUsd: { increment: roundMoney(amountUsd) }, availableProfitUsd: { increment: roundMoney(amountUsd) },
      } });
      await tx.sale.updateMany({ where: { id: { in: receiptIds } }, data: {
        annulledAt: new Date(), annulledByUserId: actor.id, status: 'REFUNDED', debtAmountTjs: D(0),
        refundedAt: null, refundedByUserId: null, penaltyFeeTjs: D(0), penaltyFeeUsd: D(0), actualRefundAmountTjs: D(0),
      } });
      if (timeline.length) await tx.deviceTimelineEvent.deleteMany({ where: { id: { in: timeline.map((event) => event.id) } } });
      for (const storeId of new Set(sales.filter((sale) => sale.saleItems.some((item) => item.isBonus)).map((sale) => sale.storeId))) {
        await returnOvercollectedBonus(tx, storeId, actor, `аннуляция чека #${root.receiptNumber}`, { audit: false });
      }
      const correctedClosings = await DailyClosingService.refreshClosedDays(tx, affectedDays);
      // Only one admin notification, regardless of how many refunds/exchange receipts existed.
      await tx.auditLog.create({ data: { action: 'SALE_ANNULLED', targetId: root.id, receiptNumber: root.receiptNumber,
        userId: actor.id, userName: actor.name, userRole: actor.role,
        details: `Чек #${root.receiptNumber} полностью аннулирован со всеми возвратами. Товары на складе магазина.`,
        financialDetails: moneyJson({ receipts: sales, receiptIds, timeline, correctedClosings, payments: [...payments.values()], cashChanges: [...cashChanges].map(([storeId, delta]) => ({ storeId, ...delta })),
          ownerProfitAllocations: [...ownerDeltas].map(([ownerId, amountUsd]) => ({ ownerId, amountUsd: roundMoney(amountUsd) })),
        }),
      } });
      await syncStockAlerts(tx, [...new Set(sales.map((sale) => sale.storeId))]);
      return { saleId: root.id, storeId: root.storeId, receiptIds };
    }, { maxWait: 10000, timeout: 30000 });
  }
}
