import { expect, it } from 'vitest';
import { extractSerialCode, recognizeScanCodes } from './imei';
import { serialScanRegion } from './scanRegion';

it.each(['64548/05WX00022', '65577/W5SE65983', '72255/Y5XH00021', '70594/T5X801265'])('preserves slash in box SN %s', serial => {
  expect(recognizeScanCodes(serial, 'serial')).toEqual([serial]);
  expect(recognizeScanCodes(`SN: ${serial}`, 'serial')).toEqual([serial]);
});
it.each(['6932554426712', '6932554433444', '6932554477035'])('rejects the neighbouring product EAN %s', ean => {
  expect(recognizeScanCodes(ean, 'serial')).toEqual([]);
});
it('maps the serial aiming band to the visible cover crop, preserving source resolution', () => {
  const region = serialScanRegion(1920, 1080, 360, 280);
  expect(region.width).toBeCloseTo(1249.7142857);
  expect(region.height).toBeCloseTo(648);
  expect(region.x + region.width / 2).toBe(960);
  expect(region.y + region.height / 2).toBe(540);
});

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
