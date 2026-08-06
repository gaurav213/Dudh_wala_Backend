/**
 * Pure helper for default-address uniqueness (unit-tested).
 * Given the customer's existing addresses and the id that should become the
 * new default, returns the ids of any other addresses currently flagged as
 * default that must be cleared.
 */
export interface DefaultAddressCandidate {
  id: string;
  isDefault: boolean;
}

export function selectAddressIdsToClear(
  addresses: DefaultAddressCandidate[],
  newDefaultId: string,
): string[] {
  return addresses
    .filter((a) => a.isDefault && a.id !== newDefaultId)
    .map((a) => a.id);
}

/** Whether a newly created address should be marked default. */
export function shouldDefaultNewAddress(
  existingAddressCount: number,
  requestedDefault: boolean | undefined,
): boolean {
  if (existingAddressCount === 0) return true;
  return requestedDefault === true;
}
