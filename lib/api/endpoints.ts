/**
 * Every endpoint the app calls, one function each, grouped and ordered the way
 * `mobile-api-documentation.md` groups them. Paths are written from the version
 * segment on (`/v1/mobile/...`) exactly as the doc writes them; the client
 * prepends the `https://api.iverto.ai/devhostel` base.
 */
import { api, type Query } from './client';
import type {
  ActivityItem,
  AdminStats,
  Announcement,
  AppConfig,
  AppNotification,
  Branding,
  BrandingPayload,
  Category,
  Curfew,
  EmergencyAlert,
  EmergencyCategory,
  GeofenceZone,
  Group,
  GroupDetail,
  GuardianRecord,
  LateEntry,
  LateEntryPage,
  LocationPing,
  Me,
  NewPermission,
  NewProfileRequest,
  NotificationPreferences,
  Page,
  ParentPage,
  Permission,
  PermissionDetail,
  PermissionStatus,
  PermissionSummary,
  ProfileFields,
  ProfileRequest,
  ProfileRequestStatus,
  RefreshedSession,
  Role,
  RolesResponse,
  RosterStudent,
  Session,
  StudentProfile,
  UploadResult,
  Ward,
  WardDetail,
  WardenDashboard,
  WardLocation,
} from '@/types';

const V1 = '/v1/mobile';

/** Shared shape of every paginated read. */
export type PageQuery = { cursor?: string; limit?: number };

/* -------------------------------------------------------- 1. Auth & session */

/**
 * Password is the only credential. There is no OTP sign-in and no self-service
 * sign-up: accounts are provisioned by the hostel office, which is why a `404`
 * from `login` is a "contact the office" message rather than a way in.
 */
export const auth = {
  /**
   * `role` only tells the server how to read `identifier` (roll number, mobile
   * number, email). The account's real role comes back in `user.role`, and the
   * app routes on that — picking "Admin" on the login screen cannot get a
   * student into the admin shell.
   *
   * `tenantId` is only needed when the same identifier exists in more than one
   * tenant; a 409 is what tells you so.
   */
  login: (body: { identifier: string; password: string; role?: Role; tenantId?: string }) =>
    api.postAnon<Session>(`${V1}/auth/login`, body),

  /**
   * Trades the refresh token for a fresh access token.
   *
   * The login response carries `refreshToken` and `expiresIn: 3600`, so the
   * access token stops working after an hour — without this the app simply
   * dropped the session at that point and sent the user back to the login
   * screen mid-task. The route is **not** in `mobile-api-documentation.md`
   * yet; `lib/auth.tsx` feature-detects it and falls back to signing out with
   * an explanation if the server answers 404. The contract the backend needs
   * to implement is written up in `mobile-api-additions.md` §1.
   */
  refresh: (refreshToken: string) =>
    api.postAnon<RefreshedSession>(`${V1}/auth/refresh`, { refreshToken }),

  forgotPassword: (body: { identifier: string; role?: Role; tenantId?: string }) =>
    api.postAnon<{ sent: boolean; email: string }>(`${V1}/auth/forgot-password`, body),

  /**
   * Also what clears `user.mustChangePassword` — an account provisioned by the
   * office starts on a default password and is sent here before anything else.
   */
  changePassword: (newPassword: string) =>
    api.post<{ updated: boolean }>(`${V1}/auth/password`, { newPassword }),

  /** Passing the push token disables it server-side so the device goes quiet. */
  logout: (pushToken?: string) =>
    api.post<{ signedOut: boolean }>(`${V1}/auth/logout`, pushToken ? { pushToken } : {}),
};

/* ------------------------------------------------- 2. Onboarding & profile */

export const onboarding = {
  /** Links every ParentContact row with that number — all wards in one call. */
  parentLink: (phone: string) =>
    api.post<{ linkedContactsCount: number; studentIds: string[] }>(
      `${V1}/onboarding/parent-link`,
      { phone }
    ),

  studentLink: (rollNumber: string) =>
    api.post<StudentProfile>(`${V1}/onboarding/student-link`, { rollNumber }),
};

export const me = {
  /** Role-aware: a Student, a `{ parentContacts, children }`, or staff + sites. */
  get: (signal?: AbortSignal) => api.get<Me>(`${V1}/me`, undefined, signal),

  /** What this device should render itself as. Call after login and on resume. */
  branding: (signal?: AbortSignal) => api.get<Branding>(`${V1}/me/branding`, undefined, signal),
};

export const appConfig = {
  get: (signal?: AbortSignal) => api.get<AppConfig>(`${V1}/app-config`, undefined, signal),
};

