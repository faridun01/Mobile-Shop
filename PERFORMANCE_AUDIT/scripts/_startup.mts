import { spawn, execFileSync } from 'node:child_process';
import { perfDatabaseUrl } from './perf-env';
const url = perfDatabaseUrl();
const rss = (pid: number) => Math.round(Number(execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${Number(pid)}).WorkingSet64`]).toString().trim()) / 1048576);
for (const [label, args] of [['tsx', ['--import', 'tsx', 'server/src/index.ts']], ['bundle', ['--enable-source-maps', 'server/dist/index.mjs']]] as const) {
  const res: number[] = []; const mem: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    const p = spawn(process.execPath, [...args], { env: { ...process.env, DATABASE_URL: url, PORT: '3409', APP_URL: 'http://127.0.0.1:3409', NODE_ENV: 'production' }, stdio: 'ignore' });
    for (;;) { try { if ((await fetch('http://127.0.0.1:3409/api/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 20)); }
    res.push(performance.now() - t);
    await new Promise((r) => setTimeout(r, 3000));
    mem.push(rss(p.pid!));
    p.kill(); await new Promise((r) => setTimeout(r, 800));
  }
  res.sort((a, b) => a - b); mem.sort((a, b) => a - b);
  console.log(label.padEnd(7), 'старт медиана', Math.round(res[2]), 'мс (', res.map(Math.round).join(', '), ')  RSS медиана', mem[2], 'МБ (', mem.join(', '), ')');
}
