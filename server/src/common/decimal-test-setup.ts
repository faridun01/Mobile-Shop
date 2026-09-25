import { expect } from 'vitest';
import { Prisma } from '@prisma/client';
// Existing business fixtures express expected amounts as numeric literals. Compare
// their exact decimal values, never an epsilon; dedicated tests assert the type too.
expect.addEqualityTesters([(a, b) => {
  if (!Prisma.Decimal.isDecimal(a) && !Prisma.Decimal.isDecimal(b)) return undefined;
  if (!(Prisma.Decimal.isDecimal(a) || typeof a === 'number') || !(Prisma.Decimal.isDecimal(b) || typeof b === 'number')) return false;
  return new Prisma.Decimal(a).eq(b);
}]);