/* --------------------------------------------- 2b. Geofencing & location */

/**
 * Campus boundaries and where a ward is.
 *
 * These three routes are **not** in `mobile-api-documentation.md` — they are
 * the contract for this feature, written up in `mobile-api-additions.md`
 * §2–§4. Everything that calls them treats a `404` as "this campus has not
 * enabled live location" rather than as an error, so the app runs unchanged
 * against a server that has not shipped them yet.
 */
export const location = {
  /** The fence(s) for the caller's site. Empty when none is configured. */
  zones: (signal?: AbortSignal) => api.get<GeofenceZone[]>(`${V1}/geofence`, undefined, signal),

  /** Student only. One fix, with the device's own inside/outside verdict. */
  ping: (body: LocationPing) =>
    api.post<{ accepted: boolean; inside?: boolean }>(`${V1}/location/ping`, body),

  /** Guardian only, and only for a ward on their own account. */
  ward: (studentId: string, signal?: AbortSignal) =>
    api.get<WardLocation>(`${V1}/parent/children/${studentId}/location`, undefined, signal),
};

/* ------------------------------------------------------ 3. Student passes */

export type PermissionQuery = PageQuery & {
  /** An app chip (`pending`), a concrete status, or a comma-separated mix. */
  status?: string;
  /** Pass id, reason, destination, type. */
  q?: string;
};

export const permissions = {
  /** One call for the home screen — counters that stay right past page one. */
  summary: (signal?: AbortSignal) =>
    api.get<PermissionSummary>(`${V1}/permissions/summary`, undefined, signal),

  list: (query: PermissionQuery = {}, signal?: AbortSignal) =>
    api.get<Page<Permission>>(`${V1}/permissions`, query as Query, signal),

  get: (id: string, signal?: AbortSignal) =>
    api.get<PermissionDetail>(`${V1}/permissions/${id}`, undefined, signal),

  /** One-step submit — there is no server-side draft. */
  submit: (body: NewPermission) => api.post<Permission>(`${V1}/permissions/submit`, body),

  cancel: (id: string) => api.post<Permission>(`${V1}/permissions/${id}/cancel`),

  curfew: (signal?: AbortSignal) => api.get<Curfew>(`${V1}/curfew`, undefined, signal),

  /** Tenant-overridable — always render the chips from this, never hardcode. */
  categories: (signal?: AbortSignal) => api.get<Category[]>(`${V1}/categories`, undefined, signal),
};

/* ------------------------------------------ 4. Guardian — wards & decisions */

export type ParentPermissionQuery = PermissionQuery & {
  childId?: string;
  /** `true` → history: only requests that already carry a decision. */
  decided?: boolean;
};

export const parent = {
  children: (signal?: AbortSignal) => api.get<Ward[]>(`${V1}/parent/children`, undefined, signal),

  child: (studentId: string, signal?: AbortSignal) =>
    api.get<WardDetail>(`${V1}/parent/children/${studentId}`, undefined, signal),

  guardians: (studentId: string, signal?: AbortSignal) =>
    api.get<GuardianRecord[]>(`${V1}/parent/children/${studentId}/guardians`, undefined, signal),

  /** Ordering puts everything still `waiting_parent` first, then newest-first. */
  permissions: (query: ParentPermissionQuery = {}, signal?: AbortSignal) =>
    api.get<ParentPage<Permission>>(`${V1}/parent/permissions`, query as Query, signal),

  permission: (id: string, signal?: AbortSignal) =>
    api.get<PermissionDetail>(`${V1}/parent/permissions/${id}`, undefined, signal),

  /**
   * Repeating the same decision is a 200 with the current state, not an error.
   * The opposite decision after one is recorded is a 409
   * `PERMISSION_ALREADY_DECIDED`, and more than one attempt per 5s is a 429.
   */
  decide: (id: string, response: 'approve' | 'reject' | 'contact_warden', note?: string) =>
    api.post<Permission>(`${V1}/parent/permissions/${id}/decision`, { response, note }),

  lateEntries: (studentId: string, query: PageQuery = {}, signal?: AbortSignal) =>
    api.get<LateEntryPage>(
      `${V1}/parent/children/${studentId}/late-entries`,
      query as Query,
      signal
    ),

  /** Clears the "new since you last checked" flag. Calling it twice is harmless. */
  acknowledgeLateEntry: (id: string) =>
    api.post<LateEntry>(`${V1}/parent/late-entries/${id}/acknowledge`),

  /** Every warden of the ward's site is pushed immediately. One per 30s. */
  raiseEmergency: (body: {
    studentId: string;
    category: EmergencyCategory;
    message: string;
    contactPhone?: string;
  }) => api.post<EmergencyAlert>(`${V1}/parent/emergencies`, body),
};

