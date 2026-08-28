import { prisma } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { resolveActor } from '../../common/actor';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { requirePositiveMoney, roundMoney } from '../../common/money';

export interface CreateExpenseInput {
  category: string;
  amountTjs: number;
  targetType?: 'STORE' | 'BUSINESS';
  storeId?: string;
  sourceAccount?: string;
  comment?: string;
  description?: string;
  paidFromCashRegister?: boolean;
  employeeId?: string;
  isEmployeeAdvance?: boolean;
  createdByUserId: string;
}

/** Runs inside a caller-supplied transaction so repair-cost bookings share one atomic unit. */
export async function createExpense(tx: Prisma.TransactionClient, input: CreateExpenseInput) {
  const actor = await resolveActor(tx, input.createdByUserId);
  const amountTjs = requirePositiveMoney(input.amountTjs, 'Сумма расхода');
  const rate = await getRateForDate(new Date());
  if (!rate) throw new Error('Сначала задайте курс валют на сегодня');
  const amountUsd = roundMoney(amountTjs / rate);
  const resolvedTargetType = input.targetType || (input.storeId ? 'STORE' : 'BUSINESS');

  const store = input.storeId ? await tx.store.findUnique({ where: { id: input.storeId } }) : null;
  const resolvedSource = input.sourceAccount || (input.paidFromCashRegister ? (store ? `Касса ${store.name}` : 'Касса') : 'Счет компании');
  const paidFromCashRegister = input.paidFromCashRegister ?? true;

  const expense = await tx.expense.create({
    data: {
      category: input.category,
      amountTjs,
      amountUsd,
      exchangeRate: rate,
      targetType: resolvedTargetType,
      storeId: input.storeId,
      sourceAccount: resolvedSource,
      comment: input.comment,
      description: input.description,
      createdByUserId: actor.id,
      paidFromCashRegister,
      employeeId: input.employeeId,
      isEmployeeAdvance: input.isEmployeeAdvance ?? false,
    },
  });

  if (input.storeId && store && (paidFromCashRegister || resolvedSource.toLowerCase().includes('касса'))) {
    if (store.isMainWarehouse) throw new Error('Главный склад не является торговой кассой');
    const cashGuard = await tx.store.updateMany({ where: { id: input.storeId, cashBalanceTjs: { gte: amountTjs } }, data: { cashBalanceTjs: { decrement: amountTjs } } });
    if (cashGuard.count !== 1) throw new Error('В кассе недостаточно наличных для расхода');
  }

  const owners = await tx.owner.findMany();
  if (owners.length > 0) {
    await Promise.all(
      owners.map(owner => {
        const delta = roundMoney(amountUsd * (owner.profitSharePercent / 100));
        return tx.owner.update({
          where: { id: owner.id },
          data: { totalAccruedProfitUsd: { decrement: delta }, availableProfitUsd: { decrement: delta } },
        });
      })
    );
  }

  await tx.ledgerEntry.create({
    data: {
      type: input.category === 'Зарплата' || input.category === 'SALARY' ? 'SALARY' : 'EXPENSE',
      description: input.comment || input.description || `Расход: ${input.category}`,
      amountTjs: -amountTjs,
      amountUsd: -amountUsd,
      exchangeRate: rate,
      storeId: input.storeId,
      storeName: store?.name,
      userName: actor.name,
      referenceId: expense.id,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: 'EXPENSE',
      details: `Зарегистрирован расход [${input.category}]: ${amountTjs} TJS ($${amountUsd}) (${store?.name || 'Бизнес'})`,
      financialDetails: { amountTjs, amountUsd, exchangeRate: rate },
      targetId: expense.id,
    },
  });

  return expense;
}

export async function createExpenseStandalone(input: CreateExpenseInput) {
  return prisma.$transaction((tx) => createExpense(tx, input), { maxWait: 10000, timeout: 25000 });
}

