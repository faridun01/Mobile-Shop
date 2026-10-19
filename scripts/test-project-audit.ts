import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { auditOutput } from './lib/audit-output';
import { requireAuditDatabase } from './lib/audit-database';

requireAuditDatabase();
const suites: Array<[string, string[]]> = [
  ['types', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['unit', ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2']],
  ['contracts', ['--import', 'tsx', 'scripts/audit-ui-contracts.ts']],
  ['build', ['node_modules/vite/bin/vite.js', 'build']],
  ['server-build', ['node_modules/esbuild/bin/esbuild', 'server/src/index.ts', '--bundle', '--platform=node', '--format=esm', '--target=node22', '--packages=external', '--sourcemap', '--outfile=server/dist/index.mjs']],
  ['auth-matrix', ['--import', 'tsx', 'scripts/test-api-auth-matrix.ts']],
  ['cycle200', ['--import', 'tsx', 'scripts/test-business-cycle-200.ts']],
  ['retention', ['--import', 'tsx', 'scripts/test-retention-audit.ts']],
  ['page-loading', ['--import', 'tsx', 'scripts/test-page-loading.ts']],
  ['page-recovery', ['--import', 'tsx', 'scripts/test-page-recovery.ts']],
  ...Object.entries({ e2e: 'test-e2e-isolated', system: 'test-system-audit', functional: 'test-functional-audit', 'audit-fixes': 'test-audit-fixes', 'profit-refund': 'test-profit-share-refund', 'cash-collection': 'test-cash-collection', 'collection-split': 'test-collection-bonus-split', 'bonus-admin': 'test-bonus-admin', 'bonus-rules': 'test-bonus-rules', capital: 'test-capital-audit', shift: 'test-shift-cash-flow', 'store-receipt': 'test-store-receipt', 'store-merge': 'test-store-merge', 'supplier-cash': 'test-supplier-cash-audit', ui: 'test-ui-audit', 'sn-camera': 'test-sn-camera', quarter: 'test-quarter-business', load: 'test-audit-load' }).map(([name, file]): [string, string[]] => [name, ['--import', 'tsx', `scripts/${file}.ts`]]),
];
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
if (only) for (const name of only) assert(suites.some(([label]) => label === name), `Неизвестный набор: ${name}`);
const output = auditOutput;
mkdirSync(output, { recursive: true });
let failed = false;
for (const [name, args] of suites.filter(([name]) => !only || only.includes(name))) {
  const started = new Date().toISOString();
  const begin = performance.now();
  console.log('START', name);
  writeFileSync(`${output}/${name}.log`, '');
  const result = await new Promise<{ code: number | null; log: string }>(resolve => {
    const child = spawn(process.execPath, args, { env: { ...process.env, PROJECT_AUDIT_OUTPUT: output }, timeout: ['quarter', 'page-loading'].includes(name) ? 1800000 : 600000 });
    let log = '';
    child.stdout.on('data', data => { log += data; appendFileSync(`${output}/${name}.log`, data); });
    child.stderr.on('data', data => { log += data; appendFileSync(`${output}/${name}.log`, data); });
    child.on('error', error => { log += String(error); });
    child.on('close', code => resolve({ code, log }));
  });
  writeFileSync(`${output}/${name}.log`, result.log);
  const results: any[] = existsSync(`${output}/runs.json`) ? JSON.parse(readFileSync(`${output}/runs.json`, 'utf8')) : [];
  results.push({ name, started, seconds: (performance.now() - begin) / 1000, exit: result.code, status: result.code === 0 ? 'passed' : 'failed', summary: result.log.split('\n').filter(l => /passed|failed|checks|groups|PASS|FAIL|AUDIT:|scenarios/i.test(l)).slice(-5) });
  writeFileSync(`${output}/runs.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${output}/${name}.result.json`, JSON.stringify(results.at(-1), null, 2));
  console.log(result.code === 0 ? 'PASS' : 'FAIL', name, Math.round((performance.now() - begin) / 1000), 's', results.at(-1).summary.join('\n'));
  if (result.code !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
