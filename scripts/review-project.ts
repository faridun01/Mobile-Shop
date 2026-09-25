import { D, decimalMin, decimalMax, moneyJson, type MoneyInput } from '../server/src/common/decimal';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import path from 'node:path';

// Audit only: all writes are restricted to a new, local PostgreSQL schema.
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Local database required');
const schema = process.env.REVIEW_SCHEMA || `project_review_${Date.now()}`;
assert(/^project_review_\d+$/.test(schema));
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
if (!process.env.REVIEW_SCHEMA) await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
console.log('AUDIT_SCHEMA', schema);
for (const args of (process.env.REVIEW_SCHEMA ? [] : [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['--import', 'dotenv/config', '--import', 'tsx', 'prisma/seed.ts'],
  ['--import', 'dotenv/config', '--import', 'tsx', 'scripts/test-e2e-all.ts'],
  ['--import', 'dotenv/config', '--import', 'tsx', 'scripts/test-profit-share-refund.ts'],
])) {
  const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 120000 });
  console.log(result.stdout);
  if (result.status !== 0) console.log('SUITE_FAILURE', args.at(-1), result.status, result.stderr);
}
const { app } = await import('../server/src/app');
const { prisma } = await import('../server/src/prisma/prisma.service');
const { RealtimeSyncGateway } = await import('../server/src/websocket/websocket.gateway');
app.use(express.static(path.resolve('dist')));
app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
const server = app.listen(3097, '127.0.0.1');
RealtimeSyncGateway.init(server);
await new Promise<void>((resolve) => server.once('listening', resolve));
const base = 'http://127.0.0.1:3097/api';
async function api(route: string, token?: string, body?: unknown, method?: string) {
  const response = await fetch(base + route, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const bodyText = await response.text();
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bodyText) : { unexpectedContentType: response.headers.get('content-type') } };
}
const admin = (await api('/auth/login', undefined, { login: 'admin', password: 'admin123' })).body.token;
const seller = (await api('/auth/login', undefined, { login: 'ahmad', password: 'seller123' })).body.token;
assert(admin && seller);
for (const route of ['/devices', '/sales', '/users', '/finance/accounts', '/stores']) {
  console.log('UNAUTHENTICATED', route, (await api(route)).status);
}
console.log('SELLER_FINANCE', (await api('/finance/accounts', seller)).status);
const accounts = (await api('/finance/accounts', admin)).body;
const source = accounts.find((a: any) => a.storeId === 'store-siyoma');
const destination = accounts.find((a: any) => a.id !== source.id);
assert(source && destination);
await api('/finance/cash-receipt', admin, { accountId: source.id, amount: D(1000), currency: 'TJS', categoryName: 'Audit funding', description: 'Isolated audit funding' });
async function balances() {
  const rows = (await api('/finance/accounts', admin)).body;
  const store = await prisma.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } });
  return { source: rows.find((r: any) => r.id === source.id).balanceTjs, destination: rows.find((r: any) => r.id === destination.id).balanceTjs, store: store.cashBalanceTjs };
}
const before = await balances();
const transfer = await api('/finance/transfer', admin, { accountId: source.id, destinationAccountId: destination.id, amount: D(100), currency: 'TJS', description: 'Audit transfer cancellation' });
const afterTransfer = await balances();
const cancel = await api(`/finance/transactions/${transfer.body.id}/cancel`, admin, {});
const afterCancel = await balances();
console.log('TRANSFER_CANCELLATION', JSON.stringify({ transferStatus: transfer.status, cancelStatus: cancel.status, before, afterTransfer, afterCancel, restored: JSON.stringify(before) === JSON.stringify(afterCancel) }));
const invalidCurrency = await api('/finance/cash-receipt', admin, { accountId: destination.id, amount: D(100), currency: 'EUR', categoryName: 'Audit funding', description: 'Invalid currency probe' });
console.log('INVALID_CURRENCY', JSON.stringify({ status: invalidCurrency.status, currency: invalidCurrency.body.currency, amount: invalidCurrency.body.amount, amountUsd: invalidCurrency.body.amountUsd, balanceCurrency: invalidCurrency.body.balanceCurrency }));
const logout = await api('/auth/logout', seller, {});
console.log('TOKEN_AFTER_LOGOUT', JSON.stringify({ logoutStatus: logout.status, oldTokenStatus: (await api('/stores', seller)).status }));
const passwordChange = await api('/users/user-ahmad', admin, { password: 'audit-new-password' }, 'PATCH');
console.log('TOKEN_AFTER_PASSWORD_CHANGE', JSON.stringify({ changeStatus: passwordChange.status, oldTokenStatus: (await api('/stores', seller)).status }));
await api('/users/user-ahmad', admin, { password: 'seller123' }, 'PATCH');
console.log('AUDIT_UI_READY http://127.0.0.1:3097');
await db.$disconnect();
process.on('SIGINT', () => { server.close(); void prisma.$disconnect(); process.exit(0); });
