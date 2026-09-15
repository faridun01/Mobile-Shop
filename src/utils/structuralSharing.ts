/** Reuse unchanged JSON-like state so identical API refreshes do not notify React. */
export function shareEqualValue<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return next;
  const array = Array.isArray(next);
  if (Array.isArray(previous) !== array) return next;
  if (!array && (Object.getPrototypeOf(previous) !== Object.prototype || Object.getPrototypeOf(next) !== Object.prototype)) return next;
  const old = previous as Record<string, unknown>;
  const value = next as Record<string, unknown>;
  const keys = Object.keys(value);
  let equal = Object.keys(old).length === keys.length;
  const shared = (array ? [] : {}) as Record<string, unknown>;
  for (const key of keys) {
    shared[key] = shareEqualValue(old[key], value[key]);
    if (!Object.prototype.hasOwnProperty.call(old, key) || !Object.is(shared[key], old[key])) equal = false;
  }
  return equal ? previous : shared as T;
}
