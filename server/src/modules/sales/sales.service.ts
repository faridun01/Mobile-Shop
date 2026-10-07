import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { allocateMoney } from '../../common/allocation';
import { moneyEquals, requireNonNegativeMoney, requirePositiveMoney, roundMoney } from '../../common/money';
import { allocateOwnerProfit } from './profit';
import { getOwnersForStore } from '../finance/owner-allocations';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';

interface CreateSaleInput {
  storeId: string;
  userId: string;
  items: { deviceId: string; salePriceTjs: MoneyInput }[];
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | 'DEBT';
  cashAmountTjs?: MoneyInput;
  cardAmountTjs?: MoneyInput;
  debtAmountTjs?: MoneyInput;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
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

    if (!input.storeId) throw new Error('Не удалось определить магазин продажи');
    if (!['CASH', 'CARD', 'SPLIT', 'DEBT'].includes(input.paymentMethod)) throw new Error('Некорректный способ оплаты');
    const deviceIds = input.items.map((item) => item.deviceId);
    if (new Set(deviceIds).size !== deviceIds.length) throw new Error('Одно устройство нельзя добавить в чек дважды');

    const normalizedItems = input.items.map((item) => ({
      ...item,
      salePriceTjs: requirePositiveMoney(item.salePriceTjs, 'Цена продажи'),
    }));
    const totalTjs = normalizedItems.reduce((sum, item) => D(sum).plus(item.salePriceTjs), D(0));

    let cashAmountTjs = D(0);
    let cardAmountTjs = D(0);
    let debtAmountTjs = D(0);

    if (input.paymentMethod === 'CASH') {
      cashAmountTjs = totalTjs;
    } else if (input.paymentMethod === 'CARD') {
      cardAmountTjs = totalTjs;
    } else if (input.paymentMethod === 'SPLIT') {
      cashAmountTjs = requireNonNegativeMoney(input.cashAmountTjs ?? 0, 'Сумма наличными');
      cardAmountTjs = requireNonNegativeMoney(input.cardAmountTjs ?? 0, 'Сумма по карте');
      if (!moneyEquals(cashAmountTjs.plus(cardAmountTjs), totalTjs)) {
        throw new Error('Сумма наличных и по карте должна совпадать с итоговой суммой чека');
      }
    } else if (input.paymentMethod === 'DEBT') {
      cashAmountTjs = requireNonNegativeMoney(input.cashAmountTjs ?? 0, 'Сумма наличными');
      cardAmountTjs = requireNonNegativeMoney(input.cardAmountTjs ?? 0, 'Сумма по карте');
      const upfrontPaidTjs = cashAmountTjs.plus(cardAmountTjs);
      if (upfrontPaidTjs.gt(totalTjs)) {
        throw new Error('Сумма первого взноса не может превышать общую стоимость чека');
      }
      debtAmountTjs = totalTjs.minus(upfrontPaidTjs);
      if (debtAmountTjs.lte(0)) {
        throw new Error('При продаже в долг сумма долга должна быть больше 0');
      }
    }

    return prisma.$transaction(async (tx: TransactionClient) => {
      const rate = await requireTodayRate(tx);
      const store = await tx.store.findUnique({ where: { id: input.storeId } });
      if (!store || !store.active || store.isMainWarehouse) {
        throw new Error('Главный склад предназначен исключительно для хранения телефонов. Продажи со склада запрещены — продажа возможна только через розничные торговые точки.');
      }
      await tx.$queryRaw(Prisma.sql`SELECT id FROM devices WHERE id IN (${Prisma.join(deviceIds)}) ORDER BY id FOR UPDATE`);
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

      const totalUsd = roundMoney(D(totalTjs).div(rate));
      // Split the receipt's USD total across items by price so the items add up to it
      // exactly — rounding each item on its own drifts by a cent from the total.
      const itemUsd = allocateMoney(totalUsd, normalizedItems.map((item) => item.salePriceTjs));
      let totalCostUsd = D(0);
      let regularRevenueUsd = D(0);
      let regularCostUsd = D(0);
      let bonusProfitUsd = D(0);
      let bonusProfitTjs = D(0);
      let hasBelowCostItem = false;

      const saleItemsData = normalizedItems.map((item, index) => {
        const device = deviceById.get(item.deviceId)!;
        // Only a device that cost nothing is a bonus: its whole price goes to the bonus pool.
        // A bonus-flagged device bought for money, or one taken back in an exchange at its
        // trade-in value, is a regular sale so its cost is never skipped.
        const isBonus = Boolean((device.isBonus || device.bonusCampaign) && D(device.costBasisUsd).eq(0));
        const salePriceUsd = itemUsd[index];
        const costTjs = D(device.costBasisUsd).mul(rate);
        const isBelowCost = !isBonus && D(item.salePriceTjs).lt(costTjs);
        if (isBelowCost) hasBelowCostItem = true;
        totalCostUsd = D(totalCostUsd).plus(device.costBasisUsd);

        if (isBonus) {
          bonusProfitUsd = D(bonusProfitUsd).plus(salePriceUsd);
          bonusProfitTjs = D(bonusProfitTjs).plus(item.salePriceTjs);
        } else {
          regularRevenueUsd = D(regularRevenueUsd).plus(salePriceUsd);
          regularCostUsd = D(regularCostUsd).plus(device.costBasisUsd);
        }

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
          isBonus,
        };
      });

      let finalCustomerId: string | null = null;
      let finalCustomerName = input.customerName?.trim() || null;
      const cleanPhone = input.customerPhone?.trim() || null;

      // 1. If an existing customer ID was explicitly provided (e.g. chosen from autocomplete)
      if (input.customerId) {
        const cust = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!cust) {
          if (input.paymentMethod === 'DEBT') throw new Error('Выбранный клиент не найден');
        } else {
          finalCustomerId = cust.id;
          if (finalCustomerName && cust.name !== finalCustomerName && cust.name.startsWith('Клиент ')) {
            const updated = await tx.customer.update({
              where: { id: cust.id },
              data: { name: finalCustomerName },
            });
            finalCustomerName = updated.name;
          } else {
            finalCustomerName = finalCustomerName || cust.name;
          }
          if (cleanPhone && !cust.phone) {
            await tx.customer.update({
              where: { id: cust.id },
              data: { phone: cleanPhone },
            });
          }
        }
      }

