import { prisma } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

export function getBusinessDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export async function getRateForDate(date: Date): Promise<number | null> {
  const rate = await prisma.exchangeRate.findUnique({ where: { date: getBusinessDateKey(date) } });
  return rate?.rate ?? null;
}

export async function requireTodayRate(
  db: Pick<Prisma.TransactionClient, 'exchangeRate'> = prisma,
): Promise<number> {
  const rate = await db.exchangeRate.findUnique({ where: { date: getBusinessDateKey() } });
  if (!rate?.rate || rate.rate <= 0) {
    throw new Error('Сначала задайте курс USD/TJS на сегодня');
  }
  return rate.rate;
}

export async function setTodayRate(rate: number, userId: string) {
  const today = getBusinessDateKey();
  const existing = await prisma.exchangeRate.findUnique({ where: { date: today } });

  if (existing) {
    return prisma.exchangeRate.update({
      where: { date: today },
      data: { rate, updatedByUserId: userId, updatedAt: new Date() },
    });
  }

  return prisma.exchangeRate.create({
    data: { date: today, rate, createdByUserId: userId },
  });
}
