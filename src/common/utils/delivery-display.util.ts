/** Human label for MilkType enum values. */
export function milkTypeLabel(milkType?: string | null): string {
  switch (milkType) {
    case 'COW':
      return 'Cow milk';
    case 'BUFFALO':
      return 'Buffalo milk';
    case 'MIXED':
      return 'Mixed milk';
    case 'TONED':
      return 'Toned milk';
    case 'OTHER':
      return 'Milk';
    default:
      return milkType && milkType.trim()
        ? milkType.replace(/_/g, ' ')
        : 'Milk';
  }
}

export function resolveProductName(parts: {
  productName?: string | null;
  milkType?: string | null;
}): string {
  const named = parts.productName?.trim();
  if (named) return named;
  return milkTypeLabel(parts.milkType);
}
