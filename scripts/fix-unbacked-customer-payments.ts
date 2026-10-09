import 'dotenv/config';
import { D, moneyJson } from '../server/src/common/decimal';
import { roundMoney } from '../server/src/common/money';
import { prisma } from '../server/src/prisma/prisma.service';
import { currentOwnerAllocations, readOwnerAllocations, replaceOwnerAllocations } from '../server/src/modules/finance/owner-allocations';
import type { OwnerProfitAllocation } from '../server/src/modules/sales/profit';

// Before payments were checked against sale debts, a customer debt written outside the app could
// be "repaid": the cash reached the register, but no sale ever booked it as income, so owners'
// capital + profit fell short of the business by that amount (audit:owners: unexplained residual).
// Such money is income of the store that received it, so its owners get it as profit at the store's
// current shares. Nothing is deleted: the payment, its register posting and the collection stay as
// they are; the payment records the allocation and an audit entry marks it as booked.
//
//   npm run fix:unbacked-payments         show what would be booked
//   npm run fix:unbacked-payments:apply   book it (a separate script: Windows PowerShell mangles `-- --apply`)
const ACTION = 'CUSTOMER_PAYMENT_UNBACKED_INCOME';
const apply = process.argv.includes('--apply');

async function main() {
  const payments = await prisma.customerPayment.findMany({
    include: { customer: { select: { name: true } }, allocations: { select: { allocatedAmountTjs: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const booked = new Set((await prisma.auditLog.findMany({ where: { action: ACTION }, select: { targetId: true } })).map((l) => l.targetId));
  const pending = payments
    .map((p) => ({ payment: p, unallocatedTjs: D(p.amountTjs).minus(p.allocations.reduce((sum, a) => sum.plus(a.allocatedAmountTjs), D(0))) }))
    .filter(({ payment, unallocatedTjs }) => unallocatedTjs.gt(0) && !booked.has(payment.id));

  if (pending.length === 0) {
    console.log('Оплат без чека нет — исправлять нечего');
    return;
  }

  for (const { payment, unallocatedTjs } of pending) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_payments WHERE id = ${payment.id} FOR UPDATE`;
      if (await tx.auditLog.findFirst({ where: { action: ACTION, targetId: payment.id } })) return;

      // The register received exactly the posted dollars; the unallocated part is its TJS share.
      const posting = await tx.financialTransaction.findFirst({ where: { sourceType: 'CUSTOMER_PAYMENT', sourceId: payment.id, status: 'POSTED' } });
      if (!posting) throw new Error(`Оплата ${payment.id}: не найдена проводка в кассу`);
      const incomeUsd = roundMoney(D(posting.amountUsd).mul(unallocatedTjs).div(payment.amountTjs));
      const allocations = await currentOwnerAllocations(tx, incomeUsd, payment.storeId);
      const store = payment.storeId ? await tx.store.findUnique({ where: { id: payment.storeId }, select: { name: true } }) : null;
      const owners = await tx.owner.findMany({ where: { id: { in: allocations.map((a) => a.ownerId) } }, select: { id: true, name: true } });
      const split = allocations.map((a) => `${owners.find((o) => o.id === a.ownerId)?.name ?? a.ownerId} $${D(a.amountUsd).toFixed(2)}`).join(', ');
      console.log(`${payment.customer.name}, ${payment.createdAt.toISOString().slice(0, 10)}, «${store?.name ?? 'без магазина'}»: ${unallocatedTjs.toFixed(2)} TJS без чека = $${incomeUsd.toFixed(2)} → ${split}`);
      if (!apply) return;

      await replaceOwnerAllocations(tx, [], allocations, 1);
      const merged: OwnerProfitAllocation[] = payment.ownerProfitAllocations == null ? [] : readOwnerAllocations(payment.ownerProfitAllocations);
      for (const row of allocations) {
        const existing = merged.find((m) => m.ownerId === row.ownerId);
        if (existing) existing.amountUsd = roundMoney(D(existing.amountUsd).plus(row.amountUsd));
        else merged.push(row);
      }
      await tx.customerPayment.update({ where: { id: payment.id }, data: { ownerProfitAllocations: moneyJson(merged) } });
      await tx.auditLog.create({
        data: {
          action: ACTION,
          targetId: payment.id,
          details: `Оплата долга клиента ${payment.customer.name} от ${payment.createdAt.toISOString().slice(0, 10)}: ${unallocatedTjs.toFixed(2)} TJS ($${incomeUsd.toFixed(2)}) не относились ни к одному чеку — признаны доходом магазина «${store?.name ?? '—'}» и распределены владельцам: ${split}`,
          financialDetails: moneyJson({ paymentId: payment.id, unallocatedTjs, incomeUsd, ownerProfitAllocations: moneyJson(allocations) }),
        },
      });
    });
  }
  console.log(apply ? '\nГотово. Проверьте: npm run audit:owners' : '\nНичего не изменено. Чтобы провести: npm run fix:unbacked-payments:apply');
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
