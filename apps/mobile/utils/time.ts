/**
 * Business time helpers. The company runs on Africa/Cairo time; the API stores and
 * returns UTC timestamps. Everything shown to users is formatted in Cairo time.
 */

export const BUSINESS_TZ = 'Africa/Cairo';

function locale(lang: string): string {
  return lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
}

export function formatTime(iso: string | null | undefined, lang = 'en'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? locale(lang) : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: BUSINESS_TZ,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, lang = 'en'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: lang !== 'ar' ? true : undefined,
    timeZone: BUSINESS_TZ,
  }).format(new Date(iso));
}

/** Formats a business date string ("2026-10-29") without timezone drift. */
export function formatBusinessDate(
  day: string | null | undefined,
  lang = 'en',
  style: 'long' | 'short' | 'weekday' = 'long',
): string {
  if (!day) return '—';
  const date = new Date(`${day}T12:00:00Z`);
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : style === 'weekday'
        ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }
        : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale(lang), options).format(date);
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

function cairoParts(date: Date): Parts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

/** Offset of Cairo from UTC (minutes) at the given instant — handles Egyptian DST. */
export function cairoOffsetMinutes(at: Date): number {
  const p = cairoParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** Build an ISO timestamp (with offset) for a Cairo wall-clock time on a business date. */
export function cairoDateTimeISO(day: string, hhmm: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = cairoOffsetMinutes(new Date(guess.getTime() - 2 * 3600_000));
  const utc = new Date(guess.getTime() - offset * 60_000);
  return utc.toISOString();
}

/** "HH:MM" in Cairo time for an ISO timestamp. */
export function cairoHHMM(iso: string): string {
  const p = cairoParts(new Date(iso));
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Today's business date ("YYYY-MM-DD") in Cairo, optionally shifted by days. */
export function cairoToday(offsetDays = 0, now: Date = new Date()): string {
  const p = cairoParts(new Date(now.getTime() + offsetDays * 86_400_000));
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addMinutesHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatHHMM(hhmm: string, lang = 'en'): string {
  return formatTime(cairoDateTimeISO(cairoToday(), hhmm), lang);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function greetingKey(now: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const hour = cairoParts(now).hour;
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
