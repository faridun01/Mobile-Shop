import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';

export interface PaySupplierInput {
  supplierId: string;
  amountUsd: number;
  sourceAccount: 'MAIN_ACCOUNT' | 'STORE_CASH';
  storeId?: string;
  note?: string;
  createdByUserId: string;
}

export interface SupplierBonusInput {
  supplierId: string;
  campaignTitle?: string;
  bonusType: 'FREE_DEVICES' | 'CASH_DISCOUNT';
  amountUsd?: number;
  freeDevices?: { brand: string; model: string; storage: string; color: string; imei: string; costBasisUsd: number }[];
  destinationStoreId?: string;
  createdByUserId: string;
}

export class SuppliersService {
  public static async create(input: { name: string; phone?: string; contactPerson?: string }) {
    const name = input.name?.trim();
    if (!name) throw new Error('Укажите название поставщика');
    return prisma.supplier.create({ data: { name, phone: input.phone, contactPerson: input.contactPerson } });
  }

  /** FIFO allocation across the supplier's open invoices, oldest first. */
  public static async pay(input: PaySupplierInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new Error('Поставщик не найден');

      const openInvoices = await tx.supplierInvoice.findMany({
        where: { supplierId: input.supplierId },
        orderBy: { date: 'asc' },
      });

      let remainingToPay = input.amountUsd;
      const allocations: { invoiceId: string; invoiceNumber: string; allocatedAmountUsd: number }[] = [];

      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: input.supplierId,
          amountUsd: input.amountUsd,
          sourceAccount: input.sourceAccount,
          storeId: input.storeId,
          createdByUserId: actor.id,
        },
      });

      for (const invoice of openInvoices) {
        if (remainingToPay <= 0) break;
        const remainingOnInvoice = invoice.totalAmountUsd - invoice.paidAmountUsd;
        if (remainingOnInvoice <= 0) continue;

        const payForThis = Math.min(remainingOnInvoice, remainingToPay);
        await tx.supplierInvoice.update({ where: { id: invoice.id }, data: { paidAmountUsd: { increment: payForThis } } });
        await tx.supplierPaymentAllocation.create({
          data: { paymentId: payment.id, invoiceId: invoice.id, allocatedAmountUsd: payForThis },
        });
        allocations.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, allocatedAmountUsd: payForThis });
        remainingToPay -= payForThis;
      }

      await tx.supplier.update({
        where: { id: input.supplierId },
        data: {
          totalPaidUsd: { increment: input.amountUsd },
          totalDebtUsd: Math.max(0, supplier.totalDebtUsd - input.amountUsd),
        },
      });

      let store = null;
      if (input.sourceAccount === 'STORE_CASH' && input.storeId) {
        store = await tx.store.findUnique({ where: { id: input.storeId } });
        if (store) {
          // amountUsd was collected in USD terms but store registers hold TJS; convert via today's rate if available.
          const today = new Date().toISOString().split('T')[0];
          const rate = (await tx.exchangeRate.findUnique({ where: { date: today } }))?.rate ?? 9.5;
          await tx.store.update({ where: { id: input.storeId }, data: { cashBalanceTjs: { decrement: input.amountUsd * rate } } });
        }
      }

      await tx.ledgerEntry.create({
        data: {
          type: 'SUPPLIER_PAYMENT',
          description: `Выплата поставщику ${supplier.name}: $${input.amountUsd}`,
          amountUsd: -input.amountUsd,
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
          action: 'SUPPLIER_PAYMENT',
          details: `Проведена оплата поставщику ${supplier.name} на сумму $${input.amountUsd}. Распределено по FIFO: ${allocations
            .map((a) => `${a.invoiceNumber} ($${a.allocatedAmountUsd})`)
            .join(', ')}`,
          financialDetails: { amountUsd: input.amountUsd },
          targetId: payment.id,
        },
      });

      return { payment, allocations };
    });
  }

  public static async createBonus(input: SupplierBonusInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new Error('Поставщик не найден');

      const bonus = await tx.supplierBonus.create({
        data: {
          supplierId: input.supplierId,
          campaignTitle: input.campaignTitle,
          bonusType: input.bonusType,
          amountUsd: input.amountUsd,
          status: 'IN_STOCK',
        },
      });

      if (input.bonusType === 'FREE_DEVICES' && input.freeDevices?.length) {
        const imeis = input.freeDevices.map((d) => d.imei);
        const existing = await tx.device.findFirst({ where: { OR: imeis.flatMap((imei) => [{ imei }, { imei2: imei }]) } });
        if (existing) throw new Error(`IMEI ${existing.imei} уже зарегистрирован`);

        const targetStatus = input.destinationStoreId ? ('STORE_STOCK' as const) : ('MAIN_WAREHOUSE' as const);
        const storeId = input.destinationStoreId ?? 'main-warehouse';

        for (const device of input.freeDevices) {
          const created = await tx.device.create({
            data: {
              imei: device.imei,
              brand: device.brand,
              model: device.model,
              storage: device.storage,
              color: device.color,
              status: targetStatus,
              storeId,
              purchasePriceUsd: 0,
              costBasisUsd: device.costBasisUsd,
              isBonus: true,
              bonusCampaign: input.campaignTitle,
              supplierId: input.supplierId,
              supplierName: supplier.name,
              timeline: { create: [{ type: 'BONUS', description: `Бонусное устройство от ${supplier.name}`, userName: actor.name }] },
            },
          });
          await tx.supplierBonusDevice.create({
            data: { bonusId: bonus.id, deviceId: created.id, brand: device.brand, model: device.model, storage: device.storage, color: device.color, imei: device.imei, costBasisUsd: device.costBasisUsd },
          });
        }
      } else if (input.bonusType === 'CASH_DISCOUNT' && input.amountUsd) {
        const owners = await tx.owner.findMany();
        for (const owner of owners) {
          const delta = Number((input.amountUsd * (owner.profitSharePercent / 100)).toFixed(2));
          await tx.owner.update({
            where: { id: owner.id },
            data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
          });
        }
        await tx.ledgerEntry.create({
          data: {
            type: 'SUPPLIER_BONUS',
            description: `Денежный бонус от ${supplier.name}: +$${input.amountUsd}`,
            amountUsd: input.amountUsd,
            userName: actor.name,
            referenceId: bonus.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'SUPPLIER_BONUS',
          details: `Зафиксирован бонус от ${supplier.name}${input.amountUsd ? `: $${input.amountUsd}` : ''}`,
          targetId: bonus.id,
        },
      });

      return bonus;
    });
  }
  public static async update(id: string, input: { name?: string; phone?: string; contactPerson?: string }) {
    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.phone !== undefined) data.phone = input.phone.trim() || null;
    if (input.contactPerson !== undefined) data.contactPerson = input.contactPerson.trim() || null;

    return prisma.supplier.update({
      where: { id },
      data,
    });
  }

  public static async delete(id: string) {
    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id } });
      if (!supplier) throw new Error('Поставщик не найден');

      // Delete allocations, payments, bonus devices, bonuses, group items, devices, and invoices
      const payments = await tx.supplierPayment.findMany({ where: { supplierId: id } });
      const paymentIds = payments.map((p) => p.id);
      if (paymentIds.length > 0) {
        await tx.supplierPaymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
        await tx.supplierPayment.deleteMany({ where: { supplierId: id } });
      }

      const bonuses = await tx.supplierBonus.findMany({ where: { supplierId: id } });
      const bonusIds = bonuses.map((b) => b.id);
      if (bonusIds.length > 0) {
        await tx.supplierBonusDevice.deleteMany({ where: { bonusId: { in: bonusIds } } });
        await tx.supplierBonus.deleteMany({ where: { supplierId: id } });
      }

      const invoices = await tx.supplierInvoice.findMany({ where: { supplierId: id } });
      const invoiceIds = invoices.map((i) => i.id);
      if (invoiceIds.length > 0) {
        await tx.invoiceGroup.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      }

      await tx.device.deleteMany({ where: { supplierId: id } });
      await tx.supplierInvoice.deleteMany({ where: { supplierId: id } });
      return tx.supplier.delete({ where: { id } });
    });
  }

  public static async updateInvoice(id: string, input: { invoiceNumber?: string; date?: string; totalAmountUsd?: number }) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.findUnique({ where: { id } });
      if (!invoice) throw new Error('Накладная не найдена');

      const data: any = {};
      if (input.invoiceNumber !== undefined && input.invoiceNumber.trim()) {
        data.invoiceNumber = input.invoiceNumber.trim();
      }
      if (input.date !== undefined) {
        data.date = new Date(input.date);
      }

      if (input.totalAmountUsd !== undefined && Number(input.totalAmountUsd) >= 0) {
        const oldTotal = invoice.totalAmountUsd;
        const newTotal = Number(input.totalAmountUsd);
        const diff = newTotal - oldTotal;

        data.totalAmountUsd = newTotal;

        if (diff !== 0) {
          await tx.supplier.update({
            where: { id: invoice.supplierId },
            data: {
              totalPurchasedUsd: { increment: diff },
              totalDebtUsd: { increment: diff },
            },
          });
        }
      }

      const updated = await tx.supplierInvoice.update({
        where: { id },
        data,
      });

      if (input.invoiceNumber && input.invoiceNumber.trim() !== invoice.invoiceNumber) {
        await tx.device.updateMany({
          where: { purchaseInvoiceId: id },
          data: { invoiceNumber: input.invoiceNumber.trim() },
        });
      }

      return updated;
    });
  }

  public static async deleteInvoice(id: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.findUnique({ where: { id } });
      if (!invoice) throw new Error('Накладная не найдена');

      const remainingDebtOnInvoice = invoice.totalAmountUsd - invoice.paidAmountUsd;

      await tx.invoiceGroup.deleteMany({ where: { invoiceId: id } });
      await tx.supplierPaymentAllocation.deleteMany({ where: { invoiceId: id } });
      await tx.device.deleteMany({ where: { purchaseInvoiceId: id } });

      await tx.supplier.update({
        where: { id: invoice.supplierId },
        data: {
          totalPurchasedUsd: Math.max(0, (await tx.supplier.findUnique({ where: { id: invoice.supplierId } }))!.totalPurchasedUsd - invoice.totalAmountUsd),
          totalDebtUsd: Math.max(0, (await tx.supplier.findUnique({ where: { id: invoice.supplierId } }))!.totalDebtUsd - remainingDebtOnInvoice),
        },
      });

      return tx.supplierInvoice.delete({ where: { id } });
    });
  }
}
