import { describe, expect, it } from 'vitest';
import { requireDeviceCode, requireImei } from './device-code';

describe('a typed IMEI is exactly 15 digits', () => {
  it('drops spaces and accepts 15 digits only', () => {
    expect(requireImei(' 35 4891 1002 3456 1 ')).toBe('354891100234561');
    expect(() => requireImei('35489110023456')).toThrow('IMEI должен содержать ровно 15 цифр');
    expect(() => requireImei('3548911002345612', 'IMEI 2')).toThrow('IMEI 2 должен содержать ровно 15 цифр');
    expect(() => requireImei('35489110023456A')).toThrow('ровно 15 цифр');
  });

  it('takes a tablet SN (with letters) where a phone or a tablet may come', () => {
    expect(requireDeviceCode('354891100234561')).toBe('354891100234561');
    expect(requireDeviceCode('r9tw ab001')).toBe('R9TWAB001');
    expect(() => requireDeviceCode('12345')).toThrow('ровно 15 цифр');
    expect(() => requireDeviceCode('A!')).toThrow('SN планшета');
  });
});
