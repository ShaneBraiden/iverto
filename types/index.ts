/**
 * Domain types — the exact shapes documented in `mobile-api-documentation.md`.
 *
 * Field names here match the wire format character for character. Nothing is
 * renamed on the way in, so a response can be handed to a screen unchanged and
 * a screen's props can be read straight against the API doc.
 */

/* ------------------------------------------------------------------- Roles */

/** What the server can report as an account's role. */
export type Role = 'student' | 'parent' | 'warden' | 'admin';

/** Which tab shell a role opens. Wardens use the admin shell. */
export type Shell = 'student' | 'parent' | 'admin';

/* ------------------------------------------------------------ Pagination */

/** Every list is cursor-paginated. Two endpoints rename `data` — see `Paged`. */
export type Page<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

/** `GET /v1/mobile/parent/permissions` puts the array under `permissions`. */
export type ParentPage<T> = {
  permissions: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

/* ----------------------------------------------------------------- Session */

export type AuthUser = {
  id: string;
  role: Role;
  tenantId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  siteIds: string[];
  /**
   * The account is still on the default password the hostel office issued, so
   * it goes to the change-password screen before any role screen. Cleared by
   * `POST /auth/password`.
   */
  mustChangePassword?: boolean;
};

/**
 * Which campus record the account is attached to. `linked: false` means the
 * account exists but has no Student / ParentContact behind it yet, so it has
 * to go through onboarding before any role screen will answer.
 */
export type Linkage = {
  studentId: string | null;
  rollNumber: string | null;
  parentContactIds: string[];
  childStudentIds: string[];
  linked: boolean;
};

/** What `POST /auth/login` returns — the app's only way in. */
export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Lifetime of `accessToken` in seconds. One hour, at the time of writing. */
  expiresIn: number;
  tokenType: string;
  user: AuthUser;
  linkage: Linkage;
};

/**
 * What `POST /auth/refresh` returns. Tokens only — the user and the linkage
 * are already held locally and a refresh does not change either.
 *
 * A server that rotates refresh tokens sends a new `refreshToken`; one that
 * does not omits it and the stored one stays in use.
 */
export type RefreshedSession = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
};

/* -------------------------------------------------------------- Permission */

/**
 * The full backend state machine. `draft → pending_warden → warden_approved →
 * waiting_parent → parent_approved → active → student_exited → completed`,
 * with the rest as exits.
 */
export type PermissionStatus =
  | 'draft'
  | 'pending_warden'
  | 'warden_approved'
  | 'waiting_parent'
  | 'parent_approved'
  | 'active'
  | 'student_exited'
  | 'completed'
  | 'rejected_warden'
  | 'rejected_parent'
  | 'escalated'
  | 'contact_parent'
  | 'parent_unreachable'
  | 'expired'
  | 'cancelled';

/** The five chips the app filters by, plus `all`. */
export type StatusChip = 'all' | 'pending' | 'approved' | 'active' | 'rejected' | 'expired' | 'cancelled';

/** The student attached to a permission row. */
export type PermissionStudent = {
  id: string;
  name: string;
  rollNumber: string;
  roomNumber: string | null;
  /** Only on the admin detail endpoint. */
  parents?: GuardianRecord[];
};

/** One step of the approval chain, as the server renders it. */
export type TimelineStep = {
  key: string;
  label: string;
  state: 'done' | 'current' | 'pending' | 'rejected' | 'skipped';
  at: string | null;
  by: string | null;
  note: string | null;
};

/** Returned by every pass endpoint. */
export type Permission = {
  id: string;
  tenantId: string;
  siteId: string;
  studentId: string;
  type: string;
  status: PermissionStatus;
  reason: string;
  destination: string | null;
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
  emergencyContact: string | null;
  supportingDocKeys: string[] | null;
  wardenId: string | null;
  wardenDecisionAt: string | null;
  wardenNote: string | null;
  parentContactId: string | null;
  parentDecisionAt: string | null;
  parentNote: string | null;
  parentDecisionMethod: string | null;
  parentDecisionEvidence: string | null;
  exitTime: string | null;
  returnTime: string | null;
  durationMinutes: number | null;
  expiresAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  student?: PermissionStudent;
};

