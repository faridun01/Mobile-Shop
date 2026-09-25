import { D, decimalMin, decimalMax, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney, roundMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';
import { postTransaction, cancelTransaction, type LedgerCurrency, type CounterpartyType } from './financial-transaction.service';

export async function listAccounts() {
  return prisma.financialAccount.findMany({
    where: { active: true },
    include: { store: { select: { name: true } } },
    orderBy: { type: 'asc' },
  });
}

export async function listCategories() {
  return prisma.financialCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
}

export interface CreateCategoryInput {
  name: string;
  direction: 'IN' | 'OUT';
}

export async function createCategory(input: CreateCategoryInput) {
  const name = input.name?.trim();
  if (!name) throw new Error('Укажите название категории');
  if (!['IN', 'OUT'].includes(input.direction)) throw new Error('Некорректное направление категории');
  const existing = await prisma.financialCategory.findFirst({ where: { name } });
  if (existing) throw new Error(`Категория "${name}" уже существует`);
  return prisma.financialCategory.create({ data: { name, direction: input.direction, isSystem: false } });
}

/**
 * Idempotency (Stripe-style): the caller resends the same key on any retry of the same
 * logical attempt. Checking for an existing row up front handles the common case (the
 * first attempt already committed); `resolveIdempotentConflict` below handles the rare
 * true race where two concurrent requests with the same key both pass this check.
 */
async function findByIdempotencyKey(tx: TransactionClient, idempotencyKey: string | undefined) {
  if (!idempotencyKey) return null;
  return tx.financialTransaction.findUnique({ where: { idempotencyKey } });
}

/**
 * If a `prisma.$transaction` failed with a unique-constraint violation (P2002) and an
 * idempotency key was supplied, re-query for a row with that exact key and return it
 * instead of the error — this is the loser of a true concurrent-duplicate race, and the
 * winner's row is the correct response. Any other error (including a P2002 caused by
 * something unrelated, e.g. a concurrent double-cancel) is re-thrown unchanged.
 */
async function resolveIdempotentConflict(idempotencyKey: string | undefined, error: unknown) {
  if (idempotencyKey && error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002') {
    const existing = await prisma.financialTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }
  throw error;
}

async function resolveAccountOrThrow(tx: TransactionClient, accountId: string) {
  const account = await tx.financialAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.active) throw new Error('Счёт не найден или неактивен');
  return account;
}

/**
 * A per-store CASH account mirrors Store.cashBalanceTjs (see Phase 1: both are kept in
 * sync in the same transaction so they can never drift) — that mirrored field is TJS
 * only, so a manual entry against one can't be booked in USD.
 */
function assertAccountCurrency(account: { storeId: string | null; name: string }, currency: LedgerCurrency) {
  if (!['TJS', 'USD'].includes(currency)) throw new Error('Некорректная валюта операции');
  if (account.storeId && currency !== 'TJS') {
    throw new Error(`Касса "${account.name}" ведётся только в TJS — операции в USD не поддерживаются`);
  }
}

/** Mirrors a guarded balance movement onto Store.cashBalanceTjs when `account` is a per-store CASH account. */
async function syncStoreCashBalance(tx: TransactionClient, account: { storeId: string | null }, deltaTjs: MoneyInput, guard: boolean) {
  if (!account.storeId || D(deltaTjs).eq(0)) return;
  if (D(deltaTjs).lt(0) && guard) {
    const res = await tx.store.updateMany({ where: { id: account.storeId, cashBalanceTjs: { gte: D(deltaTjs).negated() } }, data: { cashBalanceTjs: { increment: deltaTjs } } });
    if (res.count !== 1) throw new Error('В кассе недостаточно наличных для этой операции');
  } else {
    await tx.store.update({ where: { id: account.storeId }, data: { cashBalanceTjs: { increment: deltaTjs } } });
  }
}

export interface ManualEntryInput {
  accountId: string;
  amount: MoneyInput;
  currency: LedgerCurrency;
  categoryId?: string;
  categoryName?: string;
  counterpartyType?: CounterpartyType;
  counterpartyId?: string;
  counterpartyName?: string;
  shopId?: string;
  description: string;
  comment?: string;
  createdByUserId: string;
  idempotencyKey?: string;
}

