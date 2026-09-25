export function seedPassword(login: string, testPassword: string, env = process.env): string {
  if (env.SEED_TEST_DATA === 'true') {
    const url = new URL(env.DATABASE_URL || '');
    const isolated = /^(audit_fixes_|refund_share_test_|project_review_|deployment_test_)/.test(url.searchParams.get('schema') || '') || url.pathname.endsWith('_ci');
    if (env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(url.hostname) || !isolated) {
      throw new Error('Test seed requires a local isolated test schema/database and non-production mode');
    }
    return testPassword;
  }
  const key = `SEED_PASSWORD_${login.toUpperCase()}`;
  const password = env[key];
  if (!password || password.length < 16 || ['admin123', 'partner123', 'seller123'].includes(password)) {
    throw new Error(`${key} must contain a unique password of at least 16 characters for a new user`);
  }
  return password;
}
