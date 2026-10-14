import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { ReturnsService } from '../sales/returns.service';
import { SalesService } from '../sales/sales.service';

interface ExchangeInput {
  saleId: string;
  /** The phone handed back: its item on the receipt, or its IMEI. */
  saleItemId?: string;
  returnedImei?: string;
  /** Kept from the returned phone's price (удержание); 0 is allowed. */
  withheldTjs?: MoneyInput;
  replacementDeviceId: string;
  newPriceTjs: MoneyInput;
  /** How the customer pays the difference, or gets the change back when the new phone is cheaper. */
  paymentMethod?: 'CASH' | 'CARD' | 'SPLIT';
  cashAmountTjs?: MoneyInput;
  cardAmountTjs?: MoneyInput;
  reason?: string;
  processedByUserId: string;
}

/**
 * An exchange is a return followed by a sale, in one transaction: the returned phone goes back to
 * stock (its receipt shows the return, with the withheld amount), and the new phone is sold on a
 * new receipt paid first with the returned phone's credit, then with cash or card for the rest —
 * or the customer gets the change when the new phone is cheaper. The register moves by the
 * difference only, and each document books its own profit, exactly as a separate return and sale.
 */
export class ExchangesService {
  public static async process(input: ExchangeInput) {
    const newPriceTjs = requirePositiveMoney(input.newPriceTjs, 'Цена нового телефона');
    const method = input.paymentMethod ?? 'CASH';
    if (!['CASH', 'CARD', 'SPLIT'].includes(method)) throw new Error('Некорректный способ расчёта при обмене');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.processedByUserId);
      const rate = D(await requireTodayRate(tx));
      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true } });
      if (!sale) throw new Error('Чек не найден');
      const item = input.saleItemId
        ? sale.saleItems.find((i) => i.id === input.saleItemId)
        : sale.saleItems.find((i) => !i.returnId && (i.imei === input.returnedImei || i.imei2 === input.returnedImei));
      if (!item) throw new Error('В указанном чеке не найден этот телефон');
      if (input.replacementDeviceId === item.deviceId) throw new Error('Нельзя обменять телефон на него же');
      const replacement = await tx.device.findUnique({ where: { id: input.replacementDeviceId }, select: { brand: true, model: true, imei: true } });
      if (!replacement) throw new Error('Телефон на замену не найден');

      const reason = input.reason?.trim() || `Обмен на ${replacement.brand} ${replacement.model} (IMEI ${replacement.imei})`;
      const returned = await ReturnsService.returnItemsInTx(tx, {
        saleId: sale.id,
        items: [{ saleItemId: item.id, withheldTjs: input.withheldTjs ?? 0 }],
        reason,
        userId: actor.id,
        payoutMethod: method === 'CARD' ? 'CARD' : 'CASH',
        exchangeNewTotalTjs: newPriceTjs,
      }, rate);

      const newSale = await SalesService.executeSaleInTx(tx, {
        storeId: returned.storeId,
        userId: actor.id,
        items: [{ deviceId: input.replacementDeviceId, salePriceTjs: newPriceTjs }],
        paymentMethod: method,
        cashAmountTjs: input.cashAmountTjs,
        cardAmountTjs: input.cardAmountTjs,
        customerId: returned.customerId ?? undefined,
        customerName: returned.customerName ?? undefined,
      }, returned.appliedTjs.gt(0)
        ? { creditTjs: returned.appliedTjs, creditUsd: returned.appliedUsd, fromReceiptNumber: returned.receiptNumber }
        : undefined);

      await tx.saleReturn.update({ where: { id: returned.saleReturnId }, data: { exchangeSaleId: newSale.id } });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'SALE_EXCHANGE',
          details: `Обмен: возврат ${item.model} (IMEI ${item.imei}) по чеку #${sale.receiptNumber}, продажа ${replacement.model} (IMEI ${replacement.imei}) чеком #${newSale.receiptNumber} за ${newPriceTjs} TJS. Зачёт ${returned.creditTjs} TJS${returned.payoutTjs.gt(0) ? `, выдано клиенту ${returned.payoutTjs} TJS` : ''}`,
          financialDetails: moneyJson({ saleReturnId: returned.saleReturnId, newSaleId: newSale.id, creditTjs: returned.creditTjs, appliedTjs: returned.appliedTjs, payoutTjs: returned.payoutTjs }),
          receiptNumber: newSale.receiptNumber,
          targetId: newSale.id,
        },
      });

      return { originalSaleId: sale.id, saleReturnId: returned.saleReturnId, sale: newSale, creditTjs: returned.creditTjs, payoutTjs: returned.payoutTjs };
    }, { maxWait: 10000, timeout: 30000 });
  }
}
