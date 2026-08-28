import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney } from '../../common/money';

export interface PayCustomerInput {
  customerId: string;
  amountTjs: number;
  sourceAccount: 'MAIN_ACCOUNT' | 'STORE_CASH';
  storeId?: string;
  createdByUserId: string;
}

export class CustomersService {
  public static async update(id: string, input: { name?: string; phone?: string }) {
    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.phone !== undefined) data.phone = input.phone.trim() || null;
    return prisma.customer.update({ where: { id }, data });
  }

  /** FIFO allocation across the customer's debt sales, oldest first — mirrors SuppliersService.pay(). */
  public static async pay(input: PayCustomerInput) {
    const amountTjs = requirePositiveMoney(input.amountTjs, 'Сумма оплаты');
    if (!['MAIN_ACCOUNT', 'STORE_CASH'].includes(input.sourceAccount)) throw new Error('Некорректный источник оплаты');
    if (input.sourceAccount === 'STORE_CASH' && !input.storeId) throw new Error('Выберите кассу магазина');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new Error('Клиент не найден');
      if (amountTjs > customer.totalDebtTjs + 0.01) throw new Error('Сумма оплаты превышает задолженность клиента');

      const openSales = await tx.sale.findMany({
        where: { customerId: input.customerId, debtAmountTjs: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });

      let remainingToPay = amountTjs;
      const allocations: { saleId: string; receiptNumber: number; allocatedAmountTjs: number }[] = [];

      const payment = await tx.customerPayment.create({
        data: {
          customerId: input.customerId,
          amountTjs,
          sourceAccount: input.sourceAccount,
          storeId: input.storeId,
          createdByUserId: actor.id,
        },
      });

      for (const sale of openSales) {
        if (remainingToPay <= 0) break;
        const remainingOnSale = sale.debtAmountTjs;
        if (remainingOnSale <= 0) continue;

        const payForThis = Math.min(remainingOnSale, remainingToPay);
        await tx.sale.update({ where: { id: sale.id }, data: { debtAmountTjs: { decrement: payForThis } } });
        await tx.customerPaymentAllocation.create({
          data: { paymentId: payment.id, saleId: sale.id, allocatedAmountTjs: payForThis },
        });
        allocations.push({ saleId: sale.id, receiptNumber: sale.receiptNumber, allocatedAmountTjs: payForThis });
        remainingToPay -= payForThis;
      }

      const debtGuard = await tx.customer.updateMany({
        where: { id: input.customerId, totalDebtTjs: { gte: amountTjs } },
        data: {
          totalPaidTjs: { increment: amountTjs },
          totalDebtTjs: { decrement: amountTjs },
        },
      });
      if (debtGuard.count !== 1) throw new Error('Задолженность изменилась, обновите данные и повторите оплату');

      let store = null;
      if (input.sourceAccount === 'STORE_CASH' && input.storeId) {
        store = await tx.store.findUnique({ where: { id: input.storeId } });
        if (store) {
          if (store.isMainWarehouse) throw new Error('Главный склад не является торговой кассой');
          await tx.store.update({ where: { id: input.storeId }, data: { cashBalanceTjs: { increment: amountTjs } } });
        }
      }

      await tx.ledgerEntry.create({
        data: {
          type: 'CUSTOMER_PAYMENT',
          description: `Оплата долга от клиента ${customer.name}: ${amountTjs} TJS`,
          amountTjs,
          storeId: input.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: payment.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'CUSTOMER_PAYMENT',
          details: `Принята оплата долга от клиента ${customer.name} на сумму ${amountTjs} TJS. Погашено по чекам: ${allocations
            .map((a) => `#${a.receiptNumber} (${a.allocatedAmountTjs})`)
            .join(', ')}`,
          financialDetails: { amountTjs },
          targetId: payment.id,
        },
      });

      return { payment, allocations };
    }, { maxWait: 10000, timeout: 25000 });
  }
}
