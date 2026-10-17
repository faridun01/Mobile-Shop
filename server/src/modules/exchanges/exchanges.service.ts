import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney, roundMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { ReturnsService } from '../sales/returns.service';
import { SalesService } from '../sales/sales.service';

interface ExchangeInput {
  saleId: string;
  /** The phone or tablet handed back: its item on the receipt, or its IMEI / SN. */
  saleItemId?: string;
  returnedImei?: string;
  /** Or accessory units handed back: their line on the receipt and how many. */
  returnedAccessory?: { lineId: string; quantity: number };
  /** Kept from the returned goods' price (удержание); 0 is allowed. */
  withheldTjs?: MoneyInput;
  /** The new phone or tablet and its price… */
  replacementDeviceId?: string;
  newPriceTjs?: MoneyInput;
  /** …or new accessory units at a unit price. */
  replacementAccessory?: { productId: string; quantity: number; unitPriceTjs: MoneyInput };
  /** How the customer pays the difference, or gets the change back when the new goods are cheaper. */
  paymentMethod?: 'CASH' | 'CARD' | 'SPLIT';
  cashAmountTjs?: MoneyInput;
  cardAmountTjs?: MoneyInput;
  reason?: string;
  processedByUserId: string;
}

const wholeUnits = (value: unknown, label: string) => {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`${label}: количество должно быть целым числом от 1`);
  return quantity;
};

/**
 * An exchange is a return followed by a sale, in one transaction: the returned goods go back to
 * stock (their receipt shows the return, with the withheld amount), and the new goods are sold on
 * a new receipt paid first with the returned goods' credit, then with cash or card for the rest —
 * or the customer gets the change when the new goods are cheaper. Either side is a phone/tablet
 * or accessory units. The register moves by the difference only, and each document books its own
 * profit, exactly as a separate return and sale.
 */
export class ExchangesService {
  public static async process(input: ExchangeInput) {
    const method = input.paymentMethod ?? 'CASH';
    if (!['CASH', 'CARD', 'SPLIT'].includes(method)) throw new Error('Некорректный способ расчёта при обмене');
    const returnsDevice = Boolean(input.saleItemId || input.returnedImei);
    if (returnsDevice === Boolean(input.returnedAccessory)) throw new Error('Укажите один сдаваемый товар: телефон/планшет или аксессуар');
    const sellsDevice = Boolean(input.replacementDeviceId);
    if (sellsDevice === Boolean(input.replacementAccessory)) throw new Error('Укажите один товар на замену: телефон/планшет или аксессуар');

    // The new receipt: one device at its price, or accessory units at a unit price.
    const newDevice = sellsDevice ? { deviceId: input.replacementDeviceId!, salePriceTjs: requirePositiveMoney(input.newPriceTjs, 'Цена нового товара') } : null;
    const newAccessory = input.replacementAccessory
      ? {
          productId: String(input.replacementAccessory.productId ?? ''),
          quantity: wholeUnits(input.replacementAccessory.quantity, 'Аксессуар на замену'),
          unitPriceTjs: requirePositiveMoney(input.replacementAccessory.unitPriceTjs, 'Цена аксессуара на замену'),
        }
      : null;
    const newTotalTjs = newDevice ? newDevice.salePriceTjs : roundMoney(newAccessory!.unitPriceTjs.mul(newAccessory!.quantity));

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.processedByUserId);
      const rate = D(await requireTodayRate(tx));
      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true, accessoryItems: true } });
      if (!sale) throw new Error('Чек не найден');

      // What the customer hands back.
      let returnedText: string;
      let returnInput: { items: { saleItemId: string; withheldTjs: MoneyInput }[]; accessories: { lineId: string; quantity: number; withheldTjs: MoneyInput }[] };
      if (returnsDevice) {
        const codes = input.returnedImei ? [input.returnedImei, input.returnedImei.toUpperCase()] : [];
        const item = input.saleItemId
          ? sale.saleItems.find((i) => i.id === input.saleItemId)
          : sale.saleItems.find((i) => !i.returnId && (codes.includes(i.imei) || (i.imei2 !== null && codes.includes(i.imei2))));
        if (!item) throw new Error('В указанном чеке не найден этот телефон');
        if (input.replacementDeviceId === item.deviceId) throw new Error('Нельзя обменять телефон на него же');
        returnedText = `${item.model} (${item.category === 'TABLET' ? 'SN' : 'IMEI'} ${item.imei})`;
        returnInput = { items: [{ saleItemId: item.id, withheldTjs: input.withheldTjs ?? 0 }], accessories: [] };
      } else {
        const line = sale.accessoryItems.find((l) => l.id === input.returnedAccessory!.lineId);
        if (!line) throw new Error('Аксессуар не найден в этом чеке');
        const quantity = wholeUnits(input.returnedAccessory!.quantity, `${line.brand} ${line.name}`.trim());
        returnedText = `${line.brand} ${line.name} × ${quantity}`.trim();
        returnInput = { items: [], accessories: [{ lineId: line.id, quantity, withheldTjs: input.withheldTjs ?? 0 }] };
      }

      // What the customer takes instead.
      let newText: string;
      if (newDevice) {
        const replacement = await tx.device.findUnique({ where: { id: newDevice.deviceId }, select: { brand: true, model: true, imei: true, category: true } });
        if (!replacement) throw new Error('Телефон на замену не найден');
        newText = `${replacement.model} (${replacement.category === 'TABLET' ? 'SN' : 'IMEI'} ${replacement.imei})`;
      } else {
        const product = await tx.accessoryProduct.findUnique({ where: { id: newAccessory!.productId }, select: { brand: true, name: true } });
        if (!product) throw new Error('Аксессуар на замену не найден');
        newText = `${product.brand} ${product.name} × ${newAccessory!.quantity}`.trim();
      }

      const reason = input.reason?.trim() || `Обмен на ${newText}`;
      const returned = await ReturnsService.returnItemsInTx(tx, {
        saleId: sale.id,
        ...returnInput,
        reason,
        userId: actor.id,
        payoutMethod: method === 'CARD' ? 'CARD' : 'CASH',
        exchangeNewTotalTjs: newTotalTjs,
      }, rate);

      const newSale = await SalesService.executeSaleInTx(tx, {
        storeId: returned.storeId,
        userId: actor.id,
        items: newDevice ? [newDevice] : [],
        accessories: newAccessory ? [newAccessory] : [],
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
          details: `Обмен: возврат ${returnedText} по чеку #${sale.receiptNumber}, продажа ${newText} чеком #${newSale.receiptNumber} за ${newTotalTjs} TJS. Зачёт ${returned.creditTjs} TJS${returned.payoutTjs.gt(0) ? `, выдано клиенту ${returned.payoutTjs} TJS` : ''}`,
          financialDetails: moneyJson({ saleReturnId: returned.saleReturnId, newSaleId: newSale.id, creditTjs: returned.creditTjs, appliedTjs: returned.appliedTjs, payoutTjs: returned.payoutTjs }),
          receiptNumber: newSale.receiptNumber,
          targetId: newSale.id,
        },
      });

      return { originalSaleId: sale.id, saleReturnId: returned.saleReturnId, sale: newSale, creditTjs: returned.creditTjs, payoutTjs: returned.payoutTjs };
    }, { maxWait: 10000, timeout: 30000 });
  }
}
