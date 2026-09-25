import { describe, expect, it } from 'vitest';
import { extractImeis, isValidImei } from './imei';

// Real-format IMEIs with correct Luhn check digits.
const IMEI1 = '490154203237518';
const IMEI2 = '356938035643809';

describe('IMEI recognition', () => {
  it('accepts 15 digits with a valid check digit only', () => {
    expect(isValidImei(IMEI1)).toBe(true);
    expect(isValidImei(IMEI2)).toBe(true);
    expect(isValidImei('490154203237519')).toBe(false); // wrong check digit (misread)
    expect(isValidImei('4901542032375')).toBe(false);
    expect(isValidImei('49015420323751A')).toBe(false);
  });

  it('ignores the other barcodes on a phone box', () => {
    expect(extractImeis('4006381333931')).toEqual([]); // EAN-13
    expect(extractImeis('R58N123ABCD')).toEqual([]); // serial number
    expect(extractImeis('3569380356438091')).toEqual([]); // 16-digit IMEISV
    expect(extractImeis('MQ3D3LL/A')).toEqual([]); // part number
  });

  it('reads plain, separated and QR/DataMatrix payloads', () => {
    expect(extractImeis(` ${IMEI1} `)).toEqual([IMEI1]);
    expect(extractImeis('49-015420-323751-8')).toEqual([IMEI1]);
    expect(extractImeis(`IMEI1:${IMEI1};IMEI2:${IMEI2};SN:R58N123`)).toEqual([IMEI1, IMEI2]);
    expect(extractImeis(`IMEI ${IMEI1}\nIMEI ${IMEI1}`)).toEqual([IMEI1]);
  });
});
