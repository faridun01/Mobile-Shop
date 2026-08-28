import { prisma } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { moneyEquals, requireNonNegativeMoney, requirePositiveMoney, roundMoney } from '../../common/money';

export interface CreateSaleInput {
  storeId: string;
  userId: string;
  items: { deviceId: string; salePriceTjs: number }[];
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  cashAmountTjs?: number;
  cardAmountTjs?: number;
  customerName?: string;
}

export class SalesService {
  /**
   * Atomic Sale Execution using PostgreSQL Prisma Transaction.
   * Mirrors AppContext.createSale's business rules exactly:
   * 1. Devices must currently be STORE_STOCK or IN_STOCK_AFTER_EXCHANGE at this store.
   * 2. Devices flip to SOLD (race-safe: guarded updateMany + count check).
   * 3. Store cash register only moves for the cash portion of the payment.
   * 4. Every owner accrues their profit-share of this sale's margin.
   * 5. A ledger entry and an audit log entry are recorded.
   */
  public static async executeSale(input: CreateSaleInput) {
    if (!input.items || input.items.length === 0) {
      throw new Error('Корзина пуста');
    }

    const rate = await getRateForDate(new Date());
    if (!rate) {
      throw new Error('Сначала задайте курс валют на сегодня');
    }

    if (!input.storeId) throw new Error('Не удалось определить магазин продажи');
    if (!['CASH', 'CARD', 'SPLIT'].includes(input.paymentMethod)) throw new Error('Некорректный способ оплаты');
    const deviceIds = input.items.map((item) => item.deviceId);
    if (new Set(deviceIds).size !== deviceIds.length) throw new Error('Одно устройство нельзя добавить в чек дважды');

    const normalizedItems = input.items.map((item) => ({
      ...item,
      salePriceTjs: requirePositiveMoney(item.salePriceTjs, 'Цена продажи'),
    }));
    const totalTjs = normalizedItems.reduce((sum, item) => sum + item.salePriceTjs, 0);
    const cashAmountTjs = input.paymentMethod === 'CASH' ? totalTjs : input.paymentMethod === 'SPLIT' ? input.cashAmountTjs ?? 0 : 0;
    const cardAmountTjs = input.paymentMethod === 'CARD' ? totalTjs : input.paymentMethod === 'SPLIT' ? input.cardAmountTjs ?? 0 : 0;

    requireNonNegativeMoney(cashAmountTjs, 'Сумма наличными');
    requireNonNegativeMoney(cardAmountTjs, 'Сумма по карте');
    if (input.paymentMethod === 'SPLIT' && !moneyEquals(cashAmountTjs + cardAmountTjs, totalTjs)) {
      throw new Error('Сумма наличных и по карте должна совпадать с итоговой суммой чека');
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const store = await tx.store.findUnique({ where: { id: input.storeId } });
      if (!store || !store.active || store.isMainWarehouse) {
        throw new Error('Продажа возможна только из активной торговой точки');
      }
      const devices = await tx.device.findMany({
        where: {
          id: { in: deviceIds },
          storeId: input.storeId,
          status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] },
        },
      });

      if (devices.length !== deviceIds.length) {
        throw new Error('Одно или несколько выбранных устройств недоступны для продажи (уже продано, в ремонте или перемещается)');
      }
      const deviceById = new Map(devices.map((d) => [d.id, d]));

      const totalUsd = roundMoney(totalTjs / rate);
      let totalCostUsd = 0;
      let hasBelowCostItem = false;

      const saleItemsData = normalizedItems.map((item) => {
        const device = deviceById.get(item.deviceId)!;
        const salePriceUsd = roundMoney(item.salePriceTjs / rate);
        const costTjs = device.costBasisUsd * rate;
        const isBelowCost = item.salePriceTjs < costTjs;
        if (isBelowCost) hasBelowCostItem = true;
        totalCostUsd += device.costBasisUsd;
        return {
          deviceId: device.id,
          brand: device.brand,
          model: device.model,
          storage: device.storage,
          color: device.color,
          imei: device.imei,
          imei2: device.imei2,
          salePriceTjs: item.salePriceTjs,
          salePriceUsd,
          purchaseCostUsd: device.purchasePriceUsd,
          costBasisUsd: device.costBasisUsd,
          isBelowCost,
        };
      });

      const sale = await tx.sale.create({
        data: {
          storeId: input.storeId,
          userId: input.userId,
          totalTjs,
          totalUsd,
          exchangeRate: rate,
          cashAmountTjs,
          cardAmountTjs,
          paymentMethod: input.paymentMethod,
          customerName: input.customerName,
          hasBelowCostItem,
          saleItems: { create: saleItemsData },
        },
        include: { saleItems: true },
      });

      const updateResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, storeId: input.storeId, status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
        data: { status: 'SOLD' },
      });
      if (updateResult.count !== deviceIds.length) {
        throw new Error('One or more selected devices were sold concurrently. Please refresh and try again.');
      }

      for (const item of saleItemsData) {
        await tx.deviceTimelineEvent.create({
          data: {
            deviceId: item.deviceId,
            type: 'SALE',
            description: `Продано за ${item.salePriceTjs} TJS (чек #${sale.receiptNumber})`,
            userName: input.userId,
            priceTjs: item.salePriceTjs,
            priceUsd: item.salePriceUsd,
          },
        });
      }

      if (cashAmountTjs !== 0) {
        await tx.store.update({ where: { id: input.storeId }, data: { cashBalanceTjs: { increment: cashAmountTjs } } });
      }

      const saleProfitUsd = roundMoney(totalUsd - totalCostUsd);
      const owners = await tx.owner.findMany();
      for (const owner of owners) {
        const delta = roundMoney(saleProfitUsd * (owner.profitSharePercent / 100));
        await tx.owner.update({
          where: { id: owner.id },
          data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
        });
      }

      await tx.ledgerEntry.create({
        data: {
          type: input.paymentMethod === 'CASH' ? 'CASH_SALE' : input.paymentMethod === 'CARD' ? 'CARD_SALE' : 'SALE',
          description: `Чек #${sale.receiptNumber}: продажа ${saleItemsData.length} устройств`,
          amountTjs: totalTjs,
          amountUsd: totalUsd,
          exchangeRate: rate,
          storeId: input.storeId,
          storeName: store?.name,
          referenceId: sale.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: hasBelowCostItem ? 'SALE_BELOW_COST' : 'SALE',
          details: `Чек #${sale.receiptNumber}: продажа ${saleItemsData.length} устройств на сумму ${totalTjs} TJS ($${totalUsd})`,
          financialDetails: { amountTjs: totalTjs, amountUsd: totalUsd, exchangeRate: rate, recognizedProfitUsd: saleProfitUsd },
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return sale;
    }, { maxWait: 10000, timeout: 20000 });
  }
}