export async function createCashReceipt(input: ManualEntryInput) {
  const amount = requirePositiveMoney(input.amount, 'Сумма прихода');
  if (!input.description?.trim()) throw new Error('Укажите основание прихода');
  if (!input.categoryId && !input.categoryName) throw new Error('Укажите статью прихода');

  try {
    return await prisma.$transaction(async (tx) => {
    const existingByKey = await findByIdempotencyKey(tx, input.idempotencyKey);
    if (existingByKey) return existingByKey;

    const actor = await resolveActor(tx, input.createdByUserId);
    const account = await resolveAccountOrThrow(tx, input.accountId);
    assertAccountCurrency(account, input.currency);
    const rate = await requireTodayRate(tx);
    const amountTjs = input.currency === 'TJS' ? amount : roundMoney(D(amount).mul(rate));
    const amountUsd = input.currency === 'USD' ? amount : roundMoney(D(amount).div(rate));

    await syncStoreCashBalance(tx, account, amountTjs, false);

    const created = await postTransaction(tx, {
      type: 'INCOME',
      direction: 'IN',
      numberPrefix: 'CR',
      accountId: account.id,
      balanceCurrency: input.currency,
      amount,
      currency: input.currency,
      exchangeRate: rate,
      amountTjs,
      amountUsd,
      categoryId: input.categoryId,
      categoryName: input.categoryId ? undefined : input.categoryName,
      counterpartyType: input.counterpartyType,
      counterpartyId: input.counterpartyId,
      counterpartyName: input.counterpartyName,
      shopId: input.shopId ?? account.storeId ?? undefined,
      description: input.description.trim(),
      comment: input.comment?.trim() || undefined,
      createdByUserId: actor.id,
      idempotencyKey: input.idempotencyKey,
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'FINANCIAL_CASH_RECEIPT',
        details: `Приход ${created.transactionNumber}: ${amount} ${input.currency} на счёт "${account.name}". ${input.description}`,
        financialDetails: moneyJson({ amount, currency: input.currency, amountTjs, amountUsd }),
        targetId: created.id,
      },
    });

      return created;
    }, { maxWait: 10000, timeout: 25000 });
  } catch (error) {
    return resolveIdempotentConflict(input.idempotencyKey, error);
  }
}

export async function createCashExpense(input: ManualEntryInput) {
  const amount = requirePositiveMoney(input.amount, 'Сумма расхода');
  if (!input.description?.trim()) throw new Error('Укажите основание расхода');
  if (!input.categoryId && !input.categoryName) throw new Error('Укажите статью расхода');

  try {
    return await prisma.$transaction(async (tx) => {
    const existingByKey = await findByIdempotencyKey(tx, input.idempotencyKey);
    if (existingByKey) return existingByKey;

    const actor = await resolveActor(tx, input.createdByUserId);
    const account = await resolveAccountOrThrow(tx, input.accountId);
    assertAccountCurrency(account, input.currency);
    const rate = await requireTodayRate(tx);
    const amountTjs = input.currency === 'TJS' ? amount : roundMoney(D(amount).mul(rate));
    const amountUsd = input.currency === 'USD' ? amount : roundMoney(D(amount).div(rate));

    await syncStoreCashBalance(tx, account, D(amountTjs).negated(), true);

    const created = await postTransaction(tx, {
      type: 'EXPENSE',
      direction: 'OUT',
      numberPrefix: 'CE',
      accountId: account.id,
      balanceCurrency: input.currency,
      amount,
      currency: input.currency,
      exchangeRate: rate,
      amountTjs,
      amountUsd,
      categoryId: input.categoryId,
      categoryName: input.categoryId ? undefined : input.categoryName,
      counterpartyType: input.counterpartyType,
      counterpartyId: input.counterpartyId,
      counterpartyName: input.counterpartyName,
      shopId: input.shopId ?? account.storeId ?? undefined,
      description: input.description.trim(),
      comment: input.comment?.trim() || undefined,
      createdByUserId: actor.id,
      idempotencyKey: input.idempotencyKey,
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'FINANCIAL_CASH_EXPENSE',
        details: `Расход ${created.transactionNumber}: ${amount} ${input.currency} со счёта "${account.name}". ${input.description}`,
        financialDetails: moneyJson({ amount, currency: input.currency, amountTjs, amountUsd }),
        targetId: created.id,
      },
    });

      return created;
    }, { maxWait: 10000, timeout: 25000 });
  } catch (error) {
    return resolveIdempotentConflict(input.idempotencyKey, error);
  }
}

