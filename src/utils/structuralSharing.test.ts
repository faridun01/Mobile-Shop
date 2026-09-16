import { describe, expect, it } from 'vitest';
import { shareEqualValue } from './structuralSharing';

describe('API refresh structural sharing', () => {
  it('keeps identical nested responses stable', () => {
    const previous = [{ id: '1', amount: 100, items: [{ imei: '123' }] }];
    expect(shareEqualValue(previous, JSON.parse(JSON.stringify(previous)))).toBe(previous);
  });
  it('publishes a changed balance and reuses untouched records', () => {
    const first = { id: '1', amount: 100 };
    const second = { id: '2', amount: 200 };
    const result = shareEqualValue([first, second], [{ ...first }, { ...second, amount: 201 }]);
    expect(result[0]).toBe(first);
    expect(result[1]).toEqual({ id: '2', amount: 201 });
    expect(result[1]).not.toBe(second);
  });
  it('does not hide deleted fields, new undefined fields, reordering or removed rows', () => {
    const previous = [{ id: '1', optional: undefined }, { id: '2' }];
    expect(shareEqualValue(previous, [{ id: '1' }, { id: '2' }])).not.toBe(previous);
    expect(shareEqualValue(previous, [previous[1], previous[0]])).toEqual([previous[1], previous[0]]);
    expect(shareEqualValue(previous, [previous[0]])).toEqual([previous[0]]);
    expect(shareEqualValue({}, { added: undefined })).toHaveProperty('added');
  });
  it('preserves nulls, primitive types and callable values', () => {
    const callback = () => {};
    expect(shareEqualValue(null, null)).toBeNull();
    expect(shareEqualValue<unknown>(1, '1')).toBe('1');
    expect(shareEqualValue<unknown>([], {})).toEqual({});
    expect(shareEqualValue<unknown>(null, callback)).toBe(callback);
  });
});
