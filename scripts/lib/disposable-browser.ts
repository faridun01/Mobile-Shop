import { isDisposableDatabaseUrl } from './disposable-db';

/** Legacy browser scripts mutate data: require an explicit isolated fixture, never :3000. */
export function disposableBrowserUrl(databaseUrl: string | undefined, appUrl: string | undefined): string {
  if (!isDisposableDatabaseUrl(databaseUrl) || !appUrl) throw new Error('Браузерный тест требует временную схему audit_fixes_* и UI_AUDIT_BASE_URL из изолированного fixture');
  const url = new URL(appUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || ['3000', '3001'].includes(url.port) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Браузерный тест разрешён только на отдельном локальном порту fixture; рабочие порты 3000/3001 запрещены');
  }
  return url.origin;
}
