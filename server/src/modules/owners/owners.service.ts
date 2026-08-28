import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney, requireNonNegativeMoney } from '../../common/money';

export class OwnersService {
  public static async investment(ownerId: string, amountUsd: number, destination: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма инвестиции');
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
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async withdrawal(ownerId: string, amountUsd: number, source: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма изъятия');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({ where: { id: ownerId, capitalBalanceUsd: { gte: amountUsd } }, data: { capitalBalanceUsd: { decrement: amountUsd } } });
      if (guard.count !== 1) throw new Error('Сумма изъятия превышает текущий капитал');
      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'WITHDRAWAL', amountUsd, sourceOrDestination: source, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_CAPITAL_WITHDRAWAL', description: `${owner.name} изъял $${amountUsd} из капитала`, amountUsd: -amountUsd, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_WITHDRAWAL', details: `${owner.name} изъял $${amountUsd} из капитала`, financialDetails: { amountUsd } },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async payout(ownerId: string, amountUsd: number, source: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма выплаты');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({
        where: { id: ownerId, availableProfitUsd: { gte: amountUsd } },
        data: { totalPaidProfitUsd: { increment: amountUsd }, availableProfitUsd: { decrement: amountUsd } },
      });
      if (guard.count !== 1) throw new Error('Сумма выплаты превышает доступную прибыль');
      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'PROFIT_PAYOUT', amountUsd, sourceOrDestination: source, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_PROFIT_PAYOUT', description: `Выплачена прибыль ${owner.name}: $${amountUsd}`, amountUsd: -amountUsd, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'PROFIT_PAYOUT', details: `Выплачена прибыль ${owner.name}: $${amountUsd}`, financialDetails: { amountUsd } },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async reinvest(ownerId: string, amountUsd: number, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма реинвестирования');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({
        where: { id: ownerId, availableProfitUsd: { gte: amountUsd } },
        data: { availableProfitUsd: { decrement: amountUsd }, totalReinvestedUsd: { increment: amountUsd }, capitalBalanceUsd: { increment: amountUsd } },
      });
      if (guard.count !== 1) throw new Error('Сумма реинвестирования превышает доступную прибыль');
      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'REINVEST', amountUsd, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_REINVESTMENT', description: `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал`, amountUsd, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'REINVEST', details: `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал`, financialDetails: { amountUsd } },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async updateProfitShares(shares: { ownerId: string; sharePercent: number }[], userId: string) {
    if (!Array.isArray(shares) || shares.length === 0) throw new Error('Укажите доли владельцев');
    const normalized = shares.map((share) => ({
      ownerId: share.ownerId,
      sharePercent: requireNonNegativeMoney(share.sharePercent, 'Доля владельца'),
    }));
    if (new Set(normalized.map((share) => share.ownerId)).size !== normalized.length) throw new Error('Владелец не может быть указан дважды');
    const total = normalized.reduce((sum, s) => sum + s.sharePercent, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new Error(`Сумма долей должна равняться 100% (сейчас ${total}%)`);
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owners = await tx.owner.findMany({ select: { id: true } });
      const actualIds = new Set(owners.map((owner) => owner.id));
      if (normalized.length !== owners.length || normalized.some((share) => !actualIds.has(share.ownerId))) {
        throw new Error('Необходимо указать долю каждого владельца');
      }
      for (const s of normalized) {
        await tx.owner.update({ where: { id: s.ownerId }, data: { profitSharePercent: s.sharePercent } });
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'PROFIT_SHARE_CHANGE',
          details: `Изменены доли партнеров: ${normalized.map((s) => `${s.sharePercent}%`).join(', ')}`,
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

      // totalAccruedProfitUsd / totalPaidProfitUsd are lifetime counters — the same
      // fields drive the always-visible KPI cards on the main Owners dashboard, which
      // carry no "this quarter" qualifier. Closing a quarter must not zero them; only
      // the yet-unclaimed availableProfitUsd is affected, and only if the admin opts
      // to sweep it into capital instead of leaving it payable into next quarter.
      if (transferRemainingToCapital) {
        for (const owner of owners) {
          const remaining = owner.availableProfitUsd || 0;
          if (remaining <= 0) continue;
          await tx.owner.update({
            where: { id: owner.id },
            data: {
              capitalBalanceUsd: { increment: remaining },
              totalReinvestedUsd: { increment: remaining },
              availableProfitUsd: 0,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'QUARTER_CLOSE',
          details: `Закрыт квартальный период (${quarterName})${transferRemainingToCapital ? ', неполученный остаток прибыли зачислен в капитал' : ', неполученный остаток прибыли перенесён на следующий период'}`,
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

  public static async initializeDefaultOwners(userId?: string) {
    const existing = await prisma.owner.findMany();
    if (existing.length > 0) return existing;

    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { name: true } });
    const partnerUser = await prisma.user.findFirst({ where: { role: 'PARTNER' }, select: { name: true } });

    const owner1Name = adminUser?.name || 'Далер';
    const owner2Name = partnerUser?.name || 'Рустам';

    await prisma.owner.createMany({
      data: [
        { name: owner1Name, profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
        { name: owner2Name, profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
      ],
    });

    if (userId) {
      try {
        const actor = await resolveActor(prisma, userId);
        await prisma.auditLog.create({
          data: {
            userId: actor.id,
            userName: actor.name,
            userRole: actor.role,
            action: 'INITIALIZE_OWNERS',
            details: 'Инициализированы владельцы по умолчанию (50% / 50%)',
          },
        });
      } catch (e) {
        console.error(e);
      }
    }

    return prisma.owner.findMany();
  }
}
