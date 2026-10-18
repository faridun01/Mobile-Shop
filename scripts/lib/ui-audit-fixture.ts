import { mkdirSync, writeFileSync } from 'node:fs';
import type { DisposableApi } from './disposable-api';

export async function prepareUiAudit({ baseUrl, db, call }: DisposableApi) {
  const rate = await call('POST', '/exchange-rate/today', { rate: 10 });
  if (rate.status !== 200) throw new Error(JSON.stringify(rate));
  await db.user.update({ where: { id: 'user-partner' }, data: { storeId: 'store-siyoma' } });
  const partner = await db.user.findUniqueOrThrow({ where: { id: 'user-partner' } });
  await db.user.create({ data: { id: 'ui-unassigned', name: 'Без магазина', login: 'partner-unassigned', password: partner.password, role: 'PARTNER', active: true } });
  await db.device.createMany({ data: [
    { imei: '490154203237518', brand: 'Apple', model: 'UI Phone', storage: '128GB', color: 'Black', storeId: 'store-siyoma', status: 'STORE_STOCK', purchasePriceUsd: 50, costBasisUsd: 50, category: 'PHONE' },
    { imei: '72255/Y5XH00021', brand: 'Honor', model: 'UI Tablet', storage: '128GB', color: 'Black', storeId: 'main-warehouse', status: 'MAIN_WAREHOUSE', purchasePriceUsd: 80, costBasisUsd: 80, category: 'TABLET' },
  ] });
  mkdirSync('output/ui-backend-audit', { recursive: true });
  writeFileSync('output/ui-backend-audit/fixture.json', JSON.stringify({ baseUrl, isolated: true }));
}
