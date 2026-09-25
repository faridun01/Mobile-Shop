import { D, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { getBusinessDateKey } from '../../common/business-date';
export { getBusinessDateKey } from '../../common/business-date';

export async function getRateForDate(date: Date) {
  const rate = await prisma.exchangeRate.findUnique({ where: { date: getBusinessDateKey(date) } });
  return rate?.rate ?? null;
}

export async function requireTodayRate(
  db: Pick<TransactionClient, 'exchangeRate'> = prisma,
) {
  const rate = await db.exchangeRate.findUnique({ where: { date: getBusinessDateKey() } });
  if (!rate?.rate || D(rate.rate).lte(0)) {
    throw new Error('Сначала задайте курс USD/TJS на сегодня');
  }
  return rate.rate;
}

export async function setTodayRate(rate: MoneyInput, userId: string) {
  rate = D(rate).toDecimalPlaces(4);
  if (D(rate).lte(0) || D(rate).gt('999999.9999')) throw new Error('Укажите положительный курс с точностью до 4 знаков');
  const today = getBusinessDateKey();
  return prisma.exchangeRate.upsert({
    where: { date: today },
    update: { rate, updatedByUserId: userId, updatedAt: new Date() },
    create: { date: today, rate, createdByUserId: userId },
  });
}
