import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { requireTodayRate, getRateForDate } from '../exchange-rate/exchange-rate.service';
import { requirePositiveMoney, roundMoney } from '../../common/money';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';
import { PushNotificationService } from '../notifications/push.service';

export interface CustomerFilter {
  search?: string;
  debtorsOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface RecordCustomerPaymentInput {
  customerId: string;
  amountTjs: MoneyInput;
  storeId?: string;
  sourceAccount?: string;
  note?: string;
  userId: string;
}

export class CustomersService {
  /**
   * List customers with search, debt filtering, and aggregate totals.
   */
  public static async list(filter: CustomerFilter = {}) {
    const { search, debtorsOnly, limit = 50, offset = 0 } = filter;

    const where: any = {};
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { note: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (debtorsOnly) {
      where.totalDebtTjs = { gt: 0 };
    }

    const [customers, totalCount, aggregate] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: { sales: true, payments: true },
          },
          sales: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, receiptNumber: true, totalTjs: true },
          },
        },
        orderBy: debtorsOnly ? [{ totalDebtTjs: 'desc' }, { name: 'asc' }] : [{ totalDebtTjs: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.customer.count({ where }),
      prisma.customer.aggregate({
        _sum: {
          totalDebtTjs: true,
          totalPaidTjs: true,
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const [debtorsCount, pushSubscribedCount] = await Promise.all([
      prisma.customer.count({ where: { totalDebtTjs: { gt: 0 } } }),
      prisma.customer.count({ where: { pushSubscription: { not: null as any } } }),
    ]);

    return {
      items: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        note: c.note,
        pushEnabled: c.pushEnabled,
        hasPushSubscription: Boolean(c.pushSubscription),
        totalDebtTjs: Number(c.totalDebtTjs),
        totalPaidTjs: Number(c.totalPaidTjs),
        salesCount: c._count.sales,
        paymentsCount: c._count.payments,
        lastSale: c.sales[0]
          ? {
              createdAt: c.sales[0].createdAt.toISOString(),
              receiptNumber: c.sales[0].receiptNumber,
              totalTjs: Number(c.sales[0].totalTjs),
            }
          : null,
        createdAt: c.createdAt.toISOString(),
      })),
      total: totalCount,
      summary: {
        totalCustomers: aggregate._count.id,
        totalDebtTjs: Number(aggregate._sum.totalDebtTjs || 0),
        totalPaidTjs: Number(aggregate._sum.totalPaidTjs || 0),
        debtorsCount,
        pushSubscribedCount,
      },
    };
  }

  /**
   * Get customer details by ID, including sales and payments.
   */
  public static async getById(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          orderBy: { createdAt: 'desc' },
          include: {
            store: { select: { id: true, name: true } },
            saleItems: { select: { id: true, brand: true, model: true, color: true, storage: true, imei: true, salePriceTjs: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: {
            allocations: {
              include: {
                sale: { select: { id: true, receiptNumber: true, totalTjs: true, createdAt: true } },
              },
            },
          },
        },
      },
    });

    if (!customer) throw new Error('Клиент не найден');
    return {
      ...customer,
      totalDebtTjs: Number(customer.totalDebtTjs),
      totalPaidTjs: Number(customer.totalPaidTjs),
      hasPushSubscription: Boolean(customer.pushSubscription),
    };
  }

  /**
   * Create a new customer record.
   */
  public static async create(data: { name: string; phone?: string; note?: string; pushEnabled?: boolean }) {
    const name = data.name.trim();
    if (!name) throw new Error('Имя клиента обязательно');

    const cleanPhone = data.phone?.trim() || null;
    if (cleanPhone) {
      const existing = await prisma.customer.findUnique({ where: { phone: cleanPhone } });
      if (existing) throw new Error(`Клиент с номером телефона ${cleanPhone} уже существует (${existing.name})`);
    }

    return await prisma.customer.create({
      data: {
        name,
        phone: cleanPhone,
        note: data.note?.trim() || null,
        pushEnabled: data.pushEnabled ?? true,
      },
    });
  }

  /**
   * Update an existing customer.
   */
  public static async update(id: string, data: { name?: string; phone?: string | null; note?: string | null; pushEnabled?: boolean }) {
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new Error('Клиент не найден');

    const updateData: any = {};
    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      if (!trimmed) throw new Error('Имя клиента не может быть пустым');
      updateData.name = trimmed;
    }

    if (data.phone !== undefined) {
      const cleanPhone = data.phone ? data.phone.trim() : null;
      if (cleanPhone && cleanPhone !== existing.phone) {
        const duplicate = await prisma.customer.findUnique({ where: { phone: cleanPhone } });
        if (duplicate) throw new Error(`Клиент с номером телефона ${cleanPhone} уже существует (${duplicate.name})`);
      }
      updateData.phone = cleanPhone;
    }

    if (data.note !== undefined) updateData.note = data.note ? data.note.trim() : null;
    if (data.pushEnabled !== undefined) updateData.pushEnabled = Boolean(data.pushEnabled);

    return await prisma.customer.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete customer if no sales or payments exist.
   */
  public static async delete(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { sales: true, payments: true } } },
    });
    if (!customer) throw new Error('Клиент не найден');
    if (customer._count.sales > 0 || customer._count.payments > 0) {
      throw new Error('Нельзя удалить клиента с историей покупок или платежей');
    }
    await prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Receive a debt repayment from a customer.
   * Decrements customer debt, allocates to unpaid sales, and puts cash into the store register.
   */
  public static async recordPayment(input: RecordCustomerPaymentInput) {
    const amountTjs = requirePositiveMoney(input.amountTjs, 'Сумма оплаты');

    return await prisma.$transaction(async (tx: TransactionClient) => {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new Error('Клиент не найден');
      if (D(customer.totalDebtTjs).lte(0)) {
        throw new Error('У клиента нет задолженности для погашения');
      }

      const rate = await requireTodayRate(tx);
      const amountUsd = roundMoney(D(amountTjs).div(rate));

      // Resolve store for deposit
      let storeId = input.storeId;
      if (!storeId) {
        const defaultStore = await tx.store.findFirst({ where: { active: true, isMainWarehouse: false } });
        storeId = defaultStore?.id;
      }
      if (!storeId) throw new Error('Не удалось определить магазин для внесения оплаты в кассу');

      const store = await tx.store.findUnique({ where: { id: storeId } });
      if (!store) throw new Error('Магазин не найден');

      // Create CustomerPayment document
      const payment = await tx.customerPayment.create({
        data: {
          customerId: customer.id,
          amountTjs,
          exchangeRate: rate,
          sourceAccount: input.sourceAccount || 'STORE_CASH',
          storeId,
          createdByUserId: input.userId,
        },
      });

      // Find unpaid debt sales for this customer, ordered chronologically (oldest first)
      const unpaidSales = await tx.sale.findMany({
        where: { customerId: customer.id, debtAmountTjs: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });

      let remainingToAllocate = D(amountTjs);
      for (const sale of unpaidSales) {
        if (remainingToAllocate.lte(0)) break;
        const allocation = D(sale.debtAmountTjs).lte(remainingToAllocate) ? D(sale.debtAmountTjs) : remainingToAllocate;

        await tx.customerPaymentAllocation.create({
          data: {
            paymentId: payment.id,
            saleId: sale.id,
            allocatedAmountTjs: allocation,
          },
        });

        await tx.sale.update({
          where: { id: sale.id },
          data: { debtAmountTjs: { decrement: allocation } },
        });

        remainingToAllocate = remainingToAllocate.minus(allocation);
      }

      // Decrement customer total debt and increment total paid
      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalDebtTjs: { decrement: amountTjs },
          totalPaidTjs: { increment: amountTjs },
        },
      });

      // Credit cash to store register
      await tx.store.update({
        where: { id: storeId },
        data: { cashBalanceUsd: { increment: amountUsd } },
      });

      const cashAccount = await getStoreCashAccount(tx, storeId, store.name);
      await postTransaction(tx, {
        type: 'INCOME',
        direction: 'IN',
        numberPrefix: 'CR',
        accountId: cashAccount.id,
        balanceCurrency: 'USD',
        amount: amountTjs,
        currency: 'TJS',
        exchangeRate: rate,
        amountTjs,
        amountUsd,
        categoryName: 'Оплата долга клиентом',
        counterpartyType: 'CUSTOMER',
        counterpartyId: customer.id,
        counterpartyName: customer.name,
        shopId: storeId,
        sourceType: 'CUSTOMER_PAYMENT',
        sourceId: payment.id,
        description: `Погашение долга клиентом ${customer.name}: ${amountTjs} TJS ($${amountUsd})${input.note ? ` — ${input.note}` : ''}`,
        createdByUserId: input.userId,
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'CUSTOMER_PAYMENT',
          description: `Оплата долга: ${customer.name} — ${amountTjs} TJS ($${amountUsd})`,
          amountTjs,
          amountUsd,
          exchangeRate: rate,
          storeId,
          storeName: store.name,
          referenceId: payment.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'CUSTOMER_PAYMENT',
          details: `Принята оплата долга от клиента ${customer.name}: ${amountTjs} TJS ($${amountUsd}), остаток долга: ${updatedCustomer.totalDebtTjs} TJS`,
          financialDetails: moneyJson({
            amountTjs,
            amountUsd,
            exchangeRate: rate,
            remainingDebtTjs: updatedCustomer.totalDebtTjs,
          }),
          targetId: payment.id,
        },
      });

      return {
        payment,
        customer: updatedCustomer,
        storeId,
        amountTjs: Number(amountTjs),
        amountUsd: Number(amountUsd),
      };
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * Save web push subscription for a customer.
   */
  public static async savePushSubscription(customerId: string, subscription: any) {
    if (!subscription?.endpoint) throw new Error('Некорректные параметры push-подписки');
    return await prisma.customer.update({
      where: { id: customerId },
      data: {
        pushSubscription: subscription,
        pushEnabled: true,
      },
    });
  }

  /**
   * Send web push notification to customers.
   */
  public static async sendPush(params: {
    target: 'ALL' | 'DEBTORS' | 'CUSTOMER';
    customerId?: string;
    title: string;
    message: string;
    targetRoute?: string;
    userId: string;
  }) {
    const { target, customerId, title, message, targetRoute = '/sale', userId } = params;
    if (!title.trim() || !message.trim()) {
      throw new Error('Заголовок и текст push-уведомления обязательны');
    }

    const where: any = {
      pushEnabled: true,
      pushSubscription: { not: null as any },
    };

    if (target === 'CUSTOMER') {
      if (!customerId) throw new Error('Не указан клиент для отправки push-уведомления');
      where.id = customerId;
    } else if (target === 'DEBTORS') {
      where.totalDebtTjs = { gt: 0 };
    }

    const recipients = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true, pushSubscription: true },
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const sub = recipient.pushSubscription as any;
      if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) continue;

      try {
        await (PushNotificationService as any).sendToSubscription(
          { id: recipient.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          { title, message, targetRoute }
        );
        sent++;
      } catch (err) {
        failed++;
      }
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SEND_CUSTOMER_PUSH',
        details: `Push-рассылка клиентам (${target}): "${title}" — отправлено: ${sent}, ошибок: ${failed}, получателей: ${recipients.length}`,
      },
    });

    return {
      totalFound: recipients.length,
      sent,
      failed,
    };
  }

  /**
   * Get complete summary for the "Касса" overview dashboard page:
   * 1. Cash currently in registers (TJS and USD by store + overall)
   * 2. Stock items count and inventory monetary value
   * 3. Debt to suppliers (total and breakdown)
   * 4. Customer debts (total and list of debtors)
   */
  public static async getCashDeskSummary(storeId?: string) {
    const [rateVal, stores, inStockDevices, suppliersWithDebt, customerDebtors] = await Promise.all([
      getRateForDate(new Date()),
      prisma.store.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.device.findMany({
        where: {
          status: { in: ['STORE_STOCK', 'MAIN_WAREHOUSE', 'IN_STOCK_AFTER_EXCHANGE'] },
          ...(storeId && storeId !== 'all' ? { storeId } : {}),
        },
        select: {
          id: true,
          storeId: true,
          purchasePriceUsd: true,
          costBasisUsd: true,
          retailPriceTjs: true,
        },
      }),
      prisma.supplier.findMany({
        where: { active: true, totalDebtUsd: { gt: 0 } },
        orderBy: { totalDebtUsd: 'desc' },
      }),
      prisma.customer.findMany({
        where: { totalDebtTjs: { gt: 0 } },
        orderBy: { totalDebtTjs: 'desc' },
        take: 50,
        include: {
          sales: {
            where: { debtAmountTjs: { gt: 0 } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, receiptNumber: true },
          },
        },
      }),
    ]);

    const rate = rateVal ? Number(rateVal) : 10.9;

    // 1. Cash Balances
    const storeCash = stores.map((s: any) => {
      const cashUsd = Number(s.cashBalanceUsd);
      const cashTjs = roundMoney(D(cashUsd).mul(rate));
      return {
        id: s.id as string,
        name: s.name as string,
        isMainWarehouse: Boolean(s.isMainWarehouse),
        cashUsd,
        cashTjs: Number(cashTjs),
      };
    });

    const relevantStores = storeId && storeId !== 'all' ? storeCash.filter((s: any) => s.id === storeId) : storeCash;
    const totalCashUsd = relevantStores.reduce((sum: number, s: any) => sum + s.cashUsd, 0);
    const totalCashTjs = roundMoney(D(totalCashUsd).mul(rate));

    // 2. Stock Inventory
    const totalStockCount = inStockDevices.length;
    const totalStockCostUsd = inStockDevices.reduce((sum: number, d: any) => sum + Number(d.costBasisUsd || d.purchasePriceUsd || 0), 0);
    const totalStockCostTjs = roundMoney(D(totalStockCostUsd).mul(rate));

    // 3. Supplier Debt
    const totalSupplierDebtUsd = suppliersWithDebt.reduce((sum: number, s: any) => sum + Number(s.totalDebtUsd), 0);
    const totalSupplierDebtTjs = roundMoney(D(totalSupplierDebtUsd).mul(rate));

    // 4. Customer Debt
    const totalCustomerDebtTjs = customerDebtors.reduce((sum: number, c: any) => sum + Number(c.totalDebtTjs), 0);
    const totalCustomerDebtUsd = rate > 0 ? roundMoney(D(totalCustomerDebtTjs).div(rate)) : 0;

    return {
      exchangeRate: rate,
      cash: {
        totalUsd: totalCashUsd,
        totalTjs: Number(totalCashTjs),
        stores: storeCash,
      },
      inventory: {
        totalCount: totalStockCount,
        totalCostUsd: totalStockCostUsd,
        totalCostTjs: Number(totalStockCostTjs),
      },
      suppliers: {
        totalDebtUsd: totalSupplierDebtUsd,
        totalDebtTjs: Number(totalSupplierDebtTjs),
        debtorsCount: suppliersWithDebt.length,
        suppliers: suppliersWithDebt.map((s: any) => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          totalDebtUsd: Number(s.totalDebtUsd),
          totalDebtTjs: Number(roundMoney(D(s.totalDebtUsd).mul(rate))),
        })),
      },
      customers: {
        totalDebtTjs: totalCustomerDebtTjs,
        totalDebtUsd: Number(totalCustomerDebtUsd),
        debtorsCount: customerDebtors.length,
        debtors: customerDebtors.map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          note: c.note,
          totalDebtTjs: Number(c.totalDebtTjs),
          totalPaidTjs: Number(c.totalPaidTjs),
          lastSaleDate: c.sales[0]?.createdAt.toISOString() || null,
          lastReceiptNumber: c.sales[0]?.receiptNumber || null,
        })),
      },
    };
  }
}
