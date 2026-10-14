import type { UILocale } from './preferences';

const numbers = new Map<string, Intl.NumberFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();

/** Display only: never use these values for paths, sorting, input values or persisted records. */
export function formatUINumber(value: number, locale: UILocale, options?: Intl.NumberFormatOptions): string {
  const key = locale + JSON.stringify(options ?? {});
  let formatter = numbers.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    if (numbers.size >= 32) numbers.clear();
    numbers.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatUIDate(value: string, locale: UILocale, options: Intl.DateTimeFormatOptions, invalid: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return invalid;
  const key = locale + JSON.stringify(options);
  let formatter = dates.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    if (dates.size >= 32) dates.clear();
    dates.set(key, formatter);
  }
  return formatter.format(date);
}

export function formatUIMonth(value: string, locale: UILocale): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return formatUIDate(value + '-01T00:00:00Z', locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }, value);
}

export function formatUIBytes(size: number, locale: UILocale): string {
  const unit = size < 1024 ? 'B' : size < 1024 * 1024 ? 'KB' : 'MB';
  const amount = unit === 'B' ? size : size / (unit === 'KB' ? 1024 : 1024 * 1024);
  return `${formatUINumber(amount, locale, { minimumFractionDigits: unit === 'B' ? 0 : 1, maximumFractionDigits: unit === 'B' ? 0 : 1 })} ${unit}`;
}

export function formatUIResolution(value: string, locale: UILocale): string {
  const match = /^(\d+) × (\d+)$/.exec(value);
  return match ? `${formatUINumber(Number(match[1]), locale)} × ${formatUINumber(Number(match[2]), locale)}` : value;
}