export interface CreateTransferInput {
  accountId: string;
  destinationAccountId: string;
  amount: MoneyInput;
  currency: LedgerCurrency;
  shopId?: string;
  description: string;
  comment?: string;
  createdByUserId: string;
  idempotencyKey?: string;
}

export async function createTransfer(input: CreateTransferInput) {
  const amount = requirePositiveMoney(input.amount, 'Сумма перевода');
  if (!input.description?.trim()) throw new Error('Укажите основание перевода');
  if (input.accountId === input.destinationAccountId) throw new Error('Счёт списания и счёт зачисления должны отличаться');

  try {
    return await prisma.$transaction(async (tx) => {
    const existingByKey = await findByIdempotencyKey(tx, input.idempotencyKey);
    if (existingByKey) return existingByKey;

    const actor = await resolveActor(tx, input.createdByUserId);
    const [source, destination] = await Promise.all([
      resolveAccountOrThrow(tx, input.accountId),
      resolveAccountOrThrow(tx, input.destinationAccountId),
    ]);
    assertAccountCurrency(source, input.currency);
    assertAccountCurrency(destination, input.currency);
    const rate = await requireTodayRate(tx);
    const amountTjs = input.currency === 'TJS' ? amount : roundMoney(D(amount).mul(rate));
    const amountUsd = input.currency === 'USD' ? amount : roundMoney(D(amount).div(rate));

    await syncStoreCashBalance(tx, source, D(amountTjs).negated(), true);
    await syncStoreCashBalance(tx, destination, amountTjs, false);

    const created = await postTransaction(tx, {
      type: 'TRANSFER',
      direction: 'NEUTRAL',
      numberPrefix: 'TR',
      accountId: source.id,
      destinationAccountId: destination.id,
      balanceCurrency: input.currency,
      amount,
      currency: input.currency,
      exchangeRate: rate,
      amountTjs,
      amountUsd,
      shopId: input.shopId ?? source.storeId ?? undefined,
      description: input.description.trim(),
      comment: input.comment?.trim() || undefined,
      createdByUserId: actor.id,
      idempotencyKey: input.idempotencyKey,
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'FINANCIAL_TRANSFER',
        details: `Перевод ${created.transactionNumber}: ${amount} ${input.currency} из "${source.name}" в "${destination.name}". ${input.description}`,
        financialDetails: moneyJson({ amount, currency: input.currency, amountTjs, amountUsd }),
        targetId: created.id,
      },
    });

      return created;
    }, { maxWait: 10000, timeout: 25000 });
  } catch (error) {
    return resolveIdempotentConflict(input.idempotencyKey, error);
  }
}

