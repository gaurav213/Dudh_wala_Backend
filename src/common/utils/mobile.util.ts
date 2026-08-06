/**
 * Normalize Indian mobile numbers to digits with country code: 91XXXXXXXXXX
 */
export function normalizeMobileNumber(input: string): string {
  if (!input) {
    throw new Error('Mobile number is required');
  }
  let digits = input.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }
  digits = digits.replace(/\D/g, '');

  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 13 && digits.startsWith('091')) {
    return digits.slice(1);
  }

  throw new Error(
    'Invalid Indian mobile number. Expected 10 digits or +91XXXXXXXXXX',
  );
}

export function isValidIndianMobile(input: string): boolean {
  try {
    const normalized = normalizeMobileNumber(input);
    return /^91[6-9]\d{9}$/.test(normalized);
  } catch {
    return false;
  }
}
