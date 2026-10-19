import { describe, expect, it } from 'vitest';
import { disposableBrowserUrl } from '../../../scripts/lib/disposable-browser';
import { requireAuditDatabase } from '../../../scripts/lib/audit-database';

describe('legacy browser test isolation', () => {
  const db = 'postgresql://test:test@127.0.0.1:55439/mobile_shop_audit?schema=audit_fixes_browser_123';
  it('accepts an explicitly isolated local fixture', () => expect(disposableBrowserUrl(db, 'http://127.0.0.1:45555')).toBe('http://127.0.0.1:45555'));
  it.each([undefined, 'http://localhost:3000', 'http://127.0.0.1:3001', 'https://example.com', 'http://localhost', 'http://localhost:45555/api', 'http://localhost:45555?x=1'])('rejects unsafe browser target %s', url => expect(() => disposableBrowserUrl(db, url)).toThrow());
  it.each([undefined, db.replace('audit_fixes_browser_123', 'public'), db.replace('127.0.0.1', 'production.example')])('rejects non-disposable database %s', url => expect(() => disposableBrowserUrl(url, 'http://localhost:45555')).toThrow());
});

describe('full audit database isolation', () => {
  it('accepts only the dedicated audit database', () => expect(requireAuditDatabase('postgresql://audit:test@127.0.0.1:55439/mobile_shop_audit').pathname).toBe('/mobile_shop_audit'));
  it.each(['', 'postgresql://audit:test@127.0.0.1:5435/mobile_shop_db', 'postgresql://audit:test@127.0.0.1:55439/mobile_shop_db', 'postgresql://audit:test@remote.example:55439/mobile_shop_audit'])('rejects another database %s', url => expect(() => requireAuditDatabase(url)).toThrow());
});
