import 'dotenv/config';
import assert from 'node:assert/strict';
const schema = process.env.REVIEW_SCHEMA;
assert(schema && /^project_review_\d+$/.test(schema));
const url = new URL(process.env.DATABASE_URL!);
assert(['localhost', '127.0.0.1'].includes(url.hostname));
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
const { prisma } = await import('../server/src/prisma/prisma.service');
const { createCashReceipt, cancelFinancialTransaction } = await import('../server/src/modules/finance/finance.service');
const { computeAccountStatement, computeIncomeExpenseReport, computeReportsSummary } = await import('../server/src/modules/reports/reports.service');
const { createExpenseStandalone, deleteExpense } = await import('../server/src/modules/expenses/expenses.service');
const { OwnersService } = await import('../server/src/modules/owners/owners.service');
const { SuppliersService } = await import('../server/src/modules/suppliers/suppliers.service');
try {
  const account = await prisma.financialAccount.create({ data: { name: 'Audit report account', type: 'MAIN' } });
  const receipt = await createCashReceipt({ accountId: account.id, amount: 100, currency: 'TJS', description: 'Audit cancel receipt', categoryName: 'Audit cancelled receipt', createdByUserId: 'user-admin' });
  await cancelFinancialTransaction(receipt.id, 'user-admin');
  const statement = await computeAccountStatement({ accountId: account.id, period: 'ALL' });
  const categories = await computeIncomeExpenseReport({ period: 'ALL' });
  console.log('CANCELLED_RECEIPT_REPORT', JSON.stringify({ opening: statement.openingBalanceTjs, closing: statement.closingBalanceTjs, movements: statement.rows.map(r => r.signedAmount), expenseCategory: categories.expense.find(c => c.categoryName === 'Audit cancelled receipt') }));
  const historicAccount = await prisma.financialAccount.create({ data: { name: 'Audit historic account', type: 'MAIN' } });
  const historic = await createCashReceipt({ accountId: historicAccount.id, amount: 100, currency: 'TJS', description: 'August receipt', categoryName: 'Audit historic', createdByUserId: 'user-admin' });
  await prisma.financialTransaction.update({ where: { id: historic.id }, data: { transactionDate: new Date('2026-08-15T12:00:00Z') } });
  await createCashReceipt({ accountId: historicAccount.id, amount: 200, currency: 'TJS', description: 'September receipt', categoryName: 'Audit historic', createdByUserId: 'user-admin' });
  const august = await computeAccountStatement({ accountId: historicAccount.id, period: 'SPECIFIC_MONTH', month: '2026-08' });
  console.log('HISTORICAL_STATEMENT', JSON.stringify({ expectedOpening: 0, expectedClosing: 100, actualOpening: august.openingBalanceTjs, actualClosing: august.closingBalanceTjs }));
  const shares = (first: number) => OwnersService.updateProfitShares([{ ownerId: 'owner-admin', sharePercent: first }, { ownerId: 'owner-partner', sharePercent: 100 - first }], 'user-admin');
  const owners = () => prisma.owner.findMany({ orderBy: { id: 'asc' }, select: { id: true, availableProfitUsd: true } });
  await shares(60);
  // Independent fixture: prior E2E expenses must not obscure allocation reversal.
  await prisma.owner.updateMany({ data: { availableProfitUsd: 100, totalAccruedProfitUsd: 100 } });
  const beforeBonus = await owners();
  const bonus = await SuppliersService.createBonus({ supplierId: 'sup-dubai', bonusType: 'CASH_DISCOUNT', amountUsd: 100, campaignTitle: 'Audit share change', createdByUserId: 'user-admin' });
  const afterBonus = await owners();
  await shares(50);
  let deletion: unknown;
  try { deletion = await SuppliersService.deleteBonus(bonus.id, 'user-admin'); } catch (error) { deletion = (error as Error).message; }
  console.log('BONUS_AFTER_SHARE_CHANGE', JSON.stringify({ beforeBonus, afterBonus, deletion, afterDelete: await owners() }));
  await shares(50);
  const summaryBefore = await computeReportsSummary({ period: 'ALL' });
  await shares(60);
  const beforeExpenseOwners = await owners();
  const expense = await createExpenseStandalone({ category: 'OTHER', amountTjs: 105, targetType: 'BUSINESS', paidFromCashRegister: false, createdByUserId: 'user-admin' });
  await shares(50);
  await deleteExpense(expense.id, 'user-admin');
  const summaryAfter = await computeReportsSummary({ period: 'ALL' });
  console.log('CANCELLED_EXPENSE_SUMMARY', JSON.stringify({ before: summaryBefore.expensesTjs, after: summaryAfter.expensesTjs, delta: summaryAfter.expensesTjs - summaryBefore.expensesTjs, beforeOwners: beforeExpenseOwners, afterOwners: await owners() }));
} finally { await prisma.$disconnect(); }