/** `GET /permissions/:id` adds the chain and who closed it. */
export type PermissionDetail = Permission & {
  timeline: TimelineStep[];
  decidedBy: { role: string; at: string; note: string | null } | null;
};

/** Body of `POST /permissions/submit`. */
export type NewPermission = {
  type: string;
  reason: string;
  destination: string;
  startDate: string;
  endDate: string;
  emergencyContact: string;
  supportingDocKeys?: string[];
};

/** `GET /permissions/summary` — one call for the student home screen. */
export type PermissionSummary = {
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    cancelled: number;
    total: number;
  };
  liveRequest: Permission | null;
  recent: Permission[];
};

/** `GET /categories` — tenant-overridable, never hardcoded. */
export type Category = {
  id: string;
  label: string;
  description: string | null;
  requiresSupportingDoc: boolean;
  maxDurationHours: number | null;
};

/** `GET /curfew`. */
export type Curfew = {
  currentStatus: 'inside' | 'outside' | string;
  activeCurfew: { start: string; end: string } | null;
  activePermission: Permission | null;
  recentViolations: LateEntry[];
};

/* ------------------------------------------------------------------ People */

/** `GET /me` for a student. */
export type StudentProfile = {
  id: string;
  name: string;
  rollNumber: string;
  roomNumber: string | null;
  department: string | null;
  year: string | null;
  siteId: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  enrollmentStatus?: string | null;
  site?: Site | null;
};

export type Site = {
  id: string;
  name: string;
  timezone?: string | null;
};

/** A guardian on a student's record. */
export type GuardianRecord = {
  id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  alternatePhone?: string | null;
  email?: string | null;
  isApprover: boolean;
  hasAppAccount: boolean;
  /** True for the guardian who is signed in. */
  isYou?: boolean;
  whatsappOptedOut?: boolean;
};

/** `GET /me` for a guardian. */
export type ParentProfile = {
  parentContacts: GuardianRecord[];
  children: (StudentProfile & { parents?: GuardianRecord[] })[];
};

/** `GET /me` for a warden or admin. */
export type StaffProfile = {
  role: Role;
  userId: string;
  tenantId: string;
  profile: { displayName?: string | null; email?: string | null; phone?: string | null } | null;
  assignedSites: Site[];
};

/** Role-aware `GET /me`. Which branch is live is decided by the session role. */
export type Me = Partial<StudentProfile> & Partial<ParentProfile> & Partial<StaffProfile>;

/** `GET /parent/children` — one card per ward. */
export type Ward = {
  id: string;
  name: string;
  rollNumber: string;
  roomNumber: string | null;
  department: string | null;
  year: string | null;
  siteId: string;
  currentStatus: 'IN' | 'OUT' | string;
  pendingApprovals: number;
  siblings: { id: string; name: string; rollNumber?: string }[];
};

/** `GET /parent/children/:studentId` — the full ward overview. */
export type WardDetail = {
  id: string;
  name: string;
  rollNumber: string;
  roomNumber: string | null;
  department: string | null;
  year: string | null;
  enrollmentStatus: string | null;
  currentStatus: 'IN' | 'OUT' | string;
  lastGateScan: {
    at: string;
    direction: 'in' | 'out' | string;
    gate: string | null;
    outcome: string | null;
  } | null;
  activePermission: Permission | null;
  passesThisTerm: number;
  termStart: string | null;
  openViolations: number;
  site: Site | null;
  hostel: {
    room: string | null;
    group: { id: string; name: string } | null;
    wardens: { userId: string; name: string; phone: string | null; email: string | null }[];
  } | null;
  guardians: GuardianRecord[];
  siblings: { id: string; name: string; rollNumber?: string }[];
};

