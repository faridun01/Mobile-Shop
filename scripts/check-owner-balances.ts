import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

// Read-only reconciliation of partner profit balances. Every profit movement keeps
//   available = accrued - paid - reinvested
// and paid/reinvested/capital must match the owner transaction history. A mismatch
// usually means balances were redistributed by shares ("rebalance") at some point.
const prisma = new PrismaClient();
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const fmt = (v: Prisma.Decimal) => `$${v.toFixed(2)}`;

async function main() {
  const [owners, sums] = await Promise.all([
    prisma.owner.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.ownerTransaction.groupBy({ by: ['ownerId', 'type'], _sum: { amountUsd: true } }),
  ]);
  const history = (ownerId: string, type: string) =>
    D(sums.find((s) => s.ownerId === ownerId && s.type === type)?._sum.amountUsd ?? 0);

  let problems = 0;
  for (const owner of owners) {
    const accrued = D(owner.totalAccruedProfitUsd);
    const paid = D(owner.totalPaidProfitUsd);
    const reinvested = D(owner.totalReinvestedUsd);
    const available = D(owner.availableProfitUsd);
    const capital = D(owner.capitalBalanceUsd);
    const checks: [string, Prisma.Decimal, Prisma.Decimal][] = [
      ['Доступно = начислено − выплачено − реинвестировано', available, accrued.minus(paid).minus(reinvested)],
      ['Выплачено = сумма выплат в истории', paid, history(owner.id, 'PROFIT_PAYOUT')],
      ['Реинвестировано = сумма реинвестиций в истории', reinvested, history(owner.id, 'REINVEST')],
      ['Капитал = вложения + реинвест − изъятия', capital,
        history(owner.id, 'INVESTMENT').plus(history(owner.id, 'REINVEST')).minus(history(owner.id, 'WITHDRAWAL'))],
    ];
    console.log(`\n${owner.name} (${D(owner.profitSharePercent).toString()}%)`);
    for (const [label, actual, expected] of checks) {
      const diff = actual.minus(expected);
      const ok = diff.abs().lte(0.01);
      if (!ok) problems++;
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}: ${fmt(actual)}${ok ? '' : ` (ожидалось ${fmt(expected)}, разница ${fmt(diff)})`}`);
    }
  }
  console.log(problems ? `\nНайдено расхождений: ${problems}` : '\nРасхождений нет');
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
