import {
  selectAddressIdsToClear,
  shouldDefaultNewAddress,
} from './customer-address.util';

describe('selectAddressIdsToClear', () => {
  it('returns other default addresses excluding the new default', () => {
    const result = selectAddressIdsToClear(
      [
        { id: 'a1', isDefault: true },
        { id: 'a2', isDefault: false },
        { id: 'a3', isDefault: true },
      ],
      'a3',
    );
    expect(result).toEqual(['a1']);
  });

  it('returns empty array when no other address is default', () => {
    const result = selectAddressIdsToClear(
      [
        { id: 'a1', isDefault: false },
        { id: 'a2', isDefault: false },
      ],
      'a2',
    );
    expect(result).toEqual([]);
  });

  it('does not include the new default id even if already flagged default', () => {
    const result = selectAddressIdsToClear(
      [{ id: 'a1', isDefault: true }],
      'a1',
    );
    expect(result).toEqual([]);
  });
});

describe('shouldDefaultNewAddress', () => {
  it('forces default when it is the first address', () => {
    expect(shouldDefaultNewAddress(0, undefined)).toBe(true);
    expect(shouldDefaultNewAddress(0, false)).toBe(true);
  });

  it('respects requested flag when other addresses exist', () => {
    expect(shouldDefaultNewAddress(2, true)).toBe(true);
    expect(shouldDefaultNewAddress(2, false)).toBe(false);
    expect(shouldDefaultNewAddress(2, undefined)).toBe(false);
  });
});
