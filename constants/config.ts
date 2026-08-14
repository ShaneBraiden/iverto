/**
 * Static UI configuration — labels, presets and fallbacks that belong to the
 * app rather than to the backend. Nothing here stands in for API data: where
 * the server is the authority (categories, editable fields, branding) the app
 * renders what it is sent and only falls back here when the call fails.
 */

/** The app name members see unless their group carries custom branding. */
export const DEFAULT_APP_NAME = 'Iverto.ai';

/** Corner radius per icon shape, shared by the group list and the editor. */
export const SHAPE_RADIUS: Record<string, number> = {
  squircle: 16,
  rounded: 12,
  circle: 27,
  square: 4,
};

/**
 * The same four shapes as a fraction of the icon's size.
 *
 * `SHAPE_RADIUS` above is these ratios resolved at the 54px group-list tile.
 * The branded mark also has to be drawn at 20px in the dashboard header and at
 * 72px in the editor preview, and a fixed 27px radius stops reading as a circle
 * the moment the tile is not 54px wide — so anything that scales uses these.
 */
const SHAPE_RATIO: Record<string, number> = {
  squircle: 0.3,
  rounded: 0.22,
  circle: 0.5,
  square: 0.074,
};

export function shapeRadius(shape: string | undefined, size: number) {
  return size * (SHAPE_RATIO[shape ?? ''] ?? SHAPE_RATIO.squircle);
}

/** The four shapes the branding endpoint accepts. */
export const SHAPES: { id: string; label: string; radius: number }[] = [
  { id: 'squircle', label: 'Squircle', radius: 22 },
  { id: 'rounded', label: 'Rounded', radius: 14 },
  { id: 'circle', label: 'Circle', radius: 44 },
  { id: 'square', label: 'Square', radius: 4 },
];