      // 2. If no customer was matched yet, but phone or name was provided: find or save into Customer DB
      if (!finalCustomerId && (cleanPhone || finalCustomerName)) {
        if (cleanPhone) {
          const phoneVariants = [
            cleanPhone,
            ...(cleanPhone.startsWith('+992') ? [cleanPhone.slice(4), cleanPhone.slice(1)] : []),
            ...(!cleanPhone.startsWith('+') ? [`+${cleanPhone}`, `+992${cleanPhone}`] : []),
          ];
          let cust = await tx.customer.findFirst({
            where: {
              phone: { in: phoneVariants },
            },
          });
          if (!cust) {
            cust = await tx.customer.create({
              data: {
                name: finalCustomerName || `Клиент ${cleanPhone}`,
                phone: cleanPhone,
              },
            });
          } else if (finalCustomerName && cust.name !== finalCustomerName && cust.name.startsWith('Клиент ')) {
            cust = await tx.customer.update({
              where: { id: cust.id },
              data: { name: finalCustomerName },
            });
          }
          finalCustomerId = cust.id;
          finalCustomerName = finalCustomerName || cust.name;
        } else if (finalCustomerName) {
          let cust = await tx.customer.findFirst({
            where: {
              name: { equals: finalCustomerName, mode: 'insensitive' },
              phone: null,
            },
          });
          if (!cust) {
            cust = await tx.customer.create({
              data: {
                name: finalCustomerName,
              },
            });
          }
          finalCustomerId = cust.id;
          finalCustomerName = cust.name;
        }
      }

      // 3. For DEBT sales, a customer is mandatory and totalDebtTjs is incremented
      if (input.paymentMethod === 'DEBT') {
        if (!finalCustomerId) {
          throw new Error('Для продажи в долг обязательно укажите клиента (номер телефона или имя)');
        }
        await tx.customer.update({
          where: { id: finalCustomerId },
          data: { totalDebtTjs: { increment: debtAmountTjs } },
        });
      }

      const sale = await tx.sale.create({
        data: {
          storeId: input.storeId,
          userId: input.userId,
          totalTjs,
          totalUsd,
          exchangeRate: rate,
          cashAmountTjs,
          cardAmountTjs,
          debtAmountTjs,
          paymentMethod: input.paymentMethod,
          customerId: finalCustomerId,
          customerName: finalCustomerName,
          hasBelowCostItem,
          saleItems: { create: saleItemsData },
        },
        include: {
          saleItems: { include: { device: { select: { ram: true } } } },
          store: true,
          user: { select: { id: true, name: true, role: true } },
          customer: true,
        },
      });

      const bonusItems = saleItemsData.filter((i) => i.isBonus);
      if (bonusItems.length > 0) {
        await tx.bonusPoolEntry.createMany({
          data: bonusItems.map((b) => ({
            deviceId: b.deviceId,
            saleId: sale.id,
            imei: b.imei,
            brand: b.brand,
            model: b.model,
            salePriceUsd: b.salePriceUsd,
            salePriceTjs: b.salePriceTjs,
            profitUsd: b.salePriceUsd,
            profitTjs: b.salePriceTjs,
            status: 'PENDING',
          })),
        });
      }

