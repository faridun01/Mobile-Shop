import { prisma } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { resolveActor } from '../../common/actor';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';

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
  const rate = (await getRateForDate(new Date())) ?? 9.5;
  const amountUsd = Number((input.amountTjs / rate).toFixed(2));
  const resolvedTargetType = input.targetType || (input.storeId ? 'STORE' : 'BUSINESS');

  const store = input.storeId ? await tx.store.findUnique({ where: { id: input.storeId } }) : null;
  const resolvedSource = input.sourceAccount || (input.paidFromCashRegister ? (store ? `Касса ${store.name}` : 'Касса') : 'Счет компании');
  const paidFromCashRegister = input.paidFromCashRegister ?? true;

  const expense = await tx.expense.create({
    data: {
      category: input.category,
      amountTjs: input.amountTjs,
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
    await tx.store.update({ where: { id: input.storeId }, data: { cashBalanceTjs: { decrement: input.amountTjs } } });
  }

  const owners = await tx.owner.findMany();
  for (const owner of owners) {
    const delta = Number((amountUsd * (owner.profitSharePercent / 100)).toFixed(2));
    await tx.owner.update({
      where: { id: owner.id },
      data: { totalAccruedProfitUsd: { decrement: delta }, availableProfitUsd: { decrement: delta } },
    });
  }

  await tx.ledgerEntry.create({
    data: {
      type: input.category === 'Зарплата' || input.category === 'SALARY' ? 'SALARY' : 'EXPENSE',
      description: input.comment || input.description || `Расход: ${input.category}`,
      amountTjs: -input.amountTjs,
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
      details: `Зарегистрирован расход [${input.category}]: ${input.amountTjs} TJS ($${amountUsd}) (${store?.name || 'Бизнес'})`,
      financialDetails: { amountTjs: input.amountTjs, amountUsd, exchangeRate: rate },
      targetId: expense.id,
    },
  });

  return expense;
}

export async function createExpenseStandalone(input: CreateExpenseInput) {
  return prisma.$transaction((tx) => createExpense(tx, input));
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
    const rate = existing.exchangeRate || (await getRateForDate(new Date())) || 9.5;

    const newAmountTjs = input.amountTjs !== undefined ? Number(input.amountTjs) : existing.amountTjs;
    const newAmountUsd = Number((newAmountTjs / rate).toFixed(2));
    const newCategory = input.category !== undefined ? input.category.trim() : existing.category;
    const newStoreId = input.storeId !== undefined ? input.storeId : existing.storeId;
    const newComment = input.comment !== undefined ? input.comment.trim() : existing.comment;
    const newDescription = input.description !== undefined ? input.description.trim() : existing.description;

    // Adjust store cash balance if amount or store changed
    const diffTjs = newAmountTjs - existing.amountTjs;
    if (existing.storeId && (existing.paidFromCashRegister || (existing.sourceAccount && existing.sourceAccount.toLowerCase().includes('касса')))) {
      await tx.store.update({
        where: { id: existing.storeId },
        data: { cashBalanceTjs: { increment: existing.amountTjs } },
      });
    }
    if (newStoreId && (existing.paidFromCashRegister || (existing.sourceAccount && existing.sourceAccount.toLowerCase().includes('касса')))) {
      await tx.store.update({
        where: { id: newStoreId },
        data: { cashBalanceTjs: { decrement: newAmountTjs } },
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
  });
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
  });
}
