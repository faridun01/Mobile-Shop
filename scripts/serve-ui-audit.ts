import { withDisposableApi } from './lib/disposable-api';
import { prepareUiAudit } from './lib/ui-audit-fixture';

process.env.UI_AUDIT_FRONTEND = 'true';
await withDisposableApi('ui', async api => {
  await prepareUiAudit(api);
  console.log(`UI AUDIT READY ${api.baseUrl}`);
  await new Promise<void>(resolve => {
    process.once('SIGINT', resolve); process.once('SIGTERM', resolve);
    process.stdin.on('data', data => { if (String(data).trim() === 'stop') resolve(); });
  });
});
