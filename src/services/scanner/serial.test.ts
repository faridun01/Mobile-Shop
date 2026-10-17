import { expect, it } from 'vitest';
import { extractSerialCode, recognizeScanCodes } from './imei';

it.each(['4601234567890', '012345678905', '490154203237518', '12345678', '12345678901234'])('does not put a product barcode or IMEI %s into tablet SN', value => {
  expect(extractSerialCode(value)).toBeNull();
  expect(recognizeScanCodes(value, 'code')).toEqual([value]);
});
it('reads a plain SN and an explicitly labelled SN from a combined QR', () => {
  expect(extractSerialCode(' r58n123abcd ')).toBe('R58N123ABCD');
  expect(extractSerialCode('IMEI:490154203237518;SN:R58N123ABCD;EAN:4601234567890')).toBe('R58N123ABCD');
  expect(extractSerialCode('S/N: 1234567890123')).toBe('1234567890123');
  expect(extractSerialCode('SERIAL NUMBER: ABCD-1234')).toBe('ABCD-1234');
});
it('rejects a model/part number or arbitrary payload', () => {
  expect(extractSerialCode('MK2K3LL/A')).toBeNull();
  expect(extractSerialCode('https://example.com/product')).toBeNull();
  expect(extractSerialCode('IMEI:490154203237518')).toBeNull();
});
it('keeps phone IMEI recognition independent of SN recognition', () => {
  expect(recognizeScanCodes('490154203237518', 'imei')).toEqual(['490154203237518']);
  expect(recognizeScanCodes('R58N123ABCD', 'imei')).toEqual([]);
});
