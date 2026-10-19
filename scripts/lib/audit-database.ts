/** Full-audit entry points never create even a temporary schema in the working database. */
export function requireAuditDatabase(value = process.env.DATABASE_URL): URL {
  try {
    const url = new URL(value || '');
    if (url.protocol === 'postgresql:' && url.hostname === '127.0.0.1' && url.port === '55439' && url.pathname === '/mobile_shop_audit') return url;
  } catch { /* Return a safe error without printing a connection string or password. */ }
  throw new Error('Аудит требует отдельную БД mobile_shop_audit на 127.0.0.1:55439; рабочая БД запрещена');
}
