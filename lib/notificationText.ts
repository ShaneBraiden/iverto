/**
 * Human copy for a notification, whatever the server actually put in it.
 *
 * The inbox and the push tray both render `title` and `body` straight off the
 * notification row, and the sender does not always fill those in with prose:
 * some events arrive with the raw event code in the title — `parent_decided`,
 * `PARENT_APPROVAL_REQUEST` — and some arrive with no body at all. A guardian
 * reading "parent_decided" on their lock screen has been told nothing.
 *
 * This is the one place that decides what a reader sees, so the inbox row and
 * the banner say the same thing.
 *
 * The server stays the authority. Real copy is passed through untouched, and
 * only a value that is plainly a code — a single word, snake_cased, dotted or
 * SHOUTED — is replaced. The fix at the source is in
 * `server-changes-notifications.md`; this keeps every already-installed build
 * readable until that lands, and keeps it readable afterwards for any event
 * type the sender adds later and forgets to write copy for.
 */

/** Enough of an `AppNotification` — or of an FCM payload — to name it. */
export type NotificationLike = {
  type?: string | null;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
};

export type NotificationCopy = { title: string; body: string };

/**
 * True when a string is an identifier rather than something written for a
 * person to read.
 *
 * Anything with a space in it is prose and is left alone — that check comes
 * first on purpose, because "Warden approved" is copy and `warden_approved` is
 * not, and the only difference is the separator.
 */
export function looksLikeCode(value: string | null | undefined) {
  const s = (value ?? '').trim();
  if (!s) return true;
  if (/\s/.test(s)) return false;
  /* `ESCALATED`, `PARENT_APPROVAL_REQUEST`. */
  if (/^[A-Z0-9][A-Z0-9_.-]*$/.test(s)) return true;
  /* `parent_decided`, `permission.approved`, `late-entry`. */
  return /[_.-]/.test(s);
}

/** `parent_decided` / `permission.approved` → `PARENT_DECIDED` / `PERMISSION_APPROVED`. */
function key(code: string) {
  return code
    .trim()
    .toUpperCase()
    .replace(/[\s.\-/]+/g, '_');
}

/**
 * Copy per event, keyed by the normalised code.
 *
 * Written from the reader's side rather than the system's: the same event
 * reaches a student, a guardian and a warden, and none of them care which
 * table row moved. `body` is only used when the server sent none of its own —
 * a real body naming the student and the reason always wins.
 */
