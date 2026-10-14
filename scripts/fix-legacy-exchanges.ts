import 'dotenv/config';
import { D, moneyJson } from '../server/src/common/decimal';
import { roundMoney } from '../server/src/common/money';
import { prisma } from '../server/src/prisma/prisma.service';
import { getOwnersForStore } from '../server/src/modules/finance/owner-allocations';
import { allocateOwnerProfit } from '../server/src/modules/sales/profit';

// Exchanges made before the return-and-sale model brought the customer's phone back into stock at
// the trade-in value and left its sale profit booked. Now an exchange returns that phone at its own
// cost, reverses its profit and keeps the withheld part of its price. Per exchange the difference
// is exactly (phone's cost − trade-in value): it moves the phone's cost basis back and books the
// same amount to the owners, so stock and owner profit change together and capital still reconciles.
//
// Left as they are (reported, not changed):
//   - the receipt was refunded later: the refund already restored the cost and reversed the profit;
//   - the phone has been resold, moved on or revalued since: its resale profit was booked against the
//     trade-in value, which already nets the total to the right amount;
//   - a free bonus phone came back: bonus phones keep the old treatment;
//   - the exchange did not record the phone's original cost.
//
//   npm run fix:legacy-exchanges         show what would change
//   npm run fix:legacy-exchanges:apply   change it (a separate script: Windows PowerShell mangles `-- --apply`)
const ACTION = 'EXCHANGE_RECALCULATED';
const apply = process.argv.includes('--apply');

