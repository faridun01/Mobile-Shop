import { prisma } from '../../prisma/prisma.service';

function dateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function getRateForDate(date: Date): Promise<number | null> {
  const rate = await prisma.exchangeRate.findUnique({ where: { date: dateKey(date) } });
  return rate?.rate ?? null;
}

export async function setTodayRate(rate: number, userId: string) {
  const today = dateKey(new Date());
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