/** Icon colour presets offered in the branding editor. */
export const iconPresets: { id: string; name: string; colors: [string, string] }[] = [
  { id: 'iverto', name: 'Iverto Crimson', colors: ['#B9000E', '#D81324'] },
  { id: 'ember', name: 'Ember', colors: ['#8E000B', '#B9000E'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0EA5E9', '#22D3EE'] },
  { id: 'sunset', name: 'Sunset', colors: ['#F59E0B', '#EF4444'] },
  { id: 'forest', name: 'Forest', colors: ['#10B981', '#059669'] },
  { id: 'graphite', name: 'Graphite', colors: ['#3F3F46', '#18181B'] },
  { id: 'violet', name: 'Violet', colors: ['#7C3AED', '#A78BFA'] },
  { id: 'slate', name: 'Slate', colors: ['#64748B', '#94A3B8'] },
  { id: 'amber', name: 'Amber', colors: ['#D97706', '#FBBF24'] },
];

/** Icon for a profile field, keyed by the `field` name the server sends. */
export const FIELD_ICONS: Record<string, string> = {
  name: 'person-outline',
  phone: 'call-outline',
  alternatePhone: 'call-outline',
  email: 'mail-outline',
  roomNumber: 'bed-outline',
  address: 'home-outline',
  relationship: 'people-outline',
};

export const DEFAULT_FIELD_ICON = 'create-outline';

/** Maps an audit action to its row icon on the activity feed. */
export const ACTIVITY_ICONS: Record<string, string> = {
  GATE_SCAN_IN: 'log-in-outline',
  GATE_SCAN_OUT: 'log-out-outline',
  WARDEN_APPROVE: 'checkmark-done-outline',
  WARDEN_REJECT: 'close-circle-outline',
  PARENT_APPROVE: 'people-outline',
  PARENT_REJECT: 'close-circle-outline',
  PARENT_CONTACT_WARDEN: 'call-outline',
  CONTACT_WARDEN: 'call-outline',
  PERMISSION_SUBMIT: 'document-text-outline',
  PERMISSION_CREATE: 'document-text-outline',
  PERMISSION_CANCEL: 'ban-outline',
  PERMISSION_EXPIRE: 'hourglass-outline',
  PERMISSION_OVERRIDE: 'hand-left-outline',
  PERMISSION_ACTIVATE: 'play-circle-outline',
  PROFILE_REQUEST_CREATE: 'create-outline',
  PROFILE_REQUEST_APPROVE: 'create-outline',
  PROFILE_REQUEST_REJECT: 'create-outline',
  ANNOUNCEMENT_SEND: 'megaphone-outline',
  GROUP_BRANDING: 'color-palette-outline',
  EMERGENCY_RAISE: 'warning-outline',
  EMERGENCY_RESOLVE: 'shield-checkmark-outline',
  CREATE: 'add-circle-outline',
  UPDATE: 'create-outline',
  DELETE: 'trash-outline',
  LOGIN: 'log-in-outline',
  LOGOUT: 'log-out-outline',
};

/**
 * The fallback is a filled-in glyph on purpose. It used to be `ellipse-outline`,
 * which renders as a bare ring — on a feed of actions this build has no mapping
 * for, every row came out as an empty circle that read like a failed icon load
 * rather than "an event happened".
 */
export const DEFAULT_ACTIVITY_ICON = 'pulse-outline';

/**
 * Best-effort icon for an action code this build has not seen before.
 *
 * The lookup is case- and separator-insensitive: the audit log is written by a
 * service this app does not own, and it has sent `PERMISSION_SUBMIT`,
 * `permission.submit` and `permission submit` for the same event. Matching only
 * the exact upper-snake form is what left the feed full of blank circles.
 */
export function activityIcon(action: string) {
  const key = String(action ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s.\-/]+/g, '_');

  if (ACTIVITY_ICONS[key]) return ACTIVITY_ICONS[key];
  if (key.includes('SCAN')) return 'scan-outline';
  if (key.includes('APPROVE')) return 'checkmark-done-outline';
  if (key.includes('REJECT') || key.includes('DECLINE')) return 'close-circle-outline';
  if (key.includes('CANCEL')) return 'ban-outline';
  if (key.includes('OVERRIDE')) return 'hand-left-outline';
  if (key.includes('PROFILE')) return 'create-outline';
  if (key.includes('EMERGENCY')) return 'warning-outline';
  if (key.includes('ANNOUNCE')) return 'megaphone-outline';
  if (key.includes('CONTACT')) return 'call-outline';
  if (key.includes('PERMISSION') || key.includes('CREATE')) return 'document-text-outline';
  return DEFAULT_ACTIVITY_ICON;
}

/**
 * The note recorded when a guardian picks "talk to the warden first".
 *
 * `POST /parent/permissions/:id/decision` stores `note` as the decision
 * evidence, shows it to the student, and — per the API doc — is what alerts the
 * warden for a `contact_warden` response. Sent without one the alert reaches
 * the warden with nothing in it but a pass id, which is not enough to act on or
 * to write a notification body from. A fixed line is not as good as the
 * guardian's own words, but it is a sentence, and every guardian taking this
 * action means the same thing by it.
 */
export const CONTACT_WARDEN_NOTE =
  'The guardian has asked to speak to the warden before deciding on this request.';

/** The four categories `POST /parent/emergencies` accepts. */
export const EMERGENCY_CATEGORIES: {
  id: 'medical' | 'family' | 'safety' | 'other';
  label: string;
  icon: string;
}[] = [
  { id: 'medical', label: 'Medical', icon: 'medkit-outline' },
  { id: 'family', label: 'Family', icon: 'home-outline' },
  { id: 'safety', label: 'Safety', icon: 'shield-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

/** Who an announcement can be addressed to. */
export const ANNOUNCEMENT_AUDIENCES: {
  id: 'all' | 'student' | 'parent' | 'warden';
  label: string;
}[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'student', label: 'Students' },
  { id: 'parent', label: 'Guardians' },
  { id: 'warden', label: 'Wardens' },
];

/** Rows per page for the cursor-paginated lists. The admin roster defaults to 50. */
export const PAGE_SIZE = 20;
export const ROSTER_PAGE_SIZE = 50;
