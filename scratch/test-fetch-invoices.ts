import { prisma } from '../server/src/prisma/prisma.service';
import { dateRangeForPeriod } from '../server/src/common/business-date';

async function testQuery(month: string) {
  const dateRange = dateRangeForPeriod('SPECIFIC_MONTH', month);
  console.log(`Testing month ${month}:`, dateRange);
  const invoices = await prisma.supplierInvoice.findMany({
    where: { date: dateRange },
    orderBy: { date: 'desc' }
  });
  console.log(`Found ${invoices.length} invoices:`, invoices.map(i => ({ num: i.invoiceNumber, date: i.date })));
}

async function main() {
  await testQuery('2026-09');
  await testQuery('2026-08');
  await testQuery('2026-07');
  await testQuery('2026-06');
  await prisma.$disconnect();
}

main();
