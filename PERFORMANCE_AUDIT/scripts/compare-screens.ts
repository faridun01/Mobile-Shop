// Pixel comparison of screens-before and screens-after (same file names): share of differing pixels
// per screen, and a diff image (differences in red) for any screen that is not identical.
//   npx tsx PERFORMANCE_AUDIT/scripts/compare-screens.ts [before] [after] → PERFORMANCE_AUDIT/data/screens-diff-<after>.json
import fs from 'node:fs';
import path from 'node:path';

const [la = 'before', lb = 'after'] = process.argv.slice(2);
const A = `PERFORMANCE_AUDIT/data/screens-${la}`;
const B = `PERFORMANCE_AUDIT/data/screens-${lb}`;
const OUT = `PERFORMANCE_AUDIT/data/screens-diff-${lb}`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
// tsx (esbuild) wraps named inner functions in a __name() helper that does not exist in the page.
await page.evaluate('window.__name = (f) => f');
const results: { screen: string; diffPixels: number; totalPixels: number; percent: number }[] = [];
for (const file of fs.readdirSync(A).filter((f) => f.endsWith('.png')).sort()) {
  if (!fs.existsSync(path.join(B, file))) { results.push({ screen: file, diffPixels: -1, totalPixels: 0, percent: 100 }); continue; }
  const a = fs.readFileSync(path.join(A, file)).toString('base64');
  const b = fs.readFileSync(path.join(B, file)).toString('base64');
  const r = await page.evaluate(async (a64: string, b64: string) => {
    const load = (src: string) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [ia, ib] = await Promise.all([load('data:image/png;base64,' + a64), load('data:image/png;base64,' + b64)]);
    const w = Math.max(ia.width, ib.width); const h = Math.max(ia.height, ib.height);
    const ctx = (img: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
    const da = ctx(ia); const db = ctx(ib);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ox = out.getContext('2d')!; ox.drawImage(ib, 0, 0); ox.fillStyle = 'rgba(255,0,0,0.9)';
    let diff = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      if (Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]) > 30) {
        diff++;
        const p = i / 4; ox.fillRect(p % w, Math.floor(p / w), 1, 1);
      }
    }
    return { diff, total: w * h, png: diff ? out.toDataURL('image/png').split(',')[1] : '' };
  }, a, b);
  if (r.diff) fs.writeFileSync(path.join(OUT, file), Buffer.from(r.png, 'base64'));
  results.push({ screen: file, diffPixels: r.diff, totalPixels: r.total, percent: Math.round((r.diff / r.total) * 10000) / 100 });
}
await browser.close();
fs.writeFileSync(`${OUT}.json`, JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.percent === 0 ? 'одинаково ' : 'отличается'} ${r.screen.padEnd(32)} ${r.diffPixels} пикс. (${r.percent}%)`);
