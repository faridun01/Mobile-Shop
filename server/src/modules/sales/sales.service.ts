import { prisma } from '../../prisma/prisma.service';

export interface CreateSaleInput {
  storeId: string;
  userId: string;
  items: { deviceId: string; salePriceTjs: number }[];
  paymentMethod: 'CASH' | 'CARD' | 'MIXED';
  cashAmountTjs: number;
  cardAmountTjs: number;
  customerName?: string;
  tradeInImei?: string;
  tradeInValueTjs?: number;
}

export class SalesService {
  /**
   * Atomic Sale Execution using PostgreSQL Prisma Transaction.
   * Guarantees:
   * 1. Check all devices are IN_STOCK.
   * 2. Update device status to SOLD.
   * 3. Create Sale record and SaleItems.
   * 4. Post Double-Entry Ledger transactions (Debit Cash/Card, Credit Inventory/Revenue).
   * 5. Record AuditLog entry.
   */
  public static async executeSale(input: CreateSaleInput) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch & Verify Device Availability
      const deviceIds = input.items.map((i) => i.deviceId);
      const devices = await tx.device.findMany({
        where: { id: { in: deviceIds }, storeId: input.storeId, status: 'IN_STOCK' },
      });

      if (devices.length !== deviceIds.length) {
        throw new Error('One or more selected devices are no longer in stock or invalid for this store.');
      }

      // 2. Calculate Totals
      const totalAmountTjs = input.items.reduce((sum, item) => sum + item.salePriceTjs, 0);

      // 3. Create Sale Record
      const sale = await tx.sale.create({
        data: {
          storeId: input.storeId,
          userId: input.userId,
          totalAmountTjs,
          cashAmountTjs: input.cashAmountTjs,
          cardAmountTjs: input.cardAmountTjs,
          paymentMethod: input.paymentMethod,
          customerName: input.customerName,
          exchangeTradeInImei: input.tradeInImei,
          exchangeValueTjs: input.tradeInValueTjs,
          saleItems: {
            create: input.items.map((item) => ({
              deviceId: item.deviceId,
              salePriceTjs: item.salePriceTjs,
            })),
          },
        },
        include: { saleItems: true },
      });

      // 4. Update Device Statuses to SOLD
      await tx.device.updateMany({
        where: { id: { in: deviceIds } },
        data: { status: 'SOLD' },
      });

      // 5. Post Double-Entry Ledger Record
      await tx.ledgerEntry.create({
        data: {
          debitAccount: input.paymentMethod === 'CASH' ? 'CASH_REGISTER' : 'BANK_CARD',
          creditAccount: 'SALES_REVENUE',
          amountTjs: totalAmountTjs,
          description: `Sale Receipt #${sale.receiptNumber} (${devices.length} items)`,
          referenceId: sale.id,
        },
      });

      // 6. Record Audit Log
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'CREATE_SALE',
          details: `Processed sale #${sale.receiptNumber} total ${totalAmountTjs} TJS for ${devices.length} devices.`,
        },
      });

      return sale;
    });
  }
}
