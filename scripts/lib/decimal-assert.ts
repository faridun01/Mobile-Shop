import strict from 'node:assert/strict';
import { decimalJsonReplacer } from '../../server/src/common/decimal';

// Money fields come back from Prisma as Decimal instances, which strict equality never
// matches against the plain numbers the regression scripts expect — compare the JSON
// view instead (Decimal -> number), same boundary the API responses go through.
const plain = (value: unknown): unknown =>
  value === undefined ? value : JSON.parse(JSON.stringify(value, decimalJsonReplacer));

function assert(value: unknown, message?: string | Error): asserts value {
  strict(value, message);
}
assert.equal = (actual: unknown, expected: unknown, message?: string | Error) => strict.equal(plain(actual), plain(expected), message);
assert.deepEqual = (actual: unknown, expected: unknown, message?: string | Error) => strict.deepEqual(plain(actual), plain(expected), message);
assert.match = strict.match;
assert.rejects = strict.rejects;

export default assert;
