/** IST calendar YYYY-MM-DD helpers for farm money windows. */

export function todayInTz(timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Add days to an ISO date (YYYY-MM-DD) without local TZ drift. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday-start week containing `todayIso`. */
export function startOfWeekIso(todayIso: string): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  const diff = dow === 0 ? 6 : dow - 1;
  return addDaysIso(todayIso, -diff);
}

export function startOfMonthIso(todayIso: string): string {
  return `${todayIso.slice(0, 8)}01`;
}
