import { it, expect } from 'vitest';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerStaticFrontend } from './static-frontend';

it('returns 404 for stale chunks, JS for existing chunks, and HTML for SPA navigation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mobile-shop-static-'));
  await mkdir(path.join(directory, 'assets'));
  await writeFile(path.join(directory, 'index.html'), '<html>app</html>');
  await writeFile(path.join(directory, 'assets', 'page.js'), 'export default 1');
  const app = express();
  registerStaticFrontend(app, directory);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const missing = await fetch(`${base}/assets/old-page.js`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).not.toContain('text/html');
    expect(missing.headers.get('cache-control')).toBe('no-store');
    const asset = await fetch(`${base}/assets/page.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('javascript');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const navigation = await fetch(`${base}/sale`);
    expect(navigation.status).toBe(200);
    expect(await navigation.text()).toBe('<html>app</html>');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