      const updateResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, storeId: input.storeId, status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
        data: { status: 'SOLD' },
      });
      if (updateResult.count !== deviceIds.length) {
        throw new Error('Одно или несколько устройств были проданы параллельно. Обновите данные и повторите продажу');
      }

      await tx.deviceTimelineEvent.createMany({
        data: saleItemsData.map((item) => ({
          deviceId: item.deviceId,
          type: 'SALE',
          description: `Продано за ${item.salePriceTjs} TJS (чек #${sale.receiptNumber})${input.paymentMethod === 'DEBT' ? ` [В долг: ${debtAmountTjs} TJS]` : ''}${item.isBonus ? ' (Бонусный товар)' : ''}`,
          userName: input.userId,
          priceTjs: item.salePriceTjs,
          priceUsd: item.salePriceUsd,
        })),
      });

      const upfrontPaidTjs = D(cashAmountTjs).plus(cardAmountTjs);
      const upfrontPaidUsd = roundMoney(upfrontPaidTjs.div(rate));

      if (!upfrontPaidTjs.isZero()) {
        await tx.store.update({ where: { id: input.storeId }, data: { cashBalanceUsd: { increment: upfrontPaidUsd } } });
        const cashAccount = await getStoreCashAccount(tx, input.storeId, store.name);
        const paymentDescription = input.paymentMethod === 'DEBT'
          ? `продажа в долг (первый взнос: нал. ${cashAmountTjs} TJS, карта ${cardAmountTjs} TJS; долг: ${debtAmountTjs} TJS, клиент: ${finalCustomerName})`
          : input.paymentMethod === 'CASH'
            ? 'продажа наличными'
            : input.paymentMethod === 'CARD'
              ? 'продажа (перевод / карта)'
              : `смешанная оплата (наличные ${cashAmountTjs} TJS, перевод/карта ${cardAmountTjs} TJS)`;
        await postTransaction(tx, {
          type: 'INCOME',
          direction: 'IN',
          numberPrefix: 'CR',
          accountId: cashAccount.id,
          balanceCurrency: 'USD',
          amount: upfrontPaidTjs,
          currency: 'TJS',
          exchangeRate: rate,
          amountTjs: upfrontPaidTjs,
          amountUsd: upfrontPaidUsd,
          categoryName: 'Продажа',
          shopId: input.storeId,
          sourceType: 'SALE',
          sourceId: sale.id,
          description: `Чек #${sale.receiptNumber}: ${paymentDescription}`,
          createdByUserId: input.userId,
        });
      }

      const regularProfitUsd = roundMoney(D(regularRevenueUsd).minus(regularCostUsd));
      const owners = await getOwnersForStore(tx, input.storeId);
      // Only regular profit is auto-distributed to owners on sale — a loss too, the same as
      // an exchange, so owner balances always match the profit the reports show.
      // Bonus device profit is stored in the pending bonus pool for quarterly manual allocation.
      const ownerProfitAllocations = regularProfitUsd.isZero() ? [] : allocateOwnerProfit(regularProfitUsd, owners);
      await Promise.all(ownerProfitAllocations.filter(({ amountUsd }) => !D(amountUsd).isZero()).map(({ ownerId, amountUsd: delta }) => {
        return tx.owner.update({
          where: { id: ownerId },
          data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
        });
      }));

      await tx.ledgerEntry.create({
        data: {
          type: input.paymentMethod === 'CASH' ? 'CASH_SALE' : input.paymentMethod === 'CARD' ? 'CARD_SALE' : 'SALE',
          description: `Чек #${sale.receiptNumber}: продажа ${saleItemsData.length} устройств${input.paymentMethod === 'DEBT' ? ` в долг (${finalCustomerName || 'Клиент'}, долг ${debtAmountTjs} TJS)` : ''}`,
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
          details: `Чек #${sale.receiptNumber}: продажа ${saleItemsData.length} устройств на сумму ${totalTjs} TJS ($${totalUsd})${input.paymentMethod === 'DEBT' ? ` в долг (${finalCustomerName}, долг ${debtAmountTjs} TJS)` : ''}${bonusItems.length > 0 ? ` (включая ${bonusItems.length} бонусных устройств, $${roundMoney(bonusProfitUsd)} в бонусный пул)` : ''}`,
          financialDetails: moneyJson({
            amountTjs: totalTjs,
            amountUsd: totalUsd,
            exchangeRate: rate,
            debtAmountTjs,
            recognizedProfitUsd: regularProfitUsd,
            bonusProfitUsd: roundMoney(bonusProfitUsd),
            ownerProfitAllocations: moneyJson(ownerProfitAllocations),
          }),
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return {
        ...sale,
        saleItems: sale.saleItems.map((item: any) => ({
          ...item,
          ram: item.device?.ram || undefined,
        })),
      };
    }, { maxWait: 10000, timeout: 20000 });
  }
}
