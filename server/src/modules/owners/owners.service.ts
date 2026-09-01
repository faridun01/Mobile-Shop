import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney, requireNonNegativeMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';

export class OwnersService {
  public static async investment(ownerId: string, amountUsd: number, destination: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма инвестиции');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const exchangeRate = await requireTodayRate(tx);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');

      const updated = await tx.owner.update({ where: { id: ownerId }, data: { capitalBalanceUsd: { increment: amountUsd } } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'INVESTMENT', amountUsd, exchangeRate, sourceOrDestination: destination, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_INVESTMENT', description: `${owner.name} вложил $${amountUsd} в капитал (${destination})`, amountUsd, exchangeRate, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_INVESTMENT', details: `${owner.name} вложил $${amountUsd} в капитал (${destination})`, financialDetails: { amountUsd, exchangeRate } },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async withdrawal(ownerId: string, amountUsd: number, source: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма изъятия');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const exchangeRate = await requireTodayRate(tx);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({ where: { id: ownerId, capitalBalanceUsd: { gte: amountUsd } }, data: { capitalBalanceUsd: { decrement: amountUsd } } });
      if (guard.count !== 1) throw new Error('Сумма изъятия превышает текущий капитал');
      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'WITHDRAWAL', amountUsd, exchangeRate, sourceOrDestination: source, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_CAPITAL_WITHDRAWAL', description: `${owner.name} изъял $${amountUsd} из капитала`, amountUsd: -amountUsd, exchangeRate, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_WITHDRAWAL', details: `${owner.name} изъял $${amountUsd} из капитала`, financialDetails: { amountUsd, exchangeRate } },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async payout(ownerId: string, amountUsd: number, source: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма выплаты');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const exchangeRate = await requireTodayRate(tx);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({
        where: { id: ownerId, availableProfitUsd: { gte: amountUsd } },
        data: { totalPaidProfitUsd: { increment: amountUsd }, availableProfitUsd: { decrement: amountUsd } },
      });
      if (guard.count !== 1) throw new Error('Сумма выплаты превышает доступную прибыль');
      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'PROFIT_PAYOUT', amountUsd, exchangeRate, sourceOrDestination: source, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_PROFIT_PAYOUT', description: `Выплачена прибыль ${owner.name}: $${amountUsd}`, amountUsd: -amountUsd, exchangeRate, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'PROFIT_PAYOUT', details: `Выплачена прибыль ${owner.name}: $${amountUsd}`, financialDetails: { amountUsd, exchangeRate } },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async reinvest(ownerId: string, amountUsd: number, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма реинвестирования');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const exchangeRate = await requireTodayRate(tx);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({
        where: { id: ownerId, availableProfitUsd: { gte: amountUsd } },
        data: { availableProfitUsd: { decrement: amountUsd }, totalReinvestedUsd: { increment: amountUsd }, capitalBalanceUsd: { increment: amountUsd } },
      });
      if (guard.count !== 1) throw new Error('Сумма реинвестирования превышает доступную прибыль');
      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'REINVEST', amountUsd, exchangeRate, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_REINVESTMENT', description: `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал`, amountUsd, exchangeRate, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'REINVEST', details: `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал`, financialDetails: { amountUsd, exchangeRate } },
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
        await Promise.all(owners.filter((owner) => (owner.availableProfitUsd || 0) > 0).map((owner) => {
          const remaining = owner.availableProfitUsd || 0;
          return tx.owner.update({
            where: { id: owner.id },
            data: {
              capitalBalanceUsd: { increment: remaining },
              totalReinvestedUsd: { increment: remaining },
              availableProfitUsd: 0,
            },
          });
        }));
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

    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
    const partnerUser = await prisma.user.findFirst({ where: { role: 'PARTNER' }, orderBy: { createdAt: 'asc' } });

    await prisma.owner.createMany({
      data: [
        { userId: adminUser?.id, name: adminUser?.name || 'Далер', profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
        { userId: partnerUser?.id, name: partnerUser?.name || 'Рустам', profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
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

  /**
   * Returns owners with their display name always resolved live from the linked
   * User account — never a manually-copied snapshot that can silently drift out of
   * sync with a rename. Any owner still missing a link (e.g. created before this
   * feature existed) is auto-linked here, best-effort, to an as-yet-unlinked
   * ADMIN/PARTNER account — so production data self-heals the first time this loads
   * instead of needing a manual database fix.
   */
  public static async listWithResolvedNames() {
    let owners = await prisma.owner.findMany({ include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } });

    const unlinked = owners.filter((o) => !o.userId);
    if (unlinked.length > 0) {
      const linkedUserIds = owners.filter((o) => o.userId).map((o) => o.userId as string);
      const candidates = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'PARTNER'] }, id: { notIn: linkedUserIds } },
        orderBy: { createdAt: 'asc' },
      });
      for (let i = 0; i < unlinked.length && i < candidates.length; i++) {
        const owner = unlinked[i];
        const user = candidates[i];
        await prisma.owner.update({ where: { id: owner.id }, data: { userId: user.id, name: user.name } });
      }
      if (candidates.length > 0) {
        owners = await prisma.owner.findMany({ include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } });
      }
    }

    return owners.map((o) => ({ ...o, name: o.user?.name ?? o.name }));
  }

  /** Explicitly (re)links an owner's capital record to a specific login account. */
  public static async linkUser(ownerId: string, targetUserId: string | null, actingUserId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');

      if (targetUserId) {
        const user = await tx.user.findUnique({ where: { id: targetUserId } });
        if (!user) throw new Error('Сотрудник не найден');
        const alreadyLinked = await tx.owner.findUnique({ where: { userId: targetUserId } });
        if (alreadyLinked && alreadyLinked.id !== ownerId) throw new Error(`Этот аккаунт уже привязан к владельцу "${alreadyLinked.name}"`);
        const updated = await tx.owner.update({ where: { id: ownerId }, data: { userId: targetUserId, name: user.name } });
        await tx.auditLog.create({
          data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_LINK_USER', details: `Владелец "${owner.name}" привязан к аккаунту "${user.name}" (${user.login})`, targetId: ownerId },
        });
        return updated;
      }

      const updated = await tx.owner.update({ where: { id: ownerId }, data: { userId: null } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_LINK_USER', details: `Владелец "${owner.name}" отвязан от аккаунта`, targetId: ownerId },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
