import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { requireTodayRate, getRateForDate } from '../exchange-rate/exchange-rate.service';
import { requirePositiveMoney, roundMoney } from '../../common/money';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';
import { PushNotificationService, isAllowedPushEndpoint } from '../notifications/push.service';
import { Prisma } from '@prisma/client';

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

    const where: Prisma.CustomerWhereInput = {};
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
      prisma.customer.count({ where: { pushSubscription: { not: Prisma.DbNull } } }),
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
    // The subscription (endpoint + keys) is a delivery secret; clients only need to know it exists.
    const { pushSubscription, ...rest } = customer;
    return {
      ...rest,
      totalDebtTjs: Number(customer.totalDebtTjs),
      totalPaidTjs: Number(customer.totalPaidTjs),
      hasPushSubscription: Boolean(pushSubscription),
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

    const updateData: Prisma.CustomerUpdateInput = {};
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

    const { pushSubscription, ...updated } = await prisma.customer.update({
      where: { id },
      data: updateData,
    });
    return { ...updated, hasPushSubscription: Boolean(pushSubscription) };
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
      if (D(amountTjs).gt(customer.totalDebtTjs)) {
        throw new Error(`Сумма оплаты (${amountTjs} TJS) превышает долг клиента (${customer.totalDebtTjs} TJS)`);
      }

      // Conditional decrement first: the row lock serializes concurrent payments, and a payment
      // that would push the debt below zero matches no row and is rejected.
      const debtGuard = await tx.customer.updateMany({
        where: { id: customer.id, totalDebtTjs: { gte: amountTjs } },
        data: {
          totalDebtTjs: { decrement: amountTjs },
          totalPaidTjs: { increment: amountTjs },
        },
      });
      if (debtGuard.count !== 1) {
        throw Object.assign(new Error('Долг клиента изменился — обновите данные и повторите оплату'), { statusCode: 409 });
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
      if (remainingToAllocate.gt(0)) {
        throw new Error('Сумма оплаты превышает долг по чекам клиента');
      }

      const updatedCustomer = await tx.customer.findUniqueOrThrow({ where: { id: customer.id }, omit: { pushSubscription: true } });

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
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      throw new Error('Некорректные параметры push-подписки');
    }
    if (!isAllowedPushEndpoint(subscription.endpoint)) {
      throw new Error('Push-подписка должна указывать на сервис уведомлений браузера');
    }
    // Only the fields web-push needs are stored, never arbitrary client JSON.
    const { pushSubscription: _secret, ...customer } = await prisma.customer.update({
      where: { id: customerId },
      data: {
        pushSubscription: {
          endpoint: subscription.endpoint,
          keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) },
        },
        pushEnabled: true,
      },
    });
    return { ...customer, hasPushSubscription: true };
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
    if (!PushNotificationService.isEnabled()) {
      throw Object.assign(new Error('Push-уведомления не настроены на сервере'), { statusCode: 503 });
    }

    const where: Prisma.CustomerWhereInput = {
      pushEnabled: true,
      pushSubscription: { not: Prisma.DbNull },
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
      const sub = recipient.pushSubscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
      if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) continue;

      const delivered = await PushNotificationService.sendToSubscription(
        { id: recipient.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        { title, message, targetRoute },
        // Customer subscriptions live on the customer row, not in push_subscriptions.
        () => prisma.customer.update({ where: { id: recipient.id }, data: { pushSubscription: Prisma.DbNull } }),
      );
      if (delivered) sent++;
      else failed++;
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
    const debtorWhere = { totalDebtTjs: { gt: 0 } };
    const [rateVal, stores, inStockDevices, suppliersWithDebt, customerDebtors, customerDebtTotals] = await Promise.all([
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
          brand: true,
          model: true,
          storage: true,
          color: true,
          imei: true,
          purchasePriceUsd: true,
          costBasisUsd: true,
          retailPriceTjs: true,
        },
      }),
      prisma.supplier.findMany({
        where: { active: true, totalDebtUsd: { gt: 0 } },
        orderBy: { totalDebtUsd: 'desc' },
      }),
      // The list is capped for display; the totals below come from an aggregate over every debtor.
      prisma.customer.findMany({
        where: debtorWhere,
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
      prisma.customer.aggregate({ where: debtorWhere, _sum: { totalDebtTjs: true }, _count: { _all: true } }),
    ]);

    // Read-only valuation of balances: today's rate (or the latest known one). With no rate
    // at all the TJS equivalents are reported as 0 rather than guessed.
    const rate = rateVal && D(rateVal).gt(0) ? D(rateVal) : null;
    const toTjs = (usd: MoneyInput) => (rate ? roundMoney(D(usd).mul(rate)) : D(0));
    const toUsd = (tjs: MoneyInput) => (rate ? roundMoney(D(tjs).div(rate)) : D(0));
    const deviceCostUsd = (d: { costBasisUsd: MoneyInput | null; purchasePriceUsd: MoneyInput | null }) =>
      D(d.costBasisUsd || d.purchasePriceUsd || 0);
    const storeMap = new Map<string, string>(stores.map((s) => [s.id, s.name]));

    // 1. Cash Balances
    // Главный склад — это место хранения товаров (денег там нет, касса не ведётся).
    // Все сданные средства и основной фонд хранятся в Центральной кассе.
    // В розничных магазинах отображаются остатки выручки до проведения инкассации.
    const mainWarehouseStore = stores.find((s) => s.isMainWarehouse);
    const centralCashUsd = mainWarehouseStore ? D(mainWarehouseStore.cashBalanceUsd) : D(0);

    const retailStores = stores.filter((s) => !s.isMainWarehouse);
    const retailStoresCash = retailStores.map((s) => ({
      id: s.id,
      name: s.name,
      isMainWarehouse: false,
      cashUsd: Number(s.cashBalanceUsd),
      cashTjs: Number(toTjs(s.cashBalanceUsd)),
      _cashUsd: D(s.cashBalanceUsd),
    }));

    const isSpecificStore = Boolean(storeId && storeId !== 'all');
    const selectedRetailStore = isSpecificStore ? retailStoresCash.find((s) => s.id === storeId) : null;

    // Total cash across the business:
    // If specific retail store selected: that store's uncollected cash
    // If all (Central): Central Cash + uncollected cash currently in all retail stores
    const totalCashUsd = selectedRetailStore
      ? selectedRetailStore._cashUsd
      : centralCashUsd.plus(retailStoresCash.reduce((sum, s) => sum.plus(s._cashUsd), D(0)));

    // 2. Stock Inventory by Cost Price
    const totalStockCount = inStockDevices.length;
    const totalStockCostUsd = inStockDevices.reduce((sum, d) => sum.plus(deviceCostUsd(d)), D(0));

    // Aggregate inventory by model
    const modelMap = new Map<string, {
      key: string;
      brand: string;
      model: string;
      storage?: string | null;
      color?: string | null;
      count: number;
      totalCostUsd: ReturnType<typeof D>;
      storesMap: Map<string, { storeId: string; storeName: string; count: number }>;
    }>();

    for (const d of inStockDevices) {
      const brand = d.brand || 'Не указан';
      const model = d.model || 'Модель';
      const storage = d.storage || null;
      const color = d.color || null;
      const key = `${brand}|${model}|${storage || ''}|${color || ''}`;
      const storeName = storeMap.get(d.storeId) || 'Склад';

      let entry = modelMap.get(key);
      if (!entry) {
        entry = {
          key,
          brand,
          model,
          storage,
          color,
          count: 0,
          totalCostUsd: D(0),
          storesMap: new Map(),
        };
        modelMap.set(key, entry);
      }
      entry.count += 1;
      entry.totalCostUsd = entry.totalCostUsd.plus(deviceCostUsd(d));

      const storeEntry = entry.storesMap.get(d.storeId) || { storeId: d.storeId, storeName, count: 0 };
      storeEntry.count += 1;
      entry.storesMap.set(d.storeId, storeEntry);
    }

    const models = Array.from(modelMap.values())
      .map((m) => {
        const roundedCostUsd = roundMoney(m.totalCostUsd);
        const avgCostUsd = m.count > 0 ? roundMoney(roundedCostUsd.div(m.count)) : D(0);
        return {
          key: m.key,
          brand: m.brand,
          model: m.model,
          storage: m.storage,
          color: m.color,
          count: m.count,
          avgCostUsd: Number(avgCostUsd),
          totalCostUsd: Number(roundedCostUsd),
          totalCostTjs: Number(toTjs(roundedCostUsd)),
          stores: Array.from(m.storesMap.values()),
        };
      })
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

    const items = inStockDevices.map((d) => {
      const costUsd = deviceCostUsd(d);
      return {
        id: d.id,
        brand: d.brand,
        model: d.model,
        storage: d.storage,
        color: d.color,
        imei: d.imei,
        costBasisUsd: Number(costUsd),
        costBasisTjs: Number(toTjs(costUsd)),
        retailPriceTjs: Number(d.retailPriceTjs || 0),
        storeId: d.storeId,
        storeName: storeMap.get(d.storeId) || 'Склад',
      };
    });

    // 3. Supplier Debt
    const totalSupplierDebtUsd = suppliersWithDebt.reduce((sum, s) => sum.plus(s.totalDebtUsd), D(0));

    // 4. Customer Debt (all debtors, not just the listed top 50)
    const totalCustomerDebtTjs = D(customerDebtTotals._sum.totalDebtTjs ?? 0);

    return {
      exchangeRate: rate ? Number(rate) : null,
      cash: {
        totalUsd: Number(roundMoney(totalCashUsd)),
        totalTjs: Number(toTjs(totalCashUsd)),
        central: {
          id: mainWarehouseStore?.id || 'central',
          name: 'Центральная касса',
          cashUsd: Number(roundMoney(centralCashUsd)),
          cashTjs: Number(toTjs(centralCashUsd)),
        },
        stores: (selectedRetailStore ? [selectedRetailStore] : retailStoresCash).map(({ _cashUsd, ...s }) => s),
      },
      inventory: {
        totalCount: totalStockCount,
        totalCostUsd: Number(roundMoney(totalStockCostUsd)),
        totalCostTjs: Number(toTjs(totalStockCostUsd)),
        models,
        items,
      },
      suppliers: {
        totalDebtUsd: Number(roundMoney(totalSupplierDebtUsd)),
        totalDebtTjs: Number(toTjs(totalSupplierDebtUsd)),
        debtorsCount: suppliersWithDebt.length,
        suppliers: suppliersWithDebt.map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          totalDebtUsd: Number(s.totalDebtUsd),
          totalDebtTjs: Number(toTjs(s.totalDebtUsd)),
        })),
      },
      customers: {
        totalDebtTjs: Number(roundMoney(totalCustomerDebtTjs)),
        totalDebtUsd: Number(toUsd(totalCustomerDebtTjs)),
        debtorsCount: customerDebtTotals._count._all,
        debtors: customerDebtors.map((c) => ({
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
