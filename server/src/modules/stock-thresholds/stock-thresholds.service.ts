import { prisma } from '../../prisma/prisma.service';

export interface UpsertThresholdInput {
  storeId: string;
  brand: string;
  model: string;
  storage: string;
  minQuantity: number;
}

export class StockThresholdsService {
  static async getThresholds(storeId?: string) {
    if (storeId) {
      return prisma.stockThreshold.findMany({
        where: { storeId },
        orderBy: [{ brand: 'asc' }, { model: 'asc' }, { storage: 'asc' }],
      });
    }
    return prisma.stockThreshold.findMany({
      orderBy: [{ brand: 'asc' }, { model: 'asc' }, { storage: 'asc' }],
    });
  }

  static async upsertThreshold(input: UpsertThresholdInput) {
    const brand = input.brand.trim();
    const model = input.model.trim();
    const storage = (input.storage || 'ALL').trim();
    const minQuantity = Math.max(0, Math.floor(Number(input.minQuantity) || 0));

    return prisma.stockThreshold.upsert({
      where: {
        storeId_brand_model_storage: {
          storeId: input.storeId,
          brand,
          model,
          storage,
        },
      },
      update: {
        minQuantity,
      },
      create: {
        storeId: input.storeId,
        brand,
        model,
        storage,
        minQuantity,
      },
    });
  }

  static async batchUpsertThresholds(storeId: string, items: Array<{ brand: string; model: string; storage: string; minQuantity: number }>) {
    return prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of items) {
        const brand = item.brand.trim();
        const model = item.model.trim();
        const storage = (item.storage || 'ALL').trim();
        const minQuantity = Math.max(0, Math.floor(Number(item.minQuantity) || 0));

        const updated = await tx.stockThreshold.upsert({
          where: {
            storeId_brand_model_storage: {
              storeId,
              brand,
              model,
              storage,
            },
          },
          update: { minQuantity },
          create: {
            storeId,
            brand,
            model,
            storage,
            minQuantity,
          },
        });
        results.push(updated);
      }
      return results;
    });
  }

  static async deleteThreshold(id: string) {
    return prisma.stockThreshold.delete({
      where: { id },
    });
  }
}
