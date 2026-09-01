import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { moneyEquals, requireFiniteNumber, requireNonNegativeMoney, requirePositiveMoney, roundMoney } from '../../common/money';

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
    const exchangeInValueTjs = requirePositiveMoney(input.exchangeInValueTjs, 'Зачётная стоимость');
    const newPriceTjs = requirePositiveMoney(input.newPriceTjs, 'Цена нового устройства');
    const canonicalDifferenceTjs = newPriceTjs - exchangeInValueTjs;
    if (input.differenceTjs !== undefined && !moneyEquals(requireFiniteNumber(input.differenceTjs, 'Разница обмена'), canonicalDifferenceTjs)) {
      throw new Error('Разница обмена не совпадает с ценой нового устройства минус зачётная стоимость');
    }
    if (input.paymentMethod && !['CASH', 'CARD'].includes(input.paymentMethod)) throw new Error('Некорректный способ расчёта при обмене');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.processedByUserId);
      const rate = await getRateForDate(new Date());
      if (!rate) throw new Error('Сначала задайте курс валют');

      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true } });
      if (!sale) throw new Error('Продажа не найдена');
      if (sale.status === 'REFUNDED') throw new Error('Нельзя обменять товар из возвращённого чека');

      // The replacement device must come from the same store as the sale being
      // exchanged — otherwise stock would silently teleport between stores with no
      // transfer record at all.
      const replacementDevice = await tx.device.findFirst({
        where: { id: input.replacementDeviceId, storeId: sale.storeId, status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
      });
      if (!replacementDevice) throw new Error('Выбранный телефон на замену недоступен на складе');

      const matchedItem = sale.saleItems.find((i) => i.imei === input.returnedImei);
      if (!matchedItem) throw new Error('В указанном чеке не найдена позиция с этим IMEI');

      if (replacementDevice.id === matchedItem.deviceId) throw new Error('Нельзя обменять устройство на него же');

      const exchangeInValueUsd = roundMoney(exchangeInValueTjs / rate);
      const newPriceUsd = roundMoney(newPriceTjs / rate);
      const diffTjs = canonicalDifferenceTjs;
      const paymentMethod = input.paymentMethod ?? 'CASH';
      const cashAmountTjs = input.cashAmountTjs ?? (paymentMethod === 'CASH' ? diffTjs : 0);
      const cardAmountTjs = input.cardAmountTjs ?? (paymentMethod === 'CARD' ? diffTjs : 0);
      requireFiniteNumber(cashAmountTjs, 'Расчёт наличными');
      requireFiniteNumber(cardAmountTjs, 'Расчёт по карте');
      if (!moneyEquals(cashAmountTjs + cardAmountTjs, diffTjs)) {
        throw new Error('Сумма расчёта наличными и по карте должна совпадать с разницей обмена');
      }
      if (paymentMethod === 'CASH' && !moneyEquals(cardAmountTjs, 0)) throw new Error('При наличном расчёте сумма по карте должна быть нулевой');
      if (paymentMethod === 'CARD' && !moneyEquals(cashAmountTjs, 0)) throw new Error('При расчёте картой сумма наличными должна быть нулевой');
      if (diffTjs > 0) {
        requireNonNegativeMoney(cashAmountTjs, 'Доплата наличными');
        requireNonNegativeMoney(cardAmountTjs, 'Доплата по карте');
      }

      // This flow swaps one item within an existing sale for another — the "returned"
      // device is the very device already sold in this sale (matchedItem.deviceId), not
      // some unrelated personal phone the customer brings in. It comes back into stock
      // at a new cost basis (the agreed trade-in value); its purchase history is untouched.
      const returnedDevice = await tx.device.findUniqueOrThrow({ where: { id: matchedItem.deviceId } });
      const returnDeviceGuard = await tx.device.updateMany({
        where: { id: matchedItem.deviceId, status: 'SOLD' },
        data: { status: 'IN_STOCK_AFTER_EXCHANGE', costBasisUsd: exchangeInValueUsd },
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
          description: `Выдан по обмену за ${newPriceTjs} TJS`,
          userName: actor.name,
          priceTjs: input.newPriceTjs,
          priceUsd: newPriceUsd,
        },
      });

      const newTotalTjs = Math.max(0, sale.totalTjs + diffTjs);
      const newTotalUsd = roundMoney(sale.totalUsd + diffTjs / rate);
      const exchangeProfitUsd = roundMoney(newPriceUsd - replacementDevice.costBasisUsd);

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
          salePriceTjs: newPriceTjs,
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
          hasBelowCostItem: sale.saleItems.some((item) => item.id !== matchedItem.id && item.isBelowCost) || newPriceUsd < replacementDevice.costBasisUsd,
          exchangeEvents: {
            create: [
              {
                returnedDeviceId: returnedDevice.id,
                returnedImei: returnedDevice.imei,
                returnedModel: returnedDevice.model,
                exchangeInValueTjs,
                exchangeInValueUsd,
                replacementDeviceId: replacementDevice.id,
                replacementImei: replacementDevice.imei,
                replacementModel: replacementDevice.model,
                newPriceTjs,
                newPriceUsd,
                differenceTjs: diffTjs,
                paymentMethod,
                cashAmountTjs,
                cardAmountTjs,
                exchangeRate: rate,
                processedByUserId: actor.id,
              },
            ],
          },
        },
      });

      const store = await tx.store.findUnique({ where: { id: sale.storeId } });
      const cashDelta = paymentMethod === 'CASH' ? diffTjs : 0;
      if (cashDelta !== 0 && store) {
        const cashGuard = cashDelta < 0
          ? await tx.store.updateMany({ where: { id: sale.storeId, cashBalanceTjs: { gte: Math.abs(cashDelta) } }, data: { cashBalanceTjs: { increment: cashDelta } } })
          : await tx.store.updateMany({ where: { id: sale.storeId }, data: { cashBalanceTjs: { increment: cashDelta } } });
        if (cashGuard.count !== 1) throw new Error('В кассе недостаточно наличных для выплаты разницы клиенту');
      }

      // Incremental exchange profit is the new device's selling price minus its cost.
      // The original sale profit remains booked; the returned device comes back as an
      // asset at the agreed trade-in value, which offsets the customer's trade-in credit.
      const owners = await tx.owner.findMany();
      await Promise.all(owners.map((owner) => {
        const delta = roundMoney(exchangeProfitUsd * (owner.profitSharePercent / 100));
        return tx.owner.update({
          where: { id: owner.id },
          data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
        });
      }));

      await tx.ledgerEntry.create({
        data: {
          type: 'EXCHANGE_SETTLEMENT',
          description: `Обмен по чеку #${sale.receiptNumber}: ${returnedDevice.model} → ${replacementDevice.model}`,
          amountTjs: diffTjs,
          amountUsd: roundMoney(diffTjs / rate),
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
          financialDetails: { exchangeInValueTjs, exchangeInValueUsd, newPriceTjs, newPriceUsd, differenceTjs: diffTjs, exchangeProfitUsd },
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return updatedSale;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
