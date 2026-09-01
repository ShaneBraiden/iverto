/**
 * Backend status → what the app draws.
 *
 * The server runs a 15-state machine; the app shows five chips. Everything
 * that maps a concrete status onto a chip, a colour, a label or a piece of
 * copy lives here, so no screen ever has to know the state machine.
 *
 * The chip → status expansion mirrors §"Status filters" of the API doc exactly:
 * a chip is sent to the server as-is and the server expands it, so the filter
 * bar and this file agree by construction.
 */
import { colors } from '@/theme';
import type { Permission, PermissionStatus, StatusChip } from '@/types';

/** The five buckets a status can fall into, plus the two terminal ones. */
export type StatusTone = 'pending' | 'approved' | 'active' | 'rejected' | 'expired' | 'cancelled';

/** Which chip a concrete status belongs to. */
const TONE: Record<PermissionStatus, StatusTone> = {
  draft: 'pending',
  pending_warden: 'pending',
  warden_approved: 'pending',
  waiting_parent: 'pending',
  escalated: 'pending',
  contact_parent: 'pending',
  parent_approved: 'approved',
  completed: 'approved',
  active: 'active',
  student_exited: 'active',
  rejected_warden: 'rejected',
  rejected_parent: 'rejected',
  parent_unreachable: 'rejected',
  expired: 'expired',
  cancelled: 'cancelled',
};

