/** Profile step does not require email — that field is optional. */
export function isFarmProfileComplete(farm: {
  businessName?: string | null;
  description?: string | null;
}): boolean {
  return Boolean(farm.businessName?.trim() && farm.description?.trim());
}