const COPY: Record<string, NotificationCopy> = {
  /* --- The approval chain --- */
  PARENT_APPROVAL_REQUEST: {
    title: 'Approval needed',
    body: 'A pass request is waiting for your decision.',
  },
  PARENT_DECIDED: {
    title: 'Guardian has responded',
    body: 'The guardian has answered the pass request.',
  },
  PARENT_APPROVED: {
    title: 'Guardian approved the pass',
    body: 'The guardian has approved the request.',
  },
  PARENT_REJECTED: {
    title: 'Guardian turned the pass down',
    body: 'The guardian did not approve the request.',
  },
  PARENT_CONTACT_WARDEN: {
    title: 'Guardian wants to speak to the warden',
    body: 'A guardian has asked to talk this request over before deciding.',
  },
  PARENT_UNREACHABLE: {
    title: 'Guardian could not be reached',
    body: 'Nobody has been able to reach the guardian about this request.',
  },
  WARDEN_APPROVAL_REQUEST: {
    title: 'New pass request',
    body: 'A student has submitted a pass request for your review.',
  },
  WARDEN_DECIDED: {
    title: 'Warden has responded',
    body: 'The warden has reviewed the pass request.',
  },
  WARDEN_APPROVED: {
    title: 'Warden cleared the pass',
    body: 'The warden has cleared it — the guardian is next.',
  },
  WARDEN_REJECTED: {
    title: 'Warden turned the pass down',
    body: 'The warden did not approve the request.',
  },
  PENDING_WARDEN: {
    title: 'New pass request',
    body: 'A student has submitted a pass request for your review.',
  },
  WAITING_PARENT: {
    title: 'Approval needed',
    body: 'A pass request is waiting for the guardian to respond.',
  },
  ESCALATED: {
    title: 'Request escalated to the warden',
    body: 'The guardian did not respond in time, so the warden has been asked to step in.',
  },
  CONTACT_PARENT: {
    title: 'Guardian is being contacted',
    body: 'The office is contacting the guardian about this request directly.',
  },

  /* --- The pass itself --- */
  PERMISSION_ACTIVATED: { title: 'Pass is active', body: 'The pass is live and the gate can let them out.' },
  ACTIVE: { title: 'Pass is active', body: 'The pass is live and the gate can let them out.' },
  STUDENT_EXITED: { title: 'Scanned out at the gate', body: 'The student has left campus on this pass.' },
  COMPLETED: { title: 'Back on campus', body: 'The student has scanned back in and the pass is closed.' },
  EXPIRED: { title: 'Pass expired', body: 'The window passed without the pass being used.' },
  CANCELLED: { title: 'Pass cancelled', body: 'The request was cancelled before it was used.' },
  PERMISSION_OVERRIDE: {
    title: 'Pass status overridden',
    body: 'An administrator has changed the status of this pass.',
  },
  GATE_SCAN_IN: { title: 'Scanned in at the gate', body: 'Back on campus.' },
  GATE_SCAN_OUT: { title: 'Scanned out at the gate', body: 'Off campus.' },
  LATE_ENTRY: {
    title: 'Late return recorded',
    body: 'A return after the due-back time has been logged.',
  },

  /* --- Everything else that reaches an inbox --- */
  ANNOUNCEMENT: { title: 'Campus announcement', body: 'There is a new announcement for you.' },
  PROFILE_REQUEST: { title: 'Profile change request', body: 'A profile change is waiting for review.' },
  PROFILE_REQUEST_CREATED: {
    title: 'Profile change requested',
    body: 'A profile change is waiting for review.',
  },
  PROFILE_REQUEST_APPROVED: {
    title: 'Profile change approved',
    body: 'Your requested profile change has been applied.',
  },
  PROFILE_REQUEST_REJECTED: {
    title: 'Profile change declined',
    body: 'Your requested profile change was not applied.',
  },
  EMERGENCY: { title: 'Emergency alert', body: 'A guardian has raised an emergency alert.' },
  EMERGENCY_RAISE: { title: 'Emergency alert', body: 'A guardian has raised an emergency alert.' },
  EMERGENCY_RESOLVE: { title: 'Emergency resolved', body: 'The emergency alert has been closed.' },
};

/** Ionicons name per event, once the code has been resolved. */
const ICONS: Record<string, string> = {
  PARENT_APPROVAL_REQUEST: 'people-outline',
  PARENT_DECIDED: 'people-outline',
  PARENT_APPROVED: 'checkmark-circle-outline',
  PARENT_REJECTED: 'close-circle-outline',
  PARENT_CONTACT_WARDEN: 'call-outline',
  PARENT_UNREACHABLE: 'call-outline',
  WARDEN_APPROVAL_REQUEST: 'document-text-outline',
  WARDEN_DECIDED: 'shield-checkmark-outline',
  WARDEN_APPROVED: 'checkmark-done-outline',
  WARDEN_REJECTED: 'close-circle-outline',
  PENDING_WARDEN: 'document-text-outline',
  WAITING_PARENT: 'people-outline',
  ESCALATED: 'alert-circle-outline',
  CONTACT_PARENT: 'call-outline',
  PERMISSION_ACTIVATED: 'walk-outline',
  ACTIVE: 'walk-outline',
  STUDENT_EXITED: 'log-out-outline',
  COMPLETED: 'checkmark-circle-outline',
  EXPIRED: 'hourglass-outline',
  CANCELLED: 'ban-outline',
  PERMISSION_OVERRIDE: 'hand-left-outline',
  GATE_SCAN_IN: 'log-in-outline',
  GATE_SCAN_OUT: 'log-out-outline',
  LATE_ENTRY: 'time-outline',
  ANNOUNCEMENT: 'megaphone-outline',
  PROFILE_REQUEST: 'create-outline',
  PROFILE_REQUEST_CREATED: 'create-outline',
  PROFILE_REQUEST_APPROVED: 'create-outline',
  PROFILE_REQUEST_REJECTED: 'create-outline',
  EMERGENCY: 'warning-outline',
  EMERGENCY_RAISE: 'warning-outline',
  EMERGENCY_RESOLVE: 'shield-checkmark-outline',
};

/**
 * The best code available for this notification.
 *
 * The `type` column is the intended home, but the same identifier turns up in
 * `data.type`, in `data.event` for status changes, and — the case that started
 * all this — in `title`, where the sender used it instead of writing copy. Any
 * of them will do; they are all the same vocabulary.
 */
