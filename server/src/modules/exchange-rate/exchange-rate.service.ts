import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { getBusinessDateKey } from '../../common/business-date';
export { getBusinessDateKey } from '../../common/business-date';

export async function getRateForDate(date: Date): Promise<number | null> {
  const rate = await prisma.exchangeRate.findUnique({ where: { date: getBusinessDateKey(date) } });
  return rate?.rate ?? null;
}

export async function requireTodayRate(
  db: Pick<TransactionClient, 'exchangeRate'> = prisma,
): Promise<number> {
  const rate = await db.exchangeRate.findUnique({ where: { date: getBusinessDateKey() } });
  if (!rate?.rate || rate.rate <= 0) {
    throw new Error('Сначала задайте курс USD/TJS на сегодня');
  }
  return rate.rate;
}

export async function setTodayRate(rate: number, userId: string) {
  const today = getBusinessDateKey();
  return prisma.exchangeRate.upsert({
    where: { date: today },
    update: { rate, updatedByUserId: userId, updatedAt: new Date() },
    create: { date: today, rate, createdByUserId: userId },
  });
}