/** The short label on the pill. Specific enough to be worth reading. */
const LABEL: Record<PermissionStatus, string> = {
  draft: 'Draft',
  pending_warden: 'With warden',
  warden_approved: 'Warden cleared',
  waiting_parent: 'Awaiting guardian',
  parent_approved: 'Approved',
  active: 'Active',
  student_exited: 'Out',
  completed: 'Completed',
  rejected_warden: 'Rejected by warden',
  rejected_parent: 'Rejected by guardian',
  escalated: 'Escalated',
  contact_parent: 'Contacting guardian',
  parent_unreachable: 'Guardian unreachable',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/** One line explaining what the state actually means for the reader. */
const EXPLAINER: Record<PermissionStatus, string> = {
  draft: 'Not submitted yet.',
  pending_warden: 'Waiting for the warden to review it.',
  warden_approved: 'The warden has cleared it — the guardian is next.',
  waiting_parent: 'Waiting for the guardian to respond.',
  parent_approved: 'The guardian approved it. The gate can let them out.',
  active: 'The pass is live right now.',
  student_exited: 'Scanned out at the gate.',
  completed: 'Returned and closed.',
  rejected_warden: 'The warden turned it down.',
  rejected_parent: 'The guardian turned it down.',
  escalated: 'The guardian did not respond in time — the warden was alerted.',
  contact_parent: 'The office is contacting the guardian directly.',
  parent_unreachable: 'The guardian could not be reached.',
  expired: 'The window passed without the pass being used.',
  cancelled: 'Cancelled before it was used.',
};

const TONE_STYLE: Record<StatusTone, { fg: string; bg: string; icon: string }> = {
  pending: { fg: colors.warning, bg: colors.warningBg, icon: 'time-outline' },
  approved: { fg: colors.success, bg: colors.successBg, icon: 'checkmark-circle-outline' },
  active: { fg: colors.info, bg: colors.infoBg, icon: 'walk-outline' },
  rejected: { fg: colors.danger, bg: colors.dangerBg, icon: 'close-circle-outline' },
  expired: { fg: colors.textFaint, bg: colors.neutralBg, icon: 'hourglass-outline' },
  cancelled: { fg: colors.textFaint, bg: colors.neutralBg, icon: 'ban-outline' },
};

const FALLBACK = { fg: colors.textFaint, bg: colors.neutralBg, icon: 'ellipse-outline' };

/** Everything a pill, a banner or a stat tile needs for one status. */
export function statusInfo(status: PermissionStatus | string) {
  const tone = TONE[status as PermissionStatus];
  const style = tone ? TONE_STYLE[tone] : FALLBACK;
  return {
    tone: tone ?? ('pending' as StatusTone),
    label: LABEL[status as PermissionStatus] ?? humanise(status),
    explainer: EXPLAINER[status as PermissionStatus] ?? '',
    ...style,
  };
}

/** `pending_warden` → `Pending warden`, for a status this build doesn't know. */
function humanise(status: string) {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* -------------------------------------------------------------- Predicates */

/** Still moving through the approval chain. */
export function isOpen(status: PermissionStatus | string) {
  const tone = TONE[status as PermissionStatus];
  return tone === 'pending' || tone === 'approved' || tone === 'active';
}

/** The guardian can still decide this one. */
export function needsGuardian(status: PermissionStatus | string) {
  return status === 'waiting_parent';
}

/** The student can still pull this one back. */
export function isCancellable(status: PermissionStatus | string) {
  return (
    status === 'draft' ||
    status === 'pending_warden' ||
    status === 'warden_approved' ||
    status === 'waiting_parent' ||
    status === 'parent_approved'
  );
}

/** The warden queue acts on these. */
export function needsWarden(status: PermissionStatus | string) {
  return status === 'pending_warden' || status === 'escalated';
}

/**
 * The student is out on this pass, so the warden can close it by hand.
 *
 * `active` and `student_exited` are the same thing seen from two places — the
 * warden activated the pass, and the gate scanned them out — and a campus
 * without a working scanner only ever reaches the first. Both are open passes
 * with a clock running against `endTime`, so both are closeable and both are
 * what "late back" is measured on.
 */
export function isEndable(status: PermissionStatus | string) {
  return status === 'active' || status === 'student_exited';
}

/**
 * How far past its return time an open pass is, in minutes. `0` when it is not
 * late, and `0` for any pass the student is not out on.
 *
 * The server's own count wins whenever it sends one: it is measured against
 * the same clock that decides when the late alert goes out, so a phone whose
 * time is off by ten minutes cannot disagree with what the guardian was told.
 * Falling back to the device clock is what keeps the badge right against a
 * server that has not shipped the overdue sweep yet.
 */
export function overdueMinutes(p: Permission, now: Date = new Date()) {
  if (!isEndable(p.status)) return 0;
  if (typeof p.overdueMinutes === 'number') return Math.max(0, p.overdueMinutes);
  const due = p.endTime ? new Date(p.endTime) : null;
  if (!due || Number.isNaN(due.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 60_000));
}

/** Out on a pass whose return time has already passed. */
export function isOverdue(p: Permission, now?: Date) {
  if (!isEndable(p.status)) return false;
  if (typeof p.overdue === 'boolean') return p.overdue;
  return overdueMinutes(p, now) > 0;
}

/* ------------------------------------------------------------------- Chips */

/** The chips shown on each role's filter bar, in order. */
export const CHIPS: { key: StatusChip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Active' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** What goes in the `status=` query parameter. `all` is sent as nothing. */
export function statusParam(chip: StatusChip) {
  return chip === 'all' ? undefined : chip;
}

/* --------------------------------------------------------------- Overrides */

/** The concrete statuses an admin may force a permission into. */
export const OVERRIDE_STATUSES: { value: PermissionStatus; label: string }[] = [
  { value: 'rejected_warden', label: 'Reject' },
  { value: 'parent_approved', label: 'Approve on the guardian’s behalf' },
  { value: 'active', label: 'Mark active' },
  { value: 'completed', label: 'Mark completed' },
  { value: 'cancelled', label: 'Cancel' },
  { value: 'expired', label: 'Mark expired' },
];

/* -------------------------------------------------------- Permission reads */

/** Whichever timestamp actually marks the start of the trip. */
export function startsAt(p: Permission) {
  return p.startTime ?? p.startDate ?? null;
}

/** The label a card leads with — the category, uppercased for the tag. */
export function categoryLabel(p: Permission, categories?: { id: string; label: string }[]) {
  return categories?.find((c) => c.id === p.type)?.label ?? humanise(p.type);
}

/** Short, stable id for display: passes are cuids, so show the tail. */
export function shortId(id: string) {
  return id.length > 8 ? `#${id.slice(-6).toUpperCase()}` : `#${id.toUpperCase()}`;
}
