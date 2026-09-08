import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import type { Server } from 'node:http';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `user_auth_test_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
const db = new PrismaClient();
let server: Server | undefined;
let disconnectService: (() => Promise<void>) | undefined;
let passed = 0;
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
try {
  for (const args of [
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    ['--import', 'dotenv/config', '--import', 'tsx', 'prisma/seed.ts'],
  ]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const { app } = await import('../server/src/app');
  const { prisma } = await import('../server/src/prisma/prisma.service');
  disconnectService = () => prisma.$disconnect();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = async (path: string, body?: unknown, token?: string, method = 'POST') => {
    const response = await fetch(base + path, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  const check = (condition: unknown, label: string) => { assert(condition, label); passed++; };
  const login = (name: string, password: string) => request('/auth/login', { login: name, password });
  const admin = await login('admin', 'admin123');
  const partner = await login('partner', 'partner123');
  const seller = await login('ahmad', 'seller123');
  for (const [label, result] of [['admin', admin], ['partner', partner], ['seller', seller]] as const) {
    check(result.status === 200 && result.data.token, `Login ${label}`);
  }
  const payload = { name: '  Test Employee  ', login: '  new_employee  ', password: '  pass12345  ',
    role: 'SELLER', storeId: 'store-siyoma', baseSalaryTjs: 1500, salesCommissionPercent: 2.5 };
  for (const [token, status] of [[undefined, 401], [partner.data.token, 403], [seller.data.token, 403]] as const) {
    check((await request('/users', payload, token)).status === status, 'Creation authorization');
  }
  const created = await request('/users', payload, admin.data.token);
  check(created.status === 201 && created.data.login === 'new_employee' && created.data.name === 'Test Employee', 'Normalize text');
  check(!('password' in created.data), 'Never return password');
  const stored = await db.user.findUniqueOrThrow({ where: { id: created.data.id } });
  check(stored.password !== payload.password && stored.password.includes(':'), 'Hash password');
  check((await login(payload.login, payload.password)).status === 200, 'Login with normalized username and exact password');
  check((await login('new_employee', payload.password.trim())).status === 401, 'Do not silently trim password');
  check((await request('/users', { ...payload, login: ' new_employee ' }, admin.data.token)).status === 400, 'Normalized duplicate');
  await db.store.create({ data: { id: 'inactive-store', name: 'Inactive', active: false } });
  const invalidInputs = [
    { login: '   ' }, { login: 123 }, { name: '   ' }, { name: {} },
    { password: '      ' }, { password: '12345' }, { password: 123456 },
    { role: 'ROOT' }, { storeId: '' }, { storeId: 'missing' },
    { storeId: 'main-warehouse' }, { storeId: 'inactive-store' },
    { baseSalaryTjs: -1 }, { baseSalaryTjs: 'bad' },
    { salesCommissionPercent: -1 }, { salesCommissionPercent: 101 }, { salesCommissionPercent: 'bad' },
  ];
  for (const [index, invalid] of invalidInputs.entries()) {
    const count = await db.user.count();
    const result = await request('/users', { ...payload, login: `invalid_${index}`, ...invalid }, admin.data.token);
    check(result.status === 400 && await db.user.count() === count, `Reject invalid creation ${JSON.stringify(invalid)}`);
    const update = await request(`/users/${created.data.id}`, invalid, admin.data.token, 'PATCH');
    check(update.status === 400, `Reject invalid update ${JSON.stringify(invalid)}`);
  }
  for (const commission of [0, 100]) {
    const result = await request(`/users/${created.data.id}`, { baseSalaryTjs: 0, salesCommissionPercent: commission }, admin.data.token, 'PATCH');
    check(result.status === 200 && result.data.salesCommissionPercent === commission, `Valid commission boundary ${commission}`);
  }
  check((await request(`/users/${created.data.id}/reset-password`, { newPassword: '      ' }, admin.data.token)).status === 400, 'Reject blank reset password');
  const update = await request(`/users/${created.data.id}`, { password: '  updated123  ' }, admin.data.token, 'PATCH');
  check(update.status === 200 && (await login('new_employee', '  updated123  ')).status === 200, 'Updated password preserves exact input');
  for (const role of ['ADMIN', 'PARTNER']) {
    const result = await request('/users', { login: `new_${role}`, name: role, password: 'test12345', role }, admin.data.token);
    check(result.status === 201 && (await login(`new_${role}`, 'test12345')).status === 200, `Create and login ${role}`);
  }
  check((await login('missing', 'wrong')).status === 401, 'Reject unknown user');
  const employeeSession = await login('new_employee', '  updated123  ');
  await db.user.update({ where: { id: created.data.id }, data: { active: false } });
  check((await login('new_employee', '  updated123  ')).status === 401, 'Reject inactive user');
  check((await request('/users', undefined, employeeSession.data.token, 'GET')).status === 401, 'Reject inactive session');
  let limited;
  for (let attempt = 0; attempt < 11; attempt++) limited = await login('throttle_check', 'wrong');
  check(limited?.status === 429, 'Rate limit repeated failed logins');
  console.log(`User creation and login: ${passed} checks passed`);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnectService?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Temporary user/auth test schema removed');
}
