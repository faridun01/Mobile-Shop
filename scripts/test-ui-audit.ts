import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { withDisposableApi } from './lib/disposable-api';
import { prepareUiAudit } from './lib/ui-audit-fixture';
import { D } from '../server/src/common/decimal';

const url = new URL(process.env.DATABASE_URL || '');
assert(/(?:audit|test|_ci$)/i.test(url.pathname), 'Для UI-аудита укажите DATABASE_URL отдельной локальной тестовой БД (audit/test/ci).');
process.env.UI_AUDIT_FRONTEND = 'true';
await withDisposableApi('ui', async api => {
  await prepareUiAudit(api);
  const files = process.argv.includes('--actions-only') ? ['audit-ui-contracts.ts', 'test-ui-actions.ts'] : ['audit-ui-contracts.ts', 'test-ui-backend-browser.ts', 'test-ui-actions.ts'];
  for (const file of files) {
    // Keep the parent's event loop running: a long spawnSync leaves stale HTTP keepalive
    // sockets in the API helper and can break the final read-only reconciliation.
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', `scripts/${file}`], { env: process.env, timeout: 300000 });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; process.stdout.write(data); });
      child.stderr.on('data', data => { stderr += data; });
      child.once('error', reject);
      child.once('close', status => resolve({ status, stdout, stderr }));
    });
    writeFileSync(`output/ui-backend-audit/${file}.log`, result.stdout + result.stderr);
    console.log(file, `exit=${result.status}`, result.stdout.split('\n').filter(Boolean).at(-1));
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const report = await api.call('GET', '/reports/summary?period=ALL');
  assert.equal(report.status, 200);
  assert.equal(D(report.data.revenueUsd).toString(), '100');
  assert.equal(D(report.data.cogsUsd).toString(), '50');
  assert.equal(D(report.data.netProfitUsd).toString(), '50');
  const store = await api.db.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } });
  assert.equal(String(store.cashBalanceUsd), '100');
  const tablet = await api.db.device.findUniqueOrThrow({ where: { imei: '72255/Y5XH00021' } });
  assert.equal(tablet.storeId, 'store-siyoma');
  assert.equal(tablet.category, 'TABLET');
  const debts = (await api.db.supplier.findMany()).reduce((sum, supplier) => sum.plus(supplier.totalDebtUsd), D(0));
  assert.equal(debts.toString(), '60');
  const profit = (await api.db.owner.findMany()).reduce((sum, owner) => sum.plus(owner.availableProfitUsd), D(0));
  assert.equal(profit.toString(), '50');
  for (const account of await api.db.financialAccount.findMany()) {
    const rows = await api.db.financialTransaction.findMany({ where: { balanceCurrency: 'USD', OR: [{ accountId: account.id }, { destinationAccountId: account.id }] } });
    const balance = rows.reduce((sum, row) => sum.plus(D(row.amountUsd).mul(row.accountId === account.id && (row.type === 'TRANSFER' || row.direction === 'OUT') ? -1 : 1)), D(account.openingBalanceUsd));
    assert.equal(String(account.balanceUsd), balance.toString());
    if (account.storeId) {
      const store = await api.db.store.findUniqueOrThrow({ where: { id: account.storeId } });
      assert.equal(String(store.cashBalanceUsd), String(account.balanceUsd));
    }
  }
  writeFileSync('output/ui-backend-audit/reconciliation.json', JSON.stringify({ report: report.data, cashUsd: String(store.cashBalanceUsd), supplierDebtUsd: debts.toString(), ownerProfitUsd: profit.toString(), tabletStore: tablet.storeId, differences: '0' }, null, 2));
  console.log('UI writes reconcile: cash $100, supplier debt $60, report/owner profit $50, ledger differences $0.');
});
console.log('UI audit passed; temporary schema removed.');
