// Serves the API alone on DATABASE_URL (already migrated and seeded by the caller) and prints
// "LISTENING <port>". Used by integration suites that need one app per disposable schema.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const { app } = await import('../server/src/app');
if (process.env.UI_AUDIT_FRONTEND === 'true') {
  const { registerStaticFrontend } = await import('../server/src/common/static-frontend');
  registerStaticFrontend(app, fileURLToPath(new URL('../dist/', import.meta.url)));
}
const server = app.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
  const address = server.address() as import('node:net').AddressInfo;
  console.log(`LISTENING ${address.port}`);
});
if (process.env.UI_AUDIT_FRONTEND === 'true') {
  const { RealtimeSyncGateway } = await import('../server/src/websocket/websocket.gateway');
  RealtimeSyncGateway.init(server);
}
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
