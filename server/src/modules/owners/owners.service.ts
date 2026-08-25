import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';

export class OwnersService {
  public static async investment(ownerId: string, amountUsd: number, destination: string, note: string | undefined, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');

      const updated = await tx.owner.update({ where: { id: ownerId }, data: { capitalBalanceUsd: { increment: amountUsd } } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'INVESTMENT', amountUsd, sourceOrDestination: destination, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_INVESTMENT', description: `${owner.name} вложил $${amountUsd} в капитал (${destination})`, amountUsd, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_INVESTMENT', details: `${owner.name} вложил $${amountUsd} в капитал (${destination})`, financialDetails: { amountUsd } },
      });
      return updated;
    });
  }

  public static async withdrawal(ownerId: string, amountUsd: number, source: string, note: string | undefined, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      if (owner.capitalBalanceUsd < amountUsd) throw new Error('Сумма изъятия превышает текущий капитал');

      const updated = await tx.owner.update({ where: { id: ownerId }, data: { capitalBalanceUsd: { decrement: amountUsd } } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'WITHDRAWAL', amountUsd, sourceOrDestination: source, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_CAPITAL_WITHDRAWAL', description: `${owner.name} изъял $${amountUsd} из капитала`, amountUsd: -amountUsd, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_WITHDRAWAL', details: `${owner.name} изъял $${amountUsd} из капитала`, financialDetails: { amountUsd } },
      });
      return updated;
    });
  }

  public static async payout(ownerId: string, amountUsd: number, source: string, note: string | undefined, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      if (owner.availableProfitUsd < amountUsd) throw new Error('Сумма выплаты превышает доступную прибыль');

      const updated = await tx.owner.update({
        where: { id: ownerId },
        data: { totalPaidProfitUsd: { increment: amountUsd }, availableProfitUsd: { decrement: amountUsd } },
      });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'PROFIT_PAYOUT', amountUsd, sourceOrDestination: source, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_PROFIT_PAYOUT', description: `Выплачена прибыль ${owner.name}: $${amountUsd}`, amountUsd: -amountUsd, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'PROFIT_PAYOUT', details: `Выплачена прибыль ${owner.name}: $${amountUsd}`, financialDetails: { amountUsd } },
      });
      return updated;
    });
  }

  public static async reinvest(ownerId: string, amountUsd: number, note: string | undefined, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      if (owner.availableProfitUsd < amountUsd) throw new Error('Сумма реинвестирования превышает доступную прибыль');

      const updated = await tx.owner.update({
        where: { id: ownerId },
        data: { availableProfitUsd: { decrement: amountUsd }, totalReinvestedUsd: { increment: amountUsd }, capitalBalanceUsd: { increment: amountUsd } },
      });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'REINVEST', amountUsd, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_REINVESTMENT', description: `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал`, amountUsd, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'REINVEST', details: `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал`, financialDetails: { amountUsd } },
      });
      return updated;
    });
  }

  public static async updateProfitShares(shares: { ownerId: string; sharePercent: number }[], userId: string) {
    const total = shares.reduce((sum, s) => sum + s.sharePercent, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new Error(`Сумма долей должна равняться 100% (сейчас ${total}%)`);
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      for (const s of shares) {
        await tx.owner.update({ where: { id: s.ownerId }, data: { profitSharePercent: s.sharePercent } });
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'PROFIT_SHARE_CHANGE',
          details: `Изменены доли партнеров: ${shares.map((s) => `${s.sharePercent}%`).join(', ')}`,
        },
      });
      return tx.owner.findMany();
    });
  }

  public static async closeQuarter(quarterName: string, transferRemainingToCapital: boolean, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owners = await tx.owner.findMany();

      // Snapshot the pre-close figures so quarterly history survives the reset below —
      // the original mock logic zeroed these counters with no historical record at all.
      const snapshot = owners.map((o) => ({
        ownerId: o.id,
        name: o.name,
        capitalBalanceUsd: o.capitalBalanceUsd,
        totalAccruedProfitUsd: o.totalAccruedProfitUsd,
        totalPaidProfitUsd: o.totalPaidProfitUsd,
        availableProfitUsd: o.availableProfitUsd,
      }));
      await tx.quarterClosure.create({ data: { quarterName, closedByUserId: actor.id, snapshot } });

      for (const owner of owners) {
        const remaining = owner.availableProfitUsd || 0;
        await tx.owner.update({
          where: { id: owner.id },
          data: {
            capitalBalanceUsd: transferRemainingToCapital ? { increment: remaining } : undefined,
            totalReinvestedUsd: transferRemainingToCapital ? { increment: remaining } : undefined,
            availableProfitUsd: transferRemainingToCapital ? 0 : undefined,
            totalAccruedProfitUsd: 0,
            totalPaidProfitUsd: 0,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'QUARTER_CLOSE',
          details: `Закрыт квартальный период (${quarterName})${transferRemainingToCapital ? ', остаток зачислен в капитал' : ''}, обнулены начисления квартала`,
        },
      });

      return tx.owner.findMany();
    });
  }

  public static async resetAllCapital(userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      await tx.owner.updateMany({
        data: { capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
      });
      await tx.ownerTransaction.deleteMany({});
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNERS_CAPITAL_RESET', details: 'Капитал и история операций всех партнеров обнулены ($0 USD / 0 TJS)' },
      });
      return tx.owner.findMany();
    });
  }
}
