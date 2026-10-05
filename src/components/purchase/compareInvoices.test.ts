import { describe, it, expect } from 'vitest';
import { compareInvoicesDesc } from './types';

describe('compareInvoicesDesc', () => {
  it('sorts newer dates before older dates', () => {
    const older = { id: '1', date: '2026-10-01T10:00:00.000Z', invoiceNumber: 'INV-0001' };
    const newer = { id: '2', date: '2026-10-05T10:00:00.000Z', invoiceNumber: 'INV-0002' };

    const sorted = [older, newer].sort(compareInvoicesDesc);
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
  });

  it('sorts newer times on the same day before earlier times', () => {
    const morning = { id: '1', date: '2026-10-05T09:00:00.000Z', invoiceNumber: 'INV-0001' };
    const afternoon = { id: '2', date: '2026-10-05T14:30:00.000Z', invoiceNumber: 'INV-0002' };

    const sorted = [morning, afternoon].sort(compareInvoicesDesc);
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
  });

  it('sorts by natural invoice number descending when dates are identical midnight', () => {
    const inv1 = { id: '1', date: '2026-10-05T00:00:00.000Z', invoiceNumber: 'INV-0001' };
    const inv2 = { id: '2', date: '2026-10-05T00:00:00.000Z', invoiceNumber: 'INV-0002' };
    const inv9 = { id: '9', date: '2026-10-05T00:00:00.000Z', invoiceNumber: 'INV-0009' };
    const inv10 = { id: '10', date: '2026-10-05T00:00:00.000Z', invoiceNumber: 'INV-0010' };

    const list = [inv1, inv10, inv2, inv9];
    list.sort(compareInvoicesDesc);

    expect(list.map(i => i.invoiceNumber)).toEqual(['INV-0010', 'INV-0009', 'INV-0002', 'INV-0001']);
  });

  it('handles custom prefixes and natural number ordering', () => {
    const p1 = { id: '1', date: '2026-10-05', invoiceNumber: '№ 5' };
    const p2 = { id: '2', date: '2026-10-05', invoiceNumber: '№ 20' };
    const p3 = { id: '3', date: '2026-10-05', invoiceNumber: '№ 100' };

    const list = [p1, p3, p2];
    list.sort(compareInvoicesDesc);

    expect(list.map(i => i.invoiceNumber)).toEqual(['№ 100', '№ 20', '№ 5']);
  });

  it('breaks ties using id when date and invoiceNumber are identical', () => {
    const a = { id: 'aaa', date: '2026-10-05', invoiceNumber: 'INV-0001' };
    const b = { id: 'zzz', date: '2026-10-05', invoiceNumber: 'INV-0001' };

    const list = [a, b];
    list.sort(compareInvoicesDesc);

    expect(list[0].id).toBe('zzz');
    expect(list[1].id).toBe('aaa');
  });
});
