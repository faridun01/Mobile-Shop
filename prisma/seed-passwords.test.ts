import { describe, expect, it } from 'vitest';
import { seedPassword } from './seed-passwords';
describe('seed credential boundary', () => {
  it('requires explicit strong credentials by default', () => {
    expect(() => seedPassword('admin', 'admin123', {})).toThrow('SEED_PASSWORD_ADMIN');
    expect(() => seedPassword('admin', 'admin123', { SEED_PASSWORD_ADMIN: 'admin123' })).toThrow();
    expect(seedPassword('admin', 'admin123', { SEED_PASSWORD_ADMIN: 'unique-test-password-123' })).toBe('unique-test-password-123');
  });
  it('allows known credentials only in isolated local test databases', () => {
    const env = { SEED_TEST_DATA: 'true', DATABASE_URL: 'postgresql://localhost/shop?schema=deployment_test_1' };
    expect(seedPassword('admin', 'admin123', env)).toBe('admin123');
    expect(() => seedPassword('admin', 'admin123', { ...env, NODE_ENV: 'production' })).toThrow();
    expect(() => seedPassword('admin', 'admin123', { ...env, DATABASE_URL: 'postgresql://localhost/shop' })).toThrow();
    expect(() => seedPassword('admin', 'admin123', { ...env, DATABASE_URL: 'postgresql://remote/shop_ci' })).toThrow();
  });
});
