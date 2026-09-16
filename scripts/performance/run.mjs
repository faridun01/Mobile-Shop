import { spawn } from 'node:child_process';

const label = process.argv[2] || 'final';
const scenario = process.argv[3] || 'sale';
const profile = process.argv.includes('--profile');
const port = 4185;
const server = spawn(process.execPath, ['scripts/performance/serve.mjs', `output/performance/builds/${label}${profile ? '-profile' : ''}`, String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
try {
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
    server.once('exit', (code) => { if (code) reject(new Error(`Server exited ${code}`)); });
  });
  const code = await new Promise((resolve, reject) => {
    const measure = spawn(process.execPath, ['scripts/performance/measure.mjs', label, `http://127.0.0.1:${port}`, scenario, profile ? '1' : '3', ...(profile ? ['--profile'] : [])], { windowsHide: true, stdio: 'inherit' });
    measure.once('error', reject);
    measure.once('exit', resolve);
  });
  process.exitCode = code || 0;
} finally { server.kill(); }
