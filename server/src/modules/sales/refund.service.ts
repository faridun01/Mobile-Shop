import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { moneyEquals, requireNonNegativeMoney, roundMoney } from '../../common/money';
import { calculateRecognizedProfit } from './profit';

export interface RefundInput {
  saleId: string;
  reason: string;
  refundAmountTjs: number;
  penaltyFeeTjs?: number;
  paymentMethod: 'CASH' | 'CARD';
  refundedByUserId: string;
}

export class RefundService {
  public static async refund(input: RefundInput) {
    if (!input.reason?.trim()) throw new Error('Укажите причину возврата');
    if (!['CASH', 'CARD'].includes(input.paymentMethod)) throw new Error('Некорректный способ возврата');
    const requestedRefundTjs = requireNonNegativeMoney(input.refundAmountTjs, 'Сумма возврата');
    const requestedPenaltyTjs = requireNonNegativeMoney(input.penaltyFeeTjs ?? 0, 'Штраф');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.refundedByUserId);
      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true } });
      if (!sale) throw new Error('Чек не найден');
      // Idempotency guard: a sale can only be refunded once.
      if (sale.status === 'REFUNDED') throw new Error('Этот чек уже был возвращён');

      const rate = (await getRateForDate(new Date())) ?? sale.exchangeRate;
      if (!rate || rate <= 0) throw new Error('Не найден курс валют для возврата');
      const penaltyFeeTjs = requestedPenaltyTjs;
      // For a DEBT sale, only the cash/card portion actually collected up front can be
      // handed back — the still-unpaid remainder was never real money in the register.
      // That remainder is simply forgiven below instead of being refunded.
      const amountActuallyCollectedTjs = sale.totalTjs - sale.debtAmountTjs;
      if (penaltyFeeTjs > amountActuallyCollectedTjs) throw new Error('Штраф не может превышать фактически полученную сумму по чеку');
      const expectedRefundTjs = amountActuallyCollectedTjs - penaltyFeeTjs;
      if (!moneyEquals(requestedRefundTjs, expectedRefundTjs)) {
        throw new Error('Сумма возврата должна равняться фактически полученной сумме по чеку за вычетом штрафа');
      }
      const penaltyUsd = roundMoney(penaltyFeeTjs / rate);
      const actualRefundTjs = requestedRefundTjs;
      const totalCostUsd = sale.saleItems.reduce((sum, item) => sum + item.costBasisUsd, 0);
      const profitLogs = await tx.auditLog.findMany({
        where: { targetId: sale.id, action: { in: ['SALE', 'SALE_BELOW_COST', 'EXCHANGE'] } },
        select: { action: true, financialDetails: true },
      });
      const originalProfitUsd = calculateRecognizedProfit(profitLogs, sale.totalUsd - totalCostUsd);
      const netProfitImpactUsd = -originalProfitUsd + penaltyUsd;

      const updatedSale = await tx.sale.update({
        where: { id: input.saleId },
        data: {
          status: 'REFUNDED',
          refundReason: input.reason,
          refundedAt: new Date(),
          refundedByUserId: actor.id,
          penaltyFeeTjs,
          penaltyFeeUsd: penaltyUsd,
          actualRefundAmountTjs: actualRefundTjs,
          debtAmountTjs: 0,
        },
      });

      // Refunding a sale returns the devices to stock, so any debt the customer still
      // owed on it is forgiven — there's nothing left to collect for.
      if (sale.debtAmountTjs > 0 && sale.customerId) {
        await tx.customer.update({ where: { id: sale.customerId }, data: { totalDebtTjs: { decrement: sale.debtAmountTjs } } });
      }

      const deviceIds = sale.saleItems.map((i) => i.deviceId);
      const restockResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, status: 'SOLD' },
        data: { status: 'STORE_STOCK' },
      });
      if (restockResult.count !== deviceIds.length) {
        throw new Error('Не удалось вернуть устройства на склад — состояние изменилось');
      }

      for (const item of sale.saleItems) {
        await tx.deviceTimelineEvent.create({
          data: {
            deviceId: item.deviceId,
            type: 'REFUND',
            description: `Возврат по чеку #${sale.receiptNumber}${penaltyFeeTjs > 0 ? `, штраф ${penaltyFeeTjs} TJS` : ''}`,
            userName: actor.name,
          },
        });
      }

      const store = await tx.store.findUnique({ where: { id: sale.storeId } });
      if (input.paymentMethod === 'CASH') {
        const cashGuard = await tx.store.updateMany({ where: { id: sale.storeId, cashBalanceTjs: { gte: actualRefundTjs } }, data: { cashBalanceTjs: { decrement: actualRefundTjs } } });
        if (cashGuard.count !== 1) throw new Error('В кассе недостаточно наличных для возврата');
      }

      const owners = await tx.owner.findMany();
      for (const owner of owners) {
        const delta = roundMoney(netProfitImpactUsd * (owner.profitSharePercent / 100));
        await tx.owner.update({
          where: { id: owner.id },
          data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
        });
      }

      await tx.ledgerEntry.create({
        data: {
          type: 'REFUND',
          description: `Возврат по чеку #${sale.receiptNumber}: ${input.reason}`,
          amountTjs: -actualRefundTjs,
          amountUsd: -roundMoney(actualRefundTjs / rate),
          exchangeRate: rate,
          storeId: sale.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: sale.id,
        },
      });
      if (penaltyFeeTjs > 0) {
        await tx.ledgerEntry.create({
          data: {
            type: 'REFUND',
            description: `Штраф за возврат по чеку #${sale.receiptNumber} (100% в прибыль)`,
            amountTjs: penaltyFeeTjs,
            amountUsd: penaltyUsd,
            exchangeRate: rate,
            storeId: sale.storeId,
            storeName: store?.name,
            userName: actor.name,
            referenceId: sale.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'REFUND',
          details: `Чек #${sale.receiptNumber}: возврат на сумму ${actualRefundTjs} TJS. ${penaltyFeeTjs > 0 ? `Удержан штраф: ${penaltyFeeTjs} TJS.` : ''} Причина: ${input.reason}`,
          financialDetails: { amountTjs: actualRefundTjs, penaltyTjs: penaltyFeeTjs, penaltyUsd },
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return updatedSale;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
