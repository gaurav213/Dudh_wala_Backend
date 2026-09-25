/** Calendar date helpers using the app default timezone (India). */

export const APP_TIMEZONE = 'Asia/Kolkata';

/** YYYY-MM-DD for "today" in Asia/Kolkata (not UTC). */
export function todayIso(timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Hour 0–23 in Asia/Kolkata. */
export function currentHourIst(): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  return Number.parseInt(hour, 10);
}

/** Morning = before 15:00 IST (covers early-morning test runs after midnight). */
export function isMorningNow(): boolean {
  return currentHourIst() < 15;
}
