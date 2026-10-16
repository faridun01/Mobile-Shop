// Measures the production build in dist/: every asset raw / gzip / brotli, what the first page
// load downloads (index.html scripts, modulepreloads and stylesheets) and the PWA precache size.
//
//   npm run build && node PERFORMANCE_AUDIT/scripts/measure-bundle.mjs <label>
//   → PERFORMANCE_AUDIT/data/bundle-<label>.json
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const label = process.argv[2] || 'run';
const dist = path.resolve('dist');
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dist);

const sizeOf = (p) => {
  const buf = fs.readFileSync(p);
  return {
    raw: buf.length,
    gzip: zlib.gzipSync(buf, { level: 6 }).length,
    brotli: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
};
const rel = (p) => path.relative(dist, p).replace(/\\/g, '/');
const assets = files.map((p) => ({ file: rel(p), ...sizeOf(p) })).sort((a, b) => b.raw - a.raw);

// First load: what index.html pulls in directly.
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const initialAssets = assets.filter((a) => initial.includes(a.file));

// PWA precache: the urls listed in the service worker's manifest.
const sw = fs.existsSync(path.join(dist, 'sw.js')) ? fs.readFileSync(path.join(dist, 'sw.js'), 'utf8') : '';
const precached = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
const precacheAssets = assets.filter((a) => precached.includes(a.file));

const sum = (list, k) => list.reduce((s, a) => s + a[k], 0);
const byExt = (ext) => assets.filter((a) => a.file.endsWith(ext));
const out = {
  label,
  measuredAt: new Date().toISOString(),
  totals: {
    files: assets.length,
    allRaw: sum(assets, 'raw'),
    jsRaw: sum(byExt('.js'), 'raw'), jsGzip: sum(byExt('.js'), 'gzip'), jsBrotli: sum(byExt('.js'), 'brotli'),
    cssRaw: sum(byExt('.css'), 'raw'), cssGzip: sum(byExt('.css'), 'gzip'), cssBrotli: sum(byExt('.css'), 'brotli'),
    initialFiles: initialAssets.length, initialRaw: sum(initialAssets, 'raw'), initialGzip: sum(initialAssets, 'gzip'), initialBrotli: sum(initialAssets, 'brotli'),
    precacheFiles: precacheAssets.length, precacheRaw: sum(precacheAssets, 'raw'),
  },
  initial: initialAssets.map((a) => a.file),
  largest: assets.slice(0, 25),
};
fs.mkdirSync('PERFORMANCE_AUDIT/data', { recursive: true });
fs.writeFileSync(`PERFORMANCE_AUDIT/data/bundle-${label}.json`, JSON.stringify(out, null, 1));
const kb = (n) => `${(n / 1024).toFixed(1)} КБ`;
console.log(`[${label}] файлов ${out.totals.files}, всего ${kb(out.totals.allRaw)}`);
console.log(`JS: ${kb(out.totals.jsRaw)} (gzip ${kb(out.totals.jsGzip)}, br ${kb(out.totals.jsBrotli)})`);
console.log(`CSS: ${kb(out.totals.cssRaw)} (gzip ${kb(out.totals.cssGzip)})`);
console.log(`Первая загрузка: ${out.totals.initialFiles} файлов, ${kb(out.totals.initialRaw)} (gzip ${kb(out.totals.initialGzip)})`);
console.log(`PWA precache: ${out.totals.precacheFiles} файлов, ${kb(out.totals.precacheRaw)}`);
for (const a of out.largest.slice(0, 15)) console.log(`  ${a.file.padEnd(52)} ${kb(a.raw).padStart(10)}  gz ${kb(a.gzip).padStart(9)}${initial.includes(a.file) ? '  [первая загрузка]' : ''}`);
