/** Store-bound roles cannot use operational screens until an admin assigns a store. */
export function needsStoreAssignment(user: { role: string; storeId?: string | null } | null | undefined): boolean {
  return Boolean(user && (user.role === 'SELLER' || user.role === 'PARTNER') && !user.storeId);
}