/* ------------------------------------------------------------- Late entries */

/** A return that came in after the time on the pass. */
export type LateEntry = {
  id: string;
  permissionId: string | null;
  date: string;
  /** Return time printed on the pass, e.g. "21:00". */
  dueBackAt: string | null;
  scannedInAt: string | null;
  delayMinutes: number;
  /** Server-rendered, e.g. "2h 15m late". */
  delayLabel: string | null;
  severity: 'minor' | 'major' | string;
  reason: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  gate: string | null;
  recordedBy: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
};

/** The late-entry list carries its own unread counter. */
export type LateEntryPage = Page<LateEntry> & { unacknowledged: number };

/* -------------------------------------------------- Geofencing & location */

/**
 * A circular campus boundary. The student's device compares its own fix
 * against this to decide "on campus" or "off campus"; the server does the same
 * with the pings it receives, so the two cannot disagree about the rule.
 *
 * NOTE: `/v1/mobile/geofence` and the two routes below are **not** in
 * `mobile-api-documentation.md` yet — they are the contract this app is
 * written against, spelled out in `mobile-api-additions.md` for the backend to
 * implement. Every screen that uses them degrades to gate-scan presence when
 * they 404, so the app is correct against today's server and tomorrow's.
 */
export type GeofenceZone = {
  id: string;
  siteId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Metres from the centre. Inside this ring counts as on campus. */
  radiusMeters: number;
};

/** Body of `POST /v1/mobile/location/ping`. */
export type LocationPing = {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty on the fix, in metres, when the device reports one. */
  accuracyMeters?: number;
  /** ISO 8601 instant the fix was taken *on the device*, not when it was sent. */
  at: string;
  /** The device's own verdict against the zone it was given. */
  inside?: boolean;
  zoneId?: string;
};

/**
 * Where one ward was last seen — `GET /parent/children/:studentId/location`.
 *
 * Every derived field is nullable because the server may not compute it. When
 * it doesn't, `lib/geo.ts` works it out from the raw fix and the zone, so the
 * guardian screen renders the same either way.
 */
export type WardLocation = {
  studentId: string;
  /** Null until the ward's device has reported at least once. */
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  /** ISO 8601 instant of the fix. */
  at: string | null;
  /** Inside the campus fence. Null when it has not been evaluated. */
  inside: boolean | null;
  /** Straight-line distance from the fence centre, in metres. */
  distanceMeters: number | null;
  zone: GeofenceZone | null;
  /**
   * False when the ward has not turned location sharing on. The distinction
   * matters: "not sharing" is a choice the student made and the guardian is
   * told as much, rather than being shown a stale pin or an error.
   */
  sharing: boolean;
};

/* ------------------------------------------------------------ Emergencies */

export type EmergencyCategory = 'medical' | 'family' | 'safety' | 'other';

export type EmergencyAlert = {
  id: string;
  tenantId: string;
  siteId: string;
  studentId: string;
  raisedBy: string;
  raisedRole: string;
  category: EmergencyCategory | string;
  message: string;
  contactPhone: string | null;
  status: 'open' | 'acknowledged' | 'resolved' | string;
  createdAt: string;
  student?: PermissionStudent;
};

/* -------------------------------------------------- Profile edit requests */

export type ProfileRequestStatus = 'pending' | 'approved' | 'rejected';

/** `changes` is keyed by field name, each with the old and the new value. */
export type ProfileChange = { old: string | null; new: string | null };

export type ProfileRequest = {
  id: string;
  tenantId: string;
  siteId: string | null;
  requesterUserId: string;
  requesterRole: Role | string;
  subjectType: 'student' | 'parent' | string;
  subjectId: string;
  changes: Record<string, ProfileChange>;
  reason: string;
  attachmentKey: string | null;
  status: ProfileRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** On the admin queue and the single-request read. */
  subject?: {
    id: string;
    name: string;
    rollNumber?: string;
    phone?: string;
    studentId?: string;
    siteId?: string;
  };
};