export async function updateExpense(
  id: string,
  input: {
    category?: string;
    amountTjs?: number;
    storeId?: string;
    comment?: string;
    description?: string;
  },
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({ where: { id } });
    if (!existing) throw new Error('Расход не найден');

    const actor = await resolveActor(tx, actorId);
    const rate = existing.exchangeRate || (await getRateForDate(new Date()));
    if (!rate) throw new Error('Не найден курс валют для пересчёта расхода');

    const newAmountTjs = input.amountTjs !== undefined ? requirePositiveMoney(input.amountTjs, 'Сумма расхода') : existing.amountTjs;
    const newAmountUsd = roundMoney(newAmountTjs / rate);
    const newCategory = input.category !== undefined ? input.category.trim() : existing.category;
    const newStoreId = input.storeId !== undefined ? input.storeId : existing.storeId;
    const newComment = input.comment !== undefined ? input.comment.trim() : existing.comment;
    const newDescription = input.description !== undefined ? input.description.trim() : existing.description;

    // Adjust store cash balance if amount or store changed
    if (existing.storeId && (existing.paidFromCashRegister || (existing.sourceAccount && existing.sourceAccount.toLowerCase().includes('касса')))) {
      await tx.store.update({
        where: { id: existing.storeId },
        data: { cashBalanceTjs: { increment: existing.amountTjs } },
      });
    }
    if (newStoreId && (existing.paidFromCashRegister || (existing.sourceAccount && existing.sourceAccount.toLowerCase().includes('касса')))) {
      const targetStore = await tx.store.findUnique({ where: { id: newStoreId }, select: { isMainWarehouse: true } });
      if (!targetStore || targetStore.isMainWarehouse) throw new Error('Главный склад не является торговой кассой');
      const cashGuard = await tx.store.updateMany({
        where: { id: newStoreId, cashBalanceTjs: { gte: newAmountTjs } },
        data: { cashBalanceTjs: { decrement: newAmountTjs } },
      });
      if (cashGuard.count !== 1) throw new Error('В кассе недостаточно наличных для расхода');
    }

    // Reverse the old amount's owner profit impact and re-apply it for the new amount —
    // an expense decrements owner profit at creation (see createExpense), so an edit that
    // changes the amount must roll that accrual forward too, or owner profit permanently
    // drifts from the actual expense total.
    const owners = await tx.owner.findMany();
    for (const owner of owners) {
      const share = owner.profitSharePercent / 100;
      const revertDelta = roundMoney((existing.amountUsd || 0) * share);
      const applyDelta = roundMoney(newAmountUsd * share);
      await tx.owner.update({
        where: { id: owner.id },
        data: {
          totalAccruedProfitUsd: { increment: revertDelta - applyDelta },
          availableProfitUsd: { increment: revertDelta - applyDelta },
        },
      });
    }

    const updated = await tx.expense.update({
      where: { id },
      data: {
        category: newCategory,
        amountTjs: newAmountTjs,
        amountUsd: newAmountUsd,
        storeId: newStoreId,
        comment: newComment,
        description: newDescription,
      },
    });

    // Update corresponding ledger entries
    await tx.ledgerEntry.updateMany({
      where: { referenceId: id },
      data: {
        amountTjs: -newAmountTjs,
        amountUsd: -newAmountUsd,
        description: newComment || newDescription || `Расход: ${newCategory}`,
        storeId: newStoreId,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'EXPENSE_EDIT',
        details: `Отредактирован расход [${newCategory}]: ${newAmountTjs} TJS ($${newAmountUsd})`,
        financialDetails: { amountTjs: newAmountTjs, amountUsd: newAmountUsd },
        targetId: id,
      },
    });

    return updated;
  }, { maxWait: 10000, timeout: 25000 });
}

export async function deleteExpense(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({ where: { id } });
    if (!existing) throw new Error('Расход не найден');

    const actor = await resolveActor(tx, actorId);

    // Revert store cash balance
    if (existing.storeId && (existing.paidFromCashRegister || (existing.sourceAccount && existing.sourceAccount.toLowerCase().includes('касса')))) {
      await tx.store.update({
        where: { id: existing.storeId },
        data: { cashBalanceTjs: { increment: existing.amountTjs } },
      });
    }

    // Reverse the profit impact this expense accrued against owners at creation time.
    const owners = await tx.owner.findMany();
    for (const owner of owners) {
      const delta = roundMoney((existing.amountUsd || 0) * (owner.profitSharePercent / 100));
      await tx.owner.update({
        where: { id: owner.id },
        data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
      });
    }

    // Delete corresponding ledger entries
    await tx.ledgerEntry.deleteMany({ where: { referenceId: id } });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'EXPENSE_DELETE',
        details: `Удален расход [${existing.category}]: ${existing.amountTjs} TJS ($${existing.amountUsd})`,
        financialDetails: { amountTjs: existing.amountTjs, amountUsd: existing.amountUsd },
        targetId: id,
      },
    });

    return tx.expense.delete({ where: { id } });
  }, { maxWait: 10000, timeout: 25000 });
}