/* ------------------------------------------------ 5. Admin & warden — campus */

export type AdminPermissionQuery = PermissionQuery & { siteId?: string };

export const admin = {
  stats: (siteId?: string, signal?: AbortSignal) =>
    api.get<AdminStats>(`${V1}/admin/stats`, { siteId }, signal),

  activity: (query: { limit?: number; siteId?: string } = {}, signal?: AbortSignal) =>
    api.get<ActivityItem[]>(`${V1}/admin/activity`, query as Query, signal),

  permissions: (query: AdminPermissionQuery = {}, signal?: AbortSignal) =>
    api.get<Page<Permission>>(`${V1}/admin/permissions`, query as Query, signal),

  permission: (id: string, signal?: AbortSignal) =>
    api.get<PermissionDetail>(`${V1}/admin/permissions/${id}`, undefined, signal),

  /** Bypasses the state machine deliberately, and is written to the audit log. */
  override: (id: string, status: PermissionStatus, note?: string) =>
    api.post<Permission>(`${V1}/admin/permissions/${id}/override`, { status, note }),

  /** `text/csv`, capped at 5000 rows. Same query as the list. */
  exportPermissions: (query: AdminPermissionQuery = {}) =>
    api.csv(`${V1}/admin/permissions/export`, query as Query),

  announcements: (limit = 20, signal?: AbortSignal) =>
    api.get<Announcement[]>(`${V1}/admin/announcements`, { limit }, signal),

  /** `siteIds` defaults to the caller's sites. Every recipient also gets a push. */
  announce: (body: {
    title: string;
    body: string;
    audience?: 'all' | 'student' | 'parent' | 'warden';
    siteIds?: string[];
  }) => api.post<Announcement>(`${V1}/admin/announcements`, body),

  /** `month` as `2026-08`; defaults to the current month. */
  reports: (month?: string, signal?: AbortSignal) =>
    api.get<unknown>(`${V1}/admin/reports`, { month }, signal),

  roles: (signal?: AbortSignal) => api.get<RolesResponse>(`${V1}/admin/roles`, undefined, signal),

  /** Admin only. */
  setRole: (userId: string, role: Role) =>
    api.put<unknown>(`${V1}/admin/users/${userId}/role`, { role }),

  emergencies: (status = 'open', signal?: AbortSignal) =>
    api.get<EmergencyAlert[]>(`${V1}/admin/emergencies`, { status }, signal),

  resolveEmergency: (id: string, status: 'acknowledged' | 'resolved' = 'resolved', note?: string) =>
    api.post<EmergencyAlert>(`${V1}/admin/emergencies/${id}/resolve`, { status, note }),

  /* --- Profile change requests, admin side --- */

  profileRequests: (
    query: PageQuery & { status?: ProfileRequestStatus | 'all'; q?: string } = {},
    signal?: AbortSignal
  ) => api.get<Page<ProfileRequest>>(`${V1}/admin/profile-requests`, query as Query, signal),

  /** Writes the whitelisted fields to the record and notifies the requester. */
  approveProfileRequest: (id: string, note?: string) =>
    api.post<ProfileRequest>(`${V1}/admin/profile-requests/${id}/approve`, { note }),

  rejectProfileRequest: (id: string, note?: string) =>
    api.post<ProfileRequest>(`${V1}/admin/profile-requests/${id}/reject`, { note }),

  exportProfileRequests: (status?: ProfileRequestStatus | 'all') =>
    api.csv(`${V1}/admin/profile-requests/export`, { status }),

  /* --- Groups, branding, roster --- */

  groups: (branded?: boolean, signal?: AbortSignal) =>
    api.get<Group[]>(`${V1}/admin/groups`, { branded }, signal),

  group: (id: string, signal?: AbortSignal) =>
    api.get<GroupDetail>(`${V1}/admin/groups/${id}`, undefined, signal),

  createGroup: (body: {
    name: string;
    appName?: string;
    iconColors?: string[];
    shape?: string;
    iconLabel?: string;
  }) => api.post<Group>(`${V1}/admin/groups`, body),

  /**
   * The "Apply to N" action. `appName` ≤ 14 chars, `iconLabel` ≤ 2 chars, and
   * when `memberStudentIds` is present it **replaces** the roster.
   */
  applyBranding: (id: string, body: BrandingPayload) =>
    api.post<Group>(`${V1}/admin/groups/${id}/branding`, body),

  roster: (
    query: PageQuery & { q?: string; siteId?: string } = {},
    signal?: AbortSignal
  ) => api.get<Page<RosterStudent>>(`${V1}/admin/roster`, query as Query, signal),
};

