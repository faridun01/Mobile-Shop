import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';

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
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.refundedByUserId);
      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true } });
      if (!sale) throw new Error('Чек не найден');
      // Idempotency guard: a sale can only be refunded once.
      if (sale.status === 'REFUNDED') throw new Error('Этот чек уже был возвращён');

      const rate = (await getRateForDate(new Date())) ?? sale.exchangeRate ?? 9.5;
      const penaltyFeeTjs = input.penaltyFeeTjs ?? 0;
      const penaltyUsd = Number((penaltyFeeTjs / rate).toFixed(2));
      const actualRefundTjs = Math.max(0, input.refundAmountTjs);
      const totalCostUsd = sale.saleItems.reduce((sum, item) => sum + item.costBasisUsd, 0);
      const originalProfitUsd = sale.totalUsd - totalCostUsd;
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
        },
      });

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
        await tx.store.update({ where: { id: sale.storeId }, data: { cashBalanceTjs: { decrement: actualRefundTjs } } });
      }

      const owners = await tx.owner.findMany();
      for (const owner of owners) {
        const delta = Number((netProfitImpactUsd * (owner.profitSharePercent / 100)).toFixed(2));
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
          amountUsd: -Number((actualRefundTjs / rate).toFixed(2)),
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
    });
  }
}
