/** Profile step does not require email — that field is optional. */
export function isFarmProfileComplete(farm: {
  businessName?: string | null;
  description?: string | null;
}): boolean {
  return Boolean(farm.businessName?.trim() && farm.description?.trim());
}

/** Same fields as [isFarmProfileComplete] — not lat/lng map pins. */
export function farmProfileCompletionPercent(farm: {
  businessName?: string | null;
  description?: string | null;
}): number {
  const filled = [farm.businessName, farm.description].filter((v) =>
    Boolean(v?.trim()),
  ).length;
  return Math.round((filled / 2) * 100);
}
