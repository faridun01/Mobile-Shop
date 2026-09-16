import { build } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const label = process.argv[2] || 'before';
const profile = process.argv.includes('--profile');
const outDir = `output/performance/builds/${label}${profile ? '-profile' : ''}`;
const components = ['AppProvider', 'NotificationsProvider', 'MainLayout', 'SalePage', 'InventoryPage', 'TopBar', 'Sidebar', 'Drawer', 'TabletNavRail', 'MobileBottomNav', 'LoginPage'];
await build({
  build: { outDir, manifest: true },
  plugins: profile ? [{
    name: 'audit-render-counts', enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').includes('/src/') || !id.endsWith('.tsx')) return;
      for (const name of components) {
        const pattern = new RegExp(`((?:export )?(?:const ${name}[^=]*= [^\\n]*=>|function ${name}\\([^)]*\\)) \\{)`);
        code = code.replace(pattern, `$1\n(window.__renderCounts ??= {})['${name}'] = ((window.__renderCounts ?? {})['${name}'] ?? 0) + 1;`);
      }
      if (id.endsWith('AppContext.tsx')) code = code.replace('  return (\n    <AppLoaderContext.Provider', '  window.__auditStore = storeRef.current;\n  return (\n    <AppLoaderContext.Provider');
      return code;
    },
  }] : [],
});
if (profile) process.exit(0);
const manifest = JSON.parse(await readFile(`${outDir}/.vite/manifest.json`, 'utf8'));
const seen = new Set();
function visit(key) {
  if (seen.has(key)) return;
  seen.add(key);
  for (const dependency of manifest[key]?.imports || []) visit(dependency);
}
for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) visit(key);
const initial = [];
for (const key of seen) {
  const chunk = manifest[key];
  const buffer = await readFile(`${outDir}/${chunk.file}`);
  initial.push({ file: chunk.file, bytes: buffer.length, gzip: gzipSync(buffer).length });
}
const worker = await readFile(`${outDir}/sw.js`, 'utf8');
const entries = [...worker.matchAll(/\{url:"([^"]+)",revision:/g)].map((match) => match[1]);
let precacheBytes = 0;
for (const file of entries) precacheBytes += (await readFile(`${outDir}/${file}`)).length;
await mkdir('output/performance', { recursive: true });
await writeFile(`output/performance/${label}-bundle.json`, JSON.stringify({
  label, initial, initialJsBytes: initial.reduce((sum, row) => sum + row.bytes, 0),
  initialJsGzip: initial.reduce((sum, row) => sum + row.gzip, 0), precacheEntries: entries.length, precacheBytes, entries,
}, null, 2));
