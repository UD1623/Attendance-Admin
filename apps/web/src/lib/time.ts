import { toZonedTime, format as formatZoned } from 'date-fns-tz';

export const DEFAULT_TIMEZONE =
  import.meta.env.VITE_INSTITUTION_TIMEZONE || 'Asia/Kolkata';

function toStandardDate(date: Date | number | { toDate: () => Date }): Date {
  if (typeof date === 'number') {
    return new Date(date);
  }
  if (date instanceof Date) {
    return date;
  }
  if ('toDate' in date && typeof date.toDate === 'function') {
    return date.toDate();
  }
  return new Date(date as unknown as string | number | Date);
}

/**
 * Returns current Date in institutional timezone
 */
export function getNowInTimezone(tz: string = DEFAULT_TIMEZONE): Date {
  return toZonedTime(new Date(), tz);
}

/**
 * Format a Date or Timestamp to display date string (e.g. 20 Oct 2024)
 */
export function formatDate(date: Date | number | { toDate: () => Date }, tz: string = DEFAULT_TIMEZONE): string {
  const d = toStandardDate(date);
  return formatZoned(toZonedTime(d, tz), 'dd MMM yyyy', { timeZone: tz });
}

/**
 * Format a Date or Timestamp to time string (e.g. 09:30 AM)
 */
export function formatTime(date: Date | number | { toDate: () => Date }, tz: string = DEFAULT_TIMEZONE): string {
  const d = toStandardDate(date);
  return formatZoned(toZonedTime(d, tz), 'hh:mm a', { timeZone: tz });
}

/**
 * Format a Date or Timestamp to full date-time string
 */
export function formatDateTime(date: Date | number | { toDate: () => Date }, tz: string = DEFAULT_TIMEZONE): string {
  const d = toStandardDate(date);
  return formatZoned(toZonedTime(d, tz), 'dd MMM yyyy, hh:mm:ss a', { timeZone: tz });
}

/**
 * Returns ISO Date string "YYYY-MM-DD" for local timezone
 */
export function getLocalDateString(date: Date = new Date(), tz: string = DEFAULT_TIMEZONE): string {
  return formatZoned(toZonedTime(date, tz), 'yyyy-MM-dd', { timeZone: tz });
}