/* ------------------------------------- 6. Warden queue (the admin persona) */

export const warden = {
  /** Site-scoped; defaults to pending_warden, waiting_parent and escalated. */
  permissions: (query: PermissionQuery = {}, signal?: AbortSignal) =>
    api.get<Page<Permission>>(`${V1}/warden/permissions`, query as Query, signal),

  /** Approving kicks off the guardian approval flow. Throttled to 1 per 5s. */
  decide: (id: string, response: 'approve' | 'reject', note?: string) =>
    api.post<Permission>(`${V1}/warden/permissions/${id}/decision`, { response, note }),

  activate: (id: string) => api.post<Permission>(`${V1}/warden/permissions/${id}/activate`),

  /** Logs a guardian response that came in out of band. */
  resolveEscalated: (id: string, response: 'approve' | 'reject', note?: string) =>
    api.post<Permission>(`${V1}/warden/permissions/${id}/resolve-escalated`, { response, note }),

  dashboard: (signal?: AbortSignal) =>
    api.get<WardenDashboard>(`${V1}/warden/dashboard`, undefined, signal),
};

/* ------------------------------------------------ 7. Profile change requests */

export const profileRequests = {
  /**
   * The whitelist of what this account may ask to change, plus whatever it has
   * already filed — shown inline so nobody submits the same thing twice.
   */
  fields: (signal?: AbortSignal) =>
    api.get<ProfileFields>(`${V1}/profile-requests/fields`, undefined, signal),

  /** `409 PROFILE_REQUEST_PENDING` — only one open request at a time. */
  create: (body: NewProfileRequest) => api.post<ProfileRequest>(`${V1}/profile-requests`, body),

  list: (
    query: PageQuery & { status?: ProfileRequestStatus | 'all' } = {},
    signal?: AbortSignal
  ) => api.get<Page<ProfileRequest>>(`${V1}/profile-requests`, query as Query, signal),

  get: (id: string, signal?: AbortSignal) =>
    api.get<ProfileRequest>(`${V1}/profile-requests/${id}`, undefined, signal),
};

/* ------------------------------------------------------------- 8. Uploads */

export const uploads = {
  /**
   * PDF/JPEG/PNG/HEIC/WEBP, max 5 MB. Send the returned `key` with whatever
   * needs it — `supportingDocKeys`, `attachmentKey`, `iconKey`. The `url` is a
   * short-lived (5 minute) read link.
   */
  create: (
    file: { uri: string; name: string; type: string },
    purpose?: 'permission' | 'profile-request' | 'group-icon'
  ) => {
    const form = new FormData();
    form.append('file', file as unknown as Blob);
    if (purpose) form.append('purpose', purpose);
    return api.post<UploadResult>(`${V1}/uploads`, form);
  },

  /** A fresh 5-minute read URL for an attachment already on record. */
  signedUrl: (key: string) =>
    api.get<{ key: string; url: string }>(`${V1}/uploads/signed-url`, { key }),
};

/* -------------------------------------------------------- 9. Notifications */

export const notifications = {
  list: (query: PageQuery & { unreadOnly?: boolean } = {}, signal?: AbortSignal) =>
    api.get<Page<AppNotification>>(`${V1}/notifications`, query as Query, signal),

  /** The header badge. */
  unreadCount: (signal?: AbortSignal) =>
    api.get<{ unreadCount: number }>(`${V1}/notifications/unread-count`, undefined, signal),

  markRead: (id: string) => api.patch<{ count: number }>(`${V1}/notifications/${id}/read`),

  markAllRead: () => api.patch<{ count: number }>(`${V1}/notifications/read-all`),

  preferences: (signal?: AbortSignal) =>
    api.get<NotificationPreferences>(`${V1}/notification-preferences`, undefined, signal),

  /** `push: false` stops server-side delivery; the inbox still fills. */
  setPreferences: (body: Partial<Pick<NotificationPreferences, 'push' | 'email' | 'sms'>>) =>
    api.put<NotificationPreferences>(`${V1}/notification-preferences`, body),
};

export const push = {
  /** Re-registering the same token refreshes it instead of duplicating. */
  register: (platform: 'android' | 'ios', token: string) =>
    api.post<unknown>(`${V1}/push/token`, { platform, token }),

  unregister: (token: string) => api.del<{ count: number }>(`${V1}/push/token`, { token }),
};