type Details = Record<string, unknown>;
const signedUsd = (value: ReturnType<typeof D>) => `${value.gte(0) ? '+' : '−'}$${value.abs().toFixed(2)}`;
const num = (details: Details, key: string) => {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

async function main() {
  const logs = await prisma.auditLog.findMany({ where: { action: 'EXCHANGE' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  const lastClose = await prisma.quarterClosure.findFirst({ orderBy: { closedAt: 'desc' }, select: { quarterName: true, closedAt: true } });
  let changed = 0;
  let skipped = 0;
  let totalDeltaUsd = D(0);

  for (const { id } of logs) {
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM audit_logs WHERE id = ${id} FOR UPDATE`;
      const log = await tx.auditLog.findUniqueOrThrow({ where: { id } });
      const details = (log.financialDetails && typeof log.financialDetails === 'object' && !Array.isArray(log.financialDetails) ? log.financialDetails : {}) as Details;
      // Exchanges under the new model (and ones already recalculated) record the cost the phone came back at.
      if ('returnedCostBasisAfterUsd' in details) return 'current' as const;

      const sale = log.targetId ? await tx.sale.findUnique({ where: { id: log.targetId }, select: { id: true, storeId: true, status: true, receiptNumber: true } }) : null;
      const label = `Чек #${sale?.receiptNumber ?? log.receiptNumber ?? '?'} от ${log.createdAt.toISOString().slice(0, 10)}`;
      const skip = (reason: string) => { console.log(`  пропуск  ${label}: ${reason}`); return 'skipped' as const; };

      const deviceId = details.returnedDeviceId;
      const tradeInUsd = num(details, 'exchangeInValueUsd');
      const originalCostUsd = num(details, 'returnedCostBasisUsd');
      if (!sale) return skip('чек не найден');
      if (typeof deviceId !== 'string' || tradeInUsd === undefined || originalCostUsd === undefined) return skip('в обмене не сохранена себестоимость сданного телефона');
      if (sale.status === 'REFUNDED') return skip('чек возвращён — возврат уже восстановил себестоимость и отменил прибыль');

      const device = await tx.device.findUnique({ where: { id: deviceId } });
      if (!device) return skip('сданный телефон не найден');
      const model = `${device.brand} ${device.model} (IMEI ${device.imei})`;
      if ((device.isBonus || device.bonusCampaign) && D(originalCostUsd).eq(0)) return skip(`${model} — бонусный телефон, для него правило не менялось`);
      if (device.status === 'SOLD') return skip(`${model} уже перепродан — итог по владельцам уже верный`);
      if (!D(device.costBasisUsd).eq(roundMoney(tradeInUsd))) return skip(`${model}: себестоимость $${D(device.costBasisUsd).toFixed(2)} уже не равна зачёту $${D(tradeInUsd).toFixed(2)}`);

      const deltaUsd = roundMoney(D(originalCostUsd).minus(tradeInUsd));
      const allocations = deltaUsd.isZero() ? [] : allocateOwnerProfit(deltaUsd, await getOwnersForStore(tx, sale.storeId));
      const owners = await tx.owner.findMany({ where: { id: { in: allocations.map((a) => a.ownerId) } }, select: { id: true, name: true } });
      const split = allocations.map((a) => `${owners.find((o) => o.id === a.ownerId)?.name ?? a.ownerId} ${signedUsd(D(a.amountUsd))}`).join(', ');
      const closedNote = lastClose && log.createdAt <= lastClose.closedAt ? ` [обмен до закрытия «${lastClose.quarterName}» — начислится в текущем периоде]` : '';
      console.log(`  ${apply ? 'исправлен' : 'исправить'} ${label}: ${model}, себестоимость $${D(tradeInUsd).toFixed(2)} → $${D(originalCostUsd).toFixed(2)}, прибыль ${signedUsd(deltaUsd)}${split ? ` → ${split}` : ''}${closedNote}`);
      if (!apply) return { deltaUsd };

      const restored = await tx.device.updateMany({
        where: { id: device.id, status: { not: 'SOLD' }, costBasisUsd: roundMoney(tradeInUsd) },
        data: { costBasisUsd: roundMoney(originalCostUsd) },
      });
      if (restored.count !== 1) throw new Error(`${label}: телефон изменился во время пересчёта, повторите`);

      for (const { ownerId, amountUsd } of allocations) {
        if (D(amountUsd).isZero()) continue;
        const updated = await tx.owner.updateMany({
          where: { id: ownerId },
          data: { totalAccruedProfitUsd: { increment: amountUsd }, availableProfitUsd: { increment: amountUsd } },
        });
        if (updated.count !== 1) throw new Error(`${label}: партнёр ${ownerId} не найден`);
      }

      // The exchange log is what a later refund reverses and what reports read, so it carries the
      // corrected profit and allocations; the marker field makes the script safe to re-run.
      const previous = Array.isArray(details.ownerProfitAllocations) ? details.ownerProfitAllocations as { ownerId: string; amountUsd: number }[] : [];
      const merged = new Map(previous.map((row) => [row.ownerId, D(row.amountUsd)]));
      for (const { ownerId, amountUsd } of allocations) merged.set(ownerId, roundMoney(D(merged.get(ownerId) ?? 0).plus(amountUsd)));
      await tx.auditLog.update({
        where: { id: log.id },
        data: {
          financialDetails: moneyJson({
            ...details,
            returnedCostBasisAfterUsd: roundMoney(originalCostUsd),
            exchangeProfitUsd: roundMoney(D(num(details, 'exchangeProfitUsd') ?? 0).plus(deltaUsd)),
            ownerProfitAllocations: [...merged].map(([ownerId, amountUsd]) => ({ ownerId, amountUsd })),
            recalculation: { at: new Date().toISOString(), deltaUsd, ownerProfitAllocations: allocations },
          }),
        },
      });
      await tx.deviceTimelineEvent.create({
        data: { deviceId: device.id, type: 'EXCHANGE_IN', description: `Пересчёт обмена: себестоимость возвращена к $${D(originalCostUsd).toFixed(2)}`, userName: 'Система' },
      });
      await tx.auditLog.create({
        data: {
          action: ACTION,
          targetId: log.id,
          receiptNumber: sale.receiptNumber,
          details: `${label}: обмен пересчитан по правилу «возврат + продажа». ${model} возвращён на склад по себестоимости $${D(originalCostUsd).toFixed(2)} вместо зачёта $${D(tradeInUsd).toFixed(2)}; прибыль ${signedUsd(deltaUsd)}${split ? `: ${split}` : ''}`,
          financialDetails: moneyJson({ exchangeLogId: log.id, saleId: sale.id, deviceId: device.id, tradeInUsd, originalCostUsd, deltaUsd, ownerProfitAllocations: moneyJson(allocations) }),
        },
      });
      return { deltaUsd };
    });

    if (outcome === 'skipped') skipped++;
    else if (outcome !== 'current') { changed++; totalDeltaUsd = totalDeltaUsd.plus(outcome.deltaUsd); }
  }

  if (changed === 0) {
    console.log(skipped ? `\nИсправлять нечего (пропущено: ${skipped})` : '\nСтарых обменов нет — исправлять нечего');
    return;
  }
  console.log(`\nОбменов ${apply ? 'пересчитано' : 'к пересчёту'}: ${changed}, пропущено: ${skipped}. Прибыль владельцев и склад по себестоимости: ${signedUsd(totalDeltaUsd)}`);
  console.log(apply ? 'Готово. Проверьте: npm run audit:owners' : 'Ничего не изменено. Чтобы провести: npm run fix:legacy-exchanges:apply');
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
