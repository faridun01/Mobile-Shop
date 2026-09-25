// Shared by the native build validator and the runtime network clients.
export function requireNativeUrl(value: string | undefined, protocol: 'https:' | 'wss:', name: string): string {
  try {
    const url = new URL(value ?? '');
    if (url.protocol === protocol && url.hostname && !url.username && !url.password
      && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return url.href;
  } catch { /* Report the variable name, never credentials or its value. */ }
  throw new Error(`${name} must be an absolute ${protocol}// production URL for the native app.`);
}
