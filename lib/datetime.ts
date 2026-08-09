/**
 * Date and time helpers.
 *
 * The API speaks ISO 8601 instants in UTC (`2026-08-08T10:00:00.000Z`) in both
 * directions. The app displays them in the device's own zone as
 * "08 Aug 2026" / "06:00 PM", and sends `Date#toISOString()` back — so the wire
 * format never depends on the locale the phone happens to be set to.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/** "08 Aug 2026" */
export function formatDate(date: Date) {
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "06:00 PM" */
export function formatTime(date: Date) {
  const hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(twelve)}:${pad(date.getMinutes())} ${suffix}`;
}

/** "2026-08-08" — what goes on the wire. */
export function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "18:00" — what goes on the wire. */
export function isoTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Today, tomorrow, and the following `days - 2` dates. */
export function upcomingDates(days = 60, from = new Date()) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** Every slot in a day at `stepMins` apart. */
export function timeSlots(stepMins = 15) {
  const slots: Date[] = [];
  const base = new Date();
  base.setSeconds(0, 0);
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMins) {
    const d = new Date(base);
    d.setHours(Math.floor(minutes / 60), minutes % 60);
    slots.push(d);
  }
  return slots;
}

/** "Today" / "Tomorrow" / weekday, used as the secondary line in the picker. */
export function relativeDay(date: Date, from = new Date()) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = Math.round((date.getTime() - start.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long' });
}

/** Merges a picked date with a picked time into one instant. */
export function combine(date: Date, time: Date) {
  const merged = new Date(date);
  merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return merged;
}

/* ------------------------------------------------------------- Wire format */

/** Parses an ISO instant from the API. Null-safe, and null on anything bad. */
export function parseISO(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** What goes on the wire — a full ISO 8601 instant in UTC. */
export function toISO(date: Date) {
  return date.toISOString();
}

/** "08 Aug 2026" from an ISO instant, or `—`. */
export function isoToDate(value: string | null | undefined, fallback = '—') {
  const date = parseISO(value);
  return date ? formatDate(date) : fallback;
}

/** "06:00 PM" from an ISO instant, or `—`. */
export function isoToTime(value: string | null | undefined, fallback = '—') {
  const date = parseISO(value);
  return date ? formatTime(date) : fallback;
}

/** "08 Aug 2026, 06:00 PM" from an ISO instant, or `—`. */
export function isoToDateTime(value: string | null | undefined, fallback = '—') {
  const date = parseISO(value);
  return date ? `${formatDate(date)}, ${formatTime(date)}` : fallback;
}

/**
 * "08 Aug, 10:00 AM → 06:00 PM" when both ends are the same day, and
 * "08 Aug, 10:00 AM → 09 Aug, 06:00 PM" when they aren't.
 */
export function isoRange(start: string | null | undefined, end: string | null | undefined) {
  const from = parseISO(start);
  const to = parseISO(end);
  if (!from) return '—';

  const left = `${pad(from.getDate())} ${MONTHS[from.getMonth()]}, ${formatTime(from)}`;
  if (!to) return left;

  const sameDay =
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth() &&
    from.getDate() === to.getDate();

  return sameDay
    ? `${left} → ${formatTime(to)}`
    : `${left} → ${pad(to.getDate())} ${MONTHS[to.getMonth()]}, ${formatTime(to)}`;
}

/** "just now" / "12m ago" / "3h ago" / "08 Aug 2026" — for timestamps in lists. */
export function timeAgo(value: string | null | undefined, from = new Date()) {
  const date = parseISO(value);
  if (!date) return '—';

  const seconds = Math.round((from.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return isoToDateTime(value);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatDate(date);
}

/** "2h 15m" from a duration in minutes. Used where the server sends no label. */
export function formatMinutes(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
