// Isolated benchmark server: synthetic data only; never connects to the project database.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { WebSocketServer } from 'ws';

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 4173);
const date = new Date().toISOString();
const store = { id: 'store', name: 'Audit Shop', isMainWarehouse: false, cashBalanceTjs: 100000, active: true };
const user = { id: 'audit-user', login: 'audit', name: 'Audit User', role: 'ADMIN', active: true, storeId: 'store', createdAt: date };
const devices = Array.from({ length: 2000 }, (_, i) => ({ id: `device-${i}`, imei: String(350000000000000 + i), brand: ['Apple', 'Samsung', 'Xiaomi'][i % 3], model: `Model ${i % 24}`, storage: ['128GB', '256GB'][i % 2], color: ['Black', 'White'][i % 2], status: 'STORE_STOCK', storeId: 'store', store, purchasePriceUsd: 200, costBasisUsd: 200, retailPriceTjs: 3000, createdAt: date, timeline: [] }));
const rows = (prefix, fields) => Array.from({ length: 500 }, (_, i) => ({ id: `${prefix}-${i}`, createdAt: new Date(Date.now() - i * 3600000).toISOString(), ...fields, receiptNumber: i + 1, ticketNumber: i + 1 }));
const data = {
  '/api/users': [user], '/api/stores': [store], '/api/devices': devices,
  '/api/exchange-rate/today': { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()), rate: 10, createdAt: date, createdByUserId: user.id },
  '/api/sales': rows('sale', { storeId: store.id, store, userId: user.id, user, totalTjs: 3000, totalUsd: 300, exchangeRate: 10, paymentMethod: 'CASH', cashAmountTjs: 3000, cardAmountTjs: 0, status: 'COMPLETED', saleItems: [{ ...devices[0], deviceId: devices[0].id, salePriceTjs: 3000, salePriceUsd: 300, purchaseCostUsd: 200 }], exchangeEvents: [] }),
  '/api/expenses': rows('expense', { category: 'OTHER', amountTjs: 100, amountUsd: 10, exchangeRate: 10, targetType: 'STORE', storeId: store.id, store, createdByUserId: user.id }),
  '/api/repairs': rows('repair', { ...devices[0], status: 'ACCEPTED', userId: user.id, problemDescription: 'Audit fixture', statusHistory: [] }),
  '/api/transfers': [], '/api/suppliers': [], '/api/supplier-invoices': [], '/api/supplier-bonuses': [],
  '/api/owners': [], '/api/owner-transactions': [], '/api/audit-logs': [], '/api/notifications': [],
};
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/__perf/event') {
    const type = url.searchParams.get('type');
    if (type === 'NOTIFICATION_CREATED') data['/api/notifications'] = [{ id: 'notification', title: 'Audit', message: 'Audit event', createdAt: date, read: false, resolved: false }];
    for (const client of sockets.clients) client.send(JSON.stringify({ type, payload: {} }));
    res.end('ok'); return;
  }
  if (url.pathname.startsWith('/api/')) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (url.pathname === '/api/exchange-rate/today') {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
      data['/api/exchange-rate/today'] = { date: todayStr, rate: 10, createdAt: new Date().toISOString(), createdByUserId: user.id };
    }
    const body = Buffer.from(JSON.stringify(data[url.pathname] ?? []));
    const payload = gzipSync(body);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store', 'Content-Length': payload.length });
    res.end(payload); return;
  }
  let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  let body;
  try { body = await readFile(file); }
  catch { file = path.join(root, 'index.html'); body = await readFile(file); }
  const compressed = /\.(js|css|html|svg|json|webmanifest)$/.test(file);
  const payload = compressed ? gzipSync(body) : body;
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache', ...(compressed ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': payload.length });
  res.end(payload);
});
const sockets = new WebSocketServer({ server, path: '/ws' });
server.listen(port, '127.0.0.1', () => console.log(`Benchmark: http://127.0.0.1:${port}, ${root}`));
