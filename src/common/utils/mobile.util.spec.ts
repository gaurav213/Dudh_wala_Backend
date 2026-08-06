import { normalizeMobileNumber } from './mobile.util';

describe('normalizeMobileNumber', () => {
  it('normalizes 10-digit numbers with 91 prefix', () => {
    expect(normalizeMobileNumber('9876543210')).toBe('919876543210');
  });

  it('strips spaces and plus', () => {
    expect(normalizeMobileNumber('+91 98765 43210')).toBe('919876543210');
  });
});
