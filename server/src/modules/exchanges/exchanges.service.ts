import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';

export interface ExchangeInput {
  saleId: string;
  returnedImei: string;
  returnedBrand: string;
  returnedModel: string;
  returnedStorage?: string;
  returnedColor?: string;
  exchangeInValueTjs: number;
  replacementDeviceId: string;
  newPriceTjs: number;
  differenceTjs?: number;
  paymentMethod?: 'CASH' | 'CARD';
  cashAmountTjs?: number;
  cardAmountTjs?: number;
  processedByUserId: string;
}

export class ExchangesService {
  public static async process(input: ExchangeInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.processedByUserId);
      const rate = await getRateForDate(new Date());
      if (!rate) throw new Error('Сначала задайте курс валют');

      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true } });
      if (!sale) throw new Error('Продажа не найдена');

      // The replacement device must come from the same store as the sale being
      // exchanged — otherwise stock would silently teleport between stores with no
      // transfer record at all.
      const replacementDevice = await tx.device.findFirst({
        where: { id: input.replacementDeviceId, storeId: sale.storeId, status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
      });
      if (!replacementDevice) throw new Error('Выбранный телефон на замену недоступен на складе');

      const matchedItem = sale.saleItems.find((i) => i.imei === input.returnedImei);
      if (!matchedItem) throw new Error('В указанном чеке не найдена позиция с этим IMEI');

      const exchangeInValueUsd = Number((input.exchangeInValueTjs / rate).toFixed(2));
      const newPriceUsd = Number((input.newPriceTjs / rate).toFixed(2));
      const diffTjs = input.differenceTjs ?? input.newPriceTjs - input.exchangeInValueTjs;
      const paymentMethod = input.paymentMethod ?? 'CASH';
      const cashAmountTjs = input.cashAmountTjs ?? (paymentMethod === 'CASH' ? diffTjs : 0);
      const cardAmountTjs = input.cardAmountTjs ?? (paymentMethod === 'CARD' ? diffTjs : 0);

      // This flow swaps one item within an existing sale for another — the "returned"
      // device is the very device already sold in this sale (matchedItem.deviceId), not
      // some unrelated personal phone the customer brings in. It comes back into stock
      // at a new cost basis (the agreed trade-in value); its purchase history is untouched.
      const returnedDevice = await tx.device.findUniqueOrThrow({ where: { id: matchedItem.deviceId } });
      const returnDeviceGuard = await tx.device.updateMany({
        where: { id: matchedItem.deviceId, status: 'SOLD' },
        data: { status: 'IN_STOCK_AFTER_EXCHANGE', costBasisUsd: returnedDevice.purchasePriceUsd },
      });
      if (returnDeviceGuard.count !== 1) {
        throw new Error('Возвращаемое устройство уже было обработано параллельно, повторите попытку');
      }
      await tx.deviceTimelineEvent.create({
        data: { deviceId: returnedDevice.id, type: 'EXCHANGE_IN', description: 'Принят по программе Trade-In', userName: actor.name },
      });

      const soldResult = await tx.device.updateMany({
        where: { id: replacementDevice.id, status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
        data: { status: 'SOLD' },
      });
      if (soldResult.count !== 1) {
        throw new Error('Телефон на замену был продан параллельно, повторите попытку');
      }
      await tx.deviceTimelineEvent.create({
        data: {
          deviceId: replacementDevice.id,
          type: 'EXCHANGE_OUT',
          description: `Выдан по обмену за ${input.newPriceTjs} TJS`,
          userName: actor.name,
          priceTjs: input.newPriceTjs,
          priceUsd: newPriceUsd,
        },
      });

      const newTotalTjs = Math.max(0, sale.totalTjs + diffTjs);
      const newTotalUsd = Number((newTotalTjs / rate).toFixed(2));

      await tx.saleItem.update({
        where: { id: matchedItem.id },
        data: {
          deviceId: replacementDevice.id,
          brand: replacementDevice.brand,
          model: replacementDevice.model,
          storage: replacementDevice.storage,
          color: replacementDevice.color,
          imei: replacementDevice.imei,
          imei2: replacementDevice.imei2,
          salePriceTjs: input.newPriceTjs,
          salePriceUsd: newPriceUsd,
          purchaseCostUsd: replacementDevice.purchasePriceUsd,
          costBasisUsd: replacementDevice.costBasisUsd,
        },
      });

      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          totalTjs: newTotalTjs,
          totalUsd: newTotalUsd,
          cashAmountTjs: sale.cashAmountTjs + cashAmountTjs,
          cardAmountTjs: sale.cardAmountTjs + cardAmountTjs,
          status: 'EXCHANGED',
          exchangeEvents: {
            create: [
              {
                returnedDeviceId: returnedDevice.id,
                returnedImei: returnedDevice.imei,
                returnedModel: returnedDevice.model,
                exchangeInValueTjs: input.exchangeInValueTjs,
                exchangeInValueUsd,
                replacementDeviceId: replacementDevice.id,
                replacementImei: replacementDevice.imei,
                replacementModel: replacementDevice.model,
                newPriceTjs: input.newPriceTjs,
                newPriceUsd,
                differenceTjs: diffTjs,
                paymentMethod,
                cashAmountTjs,
                cardAmountTjs,
                processedByUserId: actor.id,
              },
            ],
          },
        },
      });

      const store = await tx.store.findUnique({ where: { id: sale.storeId } });
      const cashDelta = paymentMethod === 'CASH' ? diffTjs : 0;
      if (cashDelta !== 0 && store) {
        await tx.store.update({ where: { id: sale.storeId }, data: { cashBalanceTjs: { increment: cashDelta } } });
      }

      // Note: matching the existing tested business logic, exchange settlements do not
      // adjust owner profit accrual (only sale/refund/expense do) — preserved as-is.

      await tx.ledgerEntry.create({
        data: {
          type: 'EXCHANGE_SETTLEMENT',
          description: `Обмен по чеку #${sale.receiptNumber}: ${returnedDevice.model} → ${replacementDevice.model}`,
          amountTjs: diffTjs,
          amountUsd: Number((diffTjs / rate).toFixed(2)),
          exchangeRate: rate,
          storeId: sale.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: sale.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'EXCHANGE',
          details: `Чек #${sale.receiptNumber}: обмен ${returnedDevice.model} (IMEI ${returnedDevice.imei}) на ${replacementDevice.model} (IMEI ${replacementDevice.imei}). Расчет: ${diffTjs >= 0 ? '+' : ''}${diffTjs} TJS`,
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return updatedSale;
    });
  }
}