/** One row of the server-driven whitelist of what may be changed. */
export type EditableField = {
  field: string;
  label: string;
  type: 'text' | 'tel' | 'email' | string;
  currentValue: string | null;
};

/** `GET /profile-requests/fields`. */
export type ProfileFields = {
  subjectType: 'student' | 'parent' | string;
  subjectId: string;
  fields: EditableField[];
  pendingRequest: ProfileRequest | null;
};

/** Body of `POST /profile-requests`. */
export type NewProfileRequest = {
  changes: Record<string, string>;
  reason: string;
  attachmentKey?: string;
};

/* ------------------------------------------------------ Groups & branding */

export type IconShape = 'squircle' | 'circle' | 'rounded' | 'square';

export type Group = {
  id: string;
  name: string;
  appName: string;
  iconColors: string[];
  shape: IconShape | string;
  iconLabel: string;
  iconKey: string | null;
  memberCount: number;
  hasCustomBranding: boolean;
  updatedAt: string;
};

export type GroupDetail = Group & {
  members: { studentId: string; name: string; rollNumber: string; addedAt: string }[];
};

/** Body of `POST /admin/groups/:id/branding`. */
export type BrandingPayload = {
  appName: string;
  iconColors: string[];
  shape: string;
  iconLabel: string;
  iconKey?: string;
  /** When present, this **replaces** the group roster. */
  memberStudentIds?: string[];
};

/** One row of `GET /admin/roster`. */
export type RosterStudent = {
  id: string;
  name: string;
  rollNumber: string;
  roomNumber: string | null;
  siteId: string;
  branded: boolean;
  groupId: string | null;
  groupName: string | null;
};

/** `GET /me/branding` — what this device renders itself as. */
export type Branding = {
  groupId: string | null;
  groupName: string | null;
  appName: string;
  iconColors: string[];
  shape: string;
  iconLabel: string;
  iconKey: string | null;
  isDefault: boolean;
  version: string;
};

/* ------------------------------------------------------------------- Admin */

export type AdminStats = {
  pending: number;
  approvedToday: number;
  currentlyOut: number;
  overdue: number;
  openEmergencies: number;
  pendingProfileRequests: number;
  generatedAt: string;
};

export type ActivityItem = {
  id: string;
  at: string;
  action: string;
  targetType: string;
  targetId: string;
  actorUserId: string | null;
  actorType: string;
  summary: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'student' | 'parent' | 'warden' | string;
  siteIds: string[];
  recipients?: number;
  createdAt: string;
};

export type RolesResponse = {
  roles: { role: Role | string; label: string; capabilities: string[]; members: number }[];
  staff: {
    userId: string;
    role: Role | string;
    displayName: string | null;
    email: string | null;
    siteIds: string[];
  }[];
};

/** `GET /warden/dashboard`. */
export type WardenDashboard = {
  pendingPermissions: number;
  activePermissions: number;
  studentsOut: number;
};

/* ----------------------------------------------------------- Notifications */

export type AppNotification = {
  id: string;
  tenantId: string;
  siteId: string | null;
  userId: string;
  permissionId: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, string> | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferences = {
  userId: string;
  tenantId: string;
  push: boolean;
  email: boolean;
  sms: boolean;
  updatedAt: string | null;
};

/* --------------------------------------------------------------- App config */

export type AppConfig = {
  tenantName: string;
  languages: { code: string; label: string }[];
  defaultLanguage: string;
  support: { email: string | null; phone: string | null; helpUrl: string | null };
  legal: { termsUrl: string | null; privacyUrl: string | null };
  deepLinkScheme: string;
  minimumAppVersion: string | null;
};

/* -------------------------------------------------------------- Uploads */

export type UploadResult = {
  key: string;
  bucket: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
};