export function eventKey(n: NotificationLike): string | null {
  const data = n.data ?? {};
  const candidates = [
    n.type,
    typeof data.type === 'string' ? data.type : null,
    typeof data.event === 'string' ? data.event : null,
    /* Last, and only when it is a code — a real title must never be read as one. */
    looksLikeCode(n.title) ? n.title : null,
  ];
  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) return key(String(candidate));
  }
  return null;
}

/**
 * Copy for a code this build has no entry for.
 *
 * Matched on what the code mentions rather than left to the sentence-cased
 * fallback, because "Parent decided" is barely better than `parent_decided` —
 * it still reads as a database row rather than as news.
 */
function guess(code: string): NotificationCopy | null {
  if (code.includes('EMERGENC')) return COPY.EMERGENCY;
  if (code.includes('ANNOUNCE')) return COPY.ANNOUNCEMENT;
  if (code.includes('PROFILE')) return COPY.PROFILE_REQUEST;
  if (code.includes('LATE')) return COPY.LATE_ENTRY;
  if (code.includes('SCAN')) {
    return code.includes('OUT') ? COPY.GATE_SCAN_OUT : COPY.GATE_SCAN_IN;
  }
  if (code.includes('PARENT') || code.includes('GUARDIAN')) {
    if (code.includes('REJECT') || code.includes('DECLIN')) return COPY.PARENT_REJECTED;
    if (code.includes('APPROV')) return COPY.PARENT_APPROVED;
    if (code.includes('REQUEST')) return COPY.PARENT_APPROVAL_REQUEST;
    return COPY.PARENT_DECIDED;
  }
  if (code.includes('WARDEN')) {
    if (code.includes('REJECT') || code.includes('DECLIN')) return COPY.WARDEN_REJECTED;
    if (code.includes('APPROV')) return COPY.WARDEN_APPROVED;
    return COPY.WARDEN_DECIDED;
  }
  if (code.includes('REJECT') || code.includes('DECLIN')) {
    return { title: 'Pass request declined', body: 'The request was not approved.' };
  }
  if (code.includes('APPROV')) {
    return { title: 'Pass request approved', body: 'The request has been approved.' };
  }
  if (code.includes('CANCEL')) return COPY.CANCELLED;
  if (code.includes('EXPIRE')) return COPY.EXPIRED;
  return null;
}

/** `PARENT_DECIDED` → `Parent decided`. The last resort, never the first. */
function sentenceCase(code: string) {
  const words = code.replace(/_/g, ' ').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What to actually draw for a notification.
 *
 * Title and body are decided independently: a sender that wrote a proper body
 * and left the title as the event code should keep its body, and vice versa.
 */
export function notificationCopy(n: NotificationLike): NotificationCopy {
  const code = eventKey(n);
  const known = code ? (COPY[code] ?? guess(code)) : null;

  const rawTitle = (n.title ?? '').trim();
  const rawBody = (n.body ?? '').trim();

  const title = looksLikeCode(rawTitle)
    ? (known?.title ?? (code ? sentenceCase(code) : 'Notification'))
    : rawTitle;

  /* An empty body is common and fine — the title carries it. The stock line is
     only worth adding when there is a mapping specific enough to be true. */
  const body = looksLikeCode(rawBody) ? (known?.body ?? '') : rawBody;

  return { title, body };
}

/** Icon for the row in the inbox, resolved from the same code as the copy. */
export function notificationIcon(n: NotificationLike) {
  const code = eventKey(n);
  if (!code) return 'notifications-outline';
  if (ICONS[code]) return ICONS[code];
  if (code.includes('EMERGENC')) return 'warning-outline';
  if (code.includes('ANNOUNCE')) return 'megaphone-outline';
  if (code.includes('PROFILE')) return 'create-outline';
  if (code.includes('SCAN')) return 'scan-outline';
  if (code.includes('REJECT') || code.includes('DECLIN')) return 'close-circle-outline';
  if (code.includes('APPROV')) return 'checkmark-circle-outline';
  if (code.includes('PARENT') || code.includes('GUARDIAN')) return 'people-outline';
  if (code.includes('WARDEN')) return 'shield-checkmark-outline';
  return 'notifications-outline';
}

/**
 * True when a payload would reach the reader as an identifier.
 *
 * The push path uses this to decide whether to intervene at all: a notification
 * the server wrote properly is shown exactly as it arrived, untouched.
 */
export function needsRewrite(n: NotificationLike) {
  return looksLikeCode(n.title);
}
