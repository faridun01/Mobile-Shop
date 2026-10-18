import { expect, it } from 'vitest';
import { needsStoreAssignment } from './storeAssignment';

it.each(['SELLER', 'PARTNER'])('blocks unassigned %s without granting access to every store', role => {
  expect(needsStoreAssignment({ role, storeId: null })).toBe(true);
  expect(needsStoreAssignment({ role, storeId: 'store-siyoma' })).toBe(false);
});
it('allows an admin without a store and leaves logged-out navigation to auth', () => {
  expect(needsStoreAssignment({ role: 'ADMIN', storeId: null })).toBe(false);
  expect(needsStoreAssignment(null)).toBe(false);
});