export async function cancelFinancialTransaction(transactionId: string, actorId: string, idempotencyKey?: string) {
  try {
    return await prisma.$transaction(async (tx) => {
    // Checked before the "already cancelled" guard below: retrying the same cancel
    // request (same key) must return the original reversal, not an error — only a
    // genuinely different request hitting an already-cancelled transaction should throw.
    const existingByKey = await findByIdempotencyKey(tx, idempotencyKey);
    if (existingByKey) return existingByKey;

    const existing = await tx.financialTransaction.findUnique({ where: { id: transactionId } });
    if (!existing) throw new Error('Операция не найдена');
    // Auto-generated rows (a sale, an expense, a supplier payment, ...) must be reversed
    // through their own document's flow (e.g. deleteExpense), never directly here — otherwise
    // the business document and the ledger could end up disagreeing about what happened.
    if (existing.sourceType) {
      throw new Error('Эта операция создана автоматически — отмените её через исходный документ (продажу, расход, оплату поставщику и т.д.)');
    }

    const actor = await resolveActor(tx, actorId);

    // Mirror the reversal onto Store.cashBalanceTjs too, same as every create-path above —
    // cancelTransaction() below only touches FinancialAccount, and a reversal must never be
    // blocked (matches its own guardBalance:false), so these are never guarded either.
    if (existing.balanceCurrency === 'TJS') {
      const account = await tx.financialAccount.findUnique({ where: { id: existing.accountId } });
      if (existing.type === 'TRANSFER') {
        const destinationAccount = existing.destinationAccountId
          ? await tx.financialAccount.findUnique({ where: { id: existing.destinationAccountId } })
          : null;
        if (account) await syncStoreCashBalance(tx, account, existing.amountTjs, false);
        if (destinationAccount) await syncStoreCashBalance(tx, destinationAccount, D(existing.amountTjs).negated(), false);
      } else if (account) {
        const reversalDeltaTjs = existing.direction === 'IN' ? D(existing.amountTjs).negated() : existing.amountTjs;
        await syncStoreCashBalance(tx, account, reversalDeltaTjs, false);
      }
    }

    const reversal = await cancelTransaction(tx, transactionId, actor.id, idempotencyKey);

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'FINANCIAL_TRANSACTION_CANCELLED',
        details: `Отменена операция ${existing.transactionNumber}: ${existing.description}`,
        financialDetails: moneyJson({ amountTjs: existing.amountTjs, amountUsd: existing.amountUsd }),
        targetId: existing.id,
      },
    });

      return reversal;
    }, { maxWait: 10000, timeout: 25000 });
  } catch (error) {
    return resolveIdempotentConflict(idempotencyKey, error);
  }
}

export interface ListTransactionsInput {
  cursor?: string;
  limit?: number;
  period?: ReportPeriod;
  month?: string;
  type?: string;
  accountId?: string;
  shopId?: string;
  categoryId?: string;
  counterpartyType?: string;
  counterpartyId?: string;
  currency?: string;
  status?: string;
  search?: string;
}

export async function listTransactions(input: ListTransactionsInput) {
  const limit = Math.min(Math.max(input.limit || 50, 1), 200);
  const dateRange = input.period ? dateRangeForPeriod(input.period, input.month) : undefined;

  // Built as an AND-array of independent conditions rather than one flat where-object,
  // since both the accountId filter and the search filter each need their own OR clause —
  // a plain object literal can't hold two separate `OR` keys.
  const conditions: any[] = [];
  if (dateRange) conditions.push({ transactionDate: dateRange });
  if (input.type) conditions.push({ type: input.type });
  if (input.accountId) conditions.push({ OR: [{ accountId: input.accountId }, { destinationAccountId: input.accountId }] });
  if (input.shopId) conditions.push({ shopId: input.shopId });
  if (input.categoryId) conditions.push({ categoryId: input.categoryId });
  if (input.counterpartyType) conditions.push({ counterpartyType: input.counterpartyType });
  if (input.counterpartyId) conditions.push({ counterpartyId: input.counterpartyId });
  if (input.currency) conditions.push({ currency: input.currency });
  if (input.status) conditions.push({ status: input.status });
  const search = input.search?.trim();
  if (search) {
    conditions.push({
      OR: [
        { transactionNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { comment: { contains: search, mode: 'insensitive' } },
        { counterpartyName: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const rows = await prisma.financialTransaction.findMany({
    where: conditions.length ? { AND: conditions } : {},
    take: limit,
    ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
    orderBy: { transactionDate: 'desc' },
    include: {
      account: { select: { name: true } },
      destinationAccount: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  return { rows, nextCursor };
}

export async function getTransactionById(id: string) {
  return prisma.financialTransaction.findUnique({
    where: { id },
    include: { account: true, destinationAccount: true, category: true },
  });
}
