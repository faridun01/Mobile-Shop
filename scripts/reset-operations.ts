import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Starts the books over: removes every operation (stock, purchases, sales, exchanges, refunds,
 * transfers, repairs, expenses, payroll, owner transactions, ledgers, audit history, …) and sets
 * every balance to 0, while keeping the reference data the business is set up with:
 *   employees and their sessions, stores, partners and their per-store shares, ledger accounts,
 *   financial categories, suppliers, customers, exchange rates, the phone catalog (IMEI autofill),
 *   stock thresholds and push subscriptions.
 * Unlike db:clean, suppliers, customers, rates and the catalog survive. Id sequences restart, so
 * receipt numbers begin at 1 again. Take a backup first (scripts/backup-db.sh).
 *
 *   npm run db:reset-operations          show what would be removed
 *   npm run db:reset-operations:apply    remove it
 */
const KEEP = new Set([
  'User', 'AuthSession', 'PushSubscription', 'Store', 'Owner', 'StoreProfitShare', 'FinancialAccount',
  'FinancialCategory', 'Supplier', 'Customer', 'ExchangeRate', 'PhoneCatalog', 'StockThreshold',
]);
const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const models = Prisma.dmmf.datamodel.models.filter((model) => !KEEP.has(model.name));
  const tables = models.map((model) => model.dbName ?? model.name);
  const counts = await Promise.all(tables.map(async (table) => {
    const [row] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint AS count FROM "${table}"`);
    return { table, count: Number(row.count) };
  }));
  console.log('Будет очищено:');
  for (const { table, count } of counts.filter((c) => c.count > 0)) console.log(`  ${table}: ${count}`);
  console.log('Остаются: сотрудники, магазины, партнёры и доли, поставщики, клиенты, курсы, каталог телефонов, пороги остатков, категории.');
  console.log('Обнуляются: кассы магазинов и счета, капитал и прибыль партнёров, долги поставщиков и клиентов.');
  if (!apply) {
    console.log('\nНичего не изменено. Чтобы очистить: npm run db:reset-operations:apply');
    return;
  }

  await prisma.$transaction([
    // No CASCADE: if a kept table referenced one of these, Postgres refuses instead of
    // silently emptying the kept table too.
    prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY`),
    prisma.store.updateMany({ data: { cashBalanceUsd: 0 } }),
    prisma.financialAccount.updateMany({ data: { balanceTjs: 0, balanceUsd: 0, openingBalanceTjs: 0, openingBalanceUsd: 0 } }),
    prisma.owner.updateMany({
      data: { capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
    }),
    prisma.supplier.updateMany({ data: { totalPurchasedUsd: 0, totalPaidUsd: 0, totalDebtUsd: 0 } }),
    prisma.customer.updateMany({ data: { totalDebtTjs: 0, totalPaidTjs: 0 } }),
  ]);
  console.log(`\nГотово: очищено таблиц ${tables.length}, все балансы обнулены.`);
}

main()
  .catch((error) => { console.error('Ошибка очистки:', error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
