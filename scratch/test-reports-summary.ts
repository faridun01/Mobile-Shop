import { PrismaClient } from '@prisma/client';
import { computeReportsSummary } from '../server/src/modules/reports/reports.service';

const p = new PrismaClient();
async function main() {
  const summaryAll = await computeReportsSummary({ period: 'ALL' });
  console.log('Summary ALL:');
  console.log('  revenueUsd:', summaryAll.revenueUsd);
  console.log('  cogsUsd:', summaryAll.cogsUsd);
  console.log('  grossProfitUsd:', summaryAll.grossProfitUsd);
  console.log('  expensesUsd:', summaryAll.expensesUsd);
  console.log('  profitUsd (с учетом возвратов):', summaryAll.profitUsd);
  console.log('  netProfitUsd:', summaryAll.netProfitUsd);

  const summaryMonth = await computeReportsSummary({ period: 'SPECIFIC_MONTH', month: '2026-09' });
  console.log('Summary 2026-09:');
  console.log('  revenueUsd:', summaryMonth.revenueUsd);
  console.log('  cogsUsd:', summaryMonth.cogsUsd);
  console.log('  grossProfitUsd:', summaryMonth.grossProfitUsd);
  console.log('  expensesUsd:', summaryMonth.expensesUsd);
  console.log('  profitUsd (с учетом возвратов):', summaryMonth.profitUsd);
  console.log('  netProfitUsd:', summaryMonth.netProfitUsd);
}
main().finally(() => p.$disconnect());
