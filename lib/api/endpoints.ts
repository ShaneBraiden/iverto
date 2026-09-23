/**
 * Every endpoint the app calls, one function each, grouped the way
 * `mobile-api-documentation.md` grouped them originally.
 *
 * ## Two API surfaces, on purpose
 *
 * This file is mid-migration from Hostel v1 (`/v1/mobile/**`) to Hostel v2
 * (`/hostel/v2/**`, written here as `${V2}/tenants/{tenantId}/...` — the
 * client already carries the `/hostel` deployment prefix in `API_URL`, so
 * `V2` only supplies the `/v2` version segment). The contract, the route-by-
 * route disposition table, and the role API guide all live in
 * `Dev/mobile-v2-handoff/Mobile-v2-handoff/` — that's the source for every
 * v2 path, header, and pagination shape below.
 *
 * Every function below still returns the same shape it always has
 * (`Page<T>`, `ParentPage<T>`, `UploadResult`, …) regardless of which
 * surface answers it — the v1 → v2 differences (the `page{}` pagination
 * envelope, RFC 7807 errors, opaque `fileId` uploads) are adapted right here
 * so no screen or hook has to know which version it is talking to.
 *
 * **What moved to v2**: everything that reads or writes tenant data — `me`,
 * permissions, guardian decisions, warden queue, admin console, profile
 * requests, notifications, push devices, uploads, groups/branding/roster.
 * Mutations that carry a resource `version` (guardian/warden decisions,
 * profile-request review, manual override, emergency resolution) now send it
 * as `If-Match` — see the trailing `version?: string` parameter on each.
 *
 * **What is deliberately still on v1**, and why:
 * - `auth.login`, `auth.forgotPassword`, `auth.changePassword`,
 *   `onboarding.*` — the v2 equivalents need UI this app does not have yet
 *   (a tenant-code entry step ahead of login, a two-step recovery flow with
 *   a code/token, a current-password field, cryptographic invitation links
 *   replacing phone/roll-number linking). Swapping the wire call without
 *   that UI would strand real users outside a shell they cannot get back
 *   into, so this waits for a product decision rather than a guess.
 *   `auth.refresh` moved to v2 — it is a background call with no UI of its
 *   own and the response is a strict superset of what this app stores.
 * - `location.*`, `warden.endPass` — v1-only extensions with no v2 mapping
 *   in the migration matrix at all; v1 stays live through the migration, so
 *   there is nothing to swap them to yet.
 * - `admin.exportPermissions`, `admin.exportProfileRequests`, `admin.reports`
 *   — v2 turns a synchronous CSV download into an async report-job
 *   (`POST /report-jobs` + poll `GET /jobs/{jobId}`), which needs a progress
 *   UI this screen doesn't have. Same reasoning as above.
 * - `admin.setRole` — unused by any screen today, and v2 keys off a
 *   `membershipId` this app never fetches; left alone rather than guessed.
 *
 * See `Dev/mobile-v2-handoff/Mobile-v2-handoff/` for the full contract, and
 * `Dev/mobile-branding-api.md` for the groups/roster/branding routes (still
 * v1-shaped in that doc; the v2 path swap here follows the migration matrix,
 * not a restatement of that doc's object shapes, which the matrix does not
 * say changed).
 */
import { api, requireTenantId, type Query } from './client';
import type {
  ActivityItem,
  AdminStats,
  Announcement,
  AppConfig,
  AppNotification,
  Branding,
  BrandingPayload,
  Category,
  ClosedPermission,
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
  PushDeviceRegistration,
  PushDeviceView,
  RefreshedSession,
  Role,
  RolesResponse,
  RosterStudent,
  Session,
  StudentProfile,
  UploadResult,
  UploadScanState,
  Ward,
  WardDetail,
  WardenDashboard,
  WardLocation,
} from '@/types';

const V1 = '/v1/mobile';
/** The Hostel v2 version segment — see the header comment for why it's this short. */
const V2 = '/v2';

/** Every `/hostel/v2/tenants/{tenantId}/...` route, from the session's own tenant. */
function tenant(suffix: string) {
  return `${V2}/tenants/${requireTenantId()}${suffix}`;
}

/** Shared shape of every paginated read. */
export type PageQuery = { cursor?: string; limit?: number };

/** The v2 wire shape: `{ data, page: { nextCursor, hasMore } }`. */
type V2Page<T> = { data: T[]; page: { nextCursor: string | null; hasMore: boolean } };

/** Adapts a v2 list response back to the `Page<T>` shape every screen already reads. */
function toPage<T>(res: V2Page<T>): Page<T> {
  return { data: res.data ?? [], nextCursor: res.page?.nextCursor ?? null, hasMore: !!res.page?.hasMore };
}

/** Same, for the one list that names its array `permissions` (guardian queue). */
function toParentPage<T>(res: V2Page<T>): ParentPage<T> {
  return { permissions: res.data ?? [], nextCursor: res.page?.nextCursor ?? null, hasMore: !!res.page?.hasMore };
}

/* -------------------------------------------------------- 1. Auth & session */

/**
 * Password is the only credential. There is no OTP sign-in and no self-service
 * sign-up: accounts are provisioned by the hostel office, which is why a `404`
 * from `login` is a "contact the office" message rather than a way in.
 *
 * Still on `/v1/mobile/**` — see the module header for why. `refresh` is the
 * one exception, on `/hostel/v2/**` since it is a background call this app's
 * UI never has to know about.
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
   * Trades the refresh token for a fresh access token, against
   * `POST /hostel/v2/auth/refresh` (`RefreshMobileSessionRequest` /
   * `MobileSessionResponse` in the v2 contract). The response carries
   * `accessExpiresAt` as an absolute timestamp rather than v1's relative
   * `expiresIn`; adapted here so `lib/session.ts` never has to know.
   */
  refresh: async (refreshToken: string): Promise<RefreshedSession> => {
    const res = await api.postAnon<{
      accessToken: string;
      refreshToken: string;
      accessExpiresAt: string;
    }>(`${V2}/auth/refresh`, { refreshToken });
    const expiresIn = Math.max(0, Math.round((Date.parse(res.accessExpiresAt) - Date.now()) / 1000));
    return { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn };
  },

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

/**
 * Still on `/v1/mobile/**`. Hostel v2 replaces both of these with a single
 * cryptographic invitation link (`POST /auth/invitations/{token}/activate`)
 * rather than a phone number or roll number typed in by the account being
 * linked — a different onboarding flow this app doesn't have a screen for
 * yet. See the module header.
 */
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
  get: (signal?: AbortSignal) => api.get<Me>(tenant('/me'), undefined, signal),

  /**
   * What this device should render itself as. Call after login and on resume.
   *
   * Answers for whoever the token belongs to, resolving group → organisation →
   * stock: a student gets their group's mark, a guardian gets the group all
   * their wards agree on, and a warden or admin — who sit in no group — get
   * the university's own. `isDefault` is the only field that says whether the
   * app should draw the bundled lockup instead.
   */
  branding: (signal?: AbortSignal) => api.get<Branding>(tenant('/me/branding'), undefined, signal),
};

export const appConfig = {
  get: (signal?: AbortSignal) => api.get<AppConfig>(tenant('/app-config'), undefined, signal),
};

/* --------------------------------------------- 2b. Geofencing & location */

/**
 * Campus boundaries and where a ward is. Still on `/v1/mobile/**` — these
 * routes are not in the Hostel v2 contract at all (they were never in
 * `mobile-api-documentation.md` either; see `mobile-api-additions.md` §2–4),
 * so there is nothing documented to migrate them to. v1 stays live through
 * the migration, so this keeps working unchanged.
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
    api.get<PermissionSummary>(tenant('/me/permissions/summary'), undefined, signal),

  list: (query: PermissionQuery = {}, signal?: AbortSignal) =>
    api.get<V2Page<Permission>>(tenant('/me/permissions'), query as Query, signal).then(toPage),

  get: (id: string, signal?: AbortSignal) =>
    api.get<PermissionDetail>(tenant(`/me/permissions/${id}`), undefined, signal),

  /** One-step submit — there is no server-side draft. */
  submit: (body: NewPermission) =>
    api.post<Permission>(tenant('/me/permissions'), body, undefined, { idempotencyKey: true }),

  cancel: (id: string) =>
    api.post<Permission>(tenant(`/me/permissions/${id}/cancel`), undefined, undefined, {
      idempotencyKey: true,
    }),

  curfew: (signal?: AbortSignal) => api.get<Curfew>(tenant('/me/curfew'), undefined, signal),

  /** Tenant-overridable — always render the chips from this, never hardcode. */
  categories: (signal?: AbortSignal) =>
    api.get<Category[]>(tenant('/categories'), undefined, signal),
};

/* ------------------------------------------ 4. Guardian — wards & decisions */

export type ParentPermissionQuery = PermissionQuery & {
  childId?: string;
  /** `true` → history: only requests that already carry a decision. */
  decided?: boolean;
};

export const parent = {
  children: (signal?: AbortSignal) => api.get<Ward[]>(tenant('/me/children'), undefined, signal),

  child: (studentId: string, signal?: AbortSignal) =>
    api.get<WardDetail>(tenant(`/me/children/${studentId}`), undefined, signal),

  guardians: (studentId: string, signal?: AbortSignal) =>
    api.get<GuardianRecord[]>(tenant(`/me/children/${studentId}/guardians`), undefined, signal),

  /** Ordering puts everything still `waiting_parent` first, then newest-first. */
  permissions: (query: ParentPermissionQuery = {}, signal?: AbortSignal) =>
    api
      .get<V2Page<Permission>>(tenant('/me/guardian-permissions'), query as Query, signal)
      .then(toParentPage),

  permission: (id: string, signal?: AbortSignal) =>
    api.get<PermissionDetail>(tenant(`/me/guardian-permissions/${id}`), undefined, signal),

  /**
   * Repeating the same decision is a 200 with the current state, not an error.
   * The opposite decision after one is recorded is a 409
   * `PERMISSION_ALREADY_DECIDED`, and more than one attempt per 5s is a 429.
   *
   * `version` is the permission's own `version` field (from the read that put
   * it on screen) — sent as `If-Match`, required by v2 for this decision. A
   * stale one comes back as a 409 `PERMISSION_VERSION_CONFLICT` rather than
   * silently overwriting a decision made elsewhere in the meantime.
   */
  decide: (
    id: string,
    response: 'approve' | 'reject' | 'contact_warden',
    note?: string,
    version?: string
  ) =>
    api.post<Permission>(
      tenant(`/me/guardian-permissions/${id}/decision`),
      { response, note },
      undefined,
      { idempotencyKey: true, ifMatch: version }
    ),

  lateEntries: (studentId: string, query: PageQuery = {}, signal?: AbortSignal) =>
    api
      .get<V2Page<LateEntry> & { unacknowledged: number }>(
        tenant(`/me/children/${studentId}/late-entries`),
        query as Query,
        signal
      )
      .then((res) => ({ ...toPage(res), unacknowledged: res.unacknowledged ?? 0 })),

  /** Clears the "new since you last checked" flag. Calling it twice is harmless. */
  acknowledgeLateEntry: (id: string) =>
    api.post<LateEntry>(tenant(`/me/late-entries/${id}/acknowledge`), undefined, undefined, {
      idempotencyKey: true,
    }),

  /** Every warden of the ward's site is pushed immediately. One per 30s. */
  raiseEmergency: (body: {
    studentId: string;
    category: EmergencyCategory;
    message: string;
    contactPhone?: string;
  }) => api.post<EmergencyAlert>(tenant('/emergencies'), body, undefined, { idempotencyKey: true }),
};

/* ------------------------------------------------ 5. Admin & warden — campus */

export type AdminPermissionQuery = PermissionQuery & { siteId?: string };

export const admin = {
  stats: (siteId?: string, signal?: AbortSignal) =>
    api.get<AdminStats>(tenant('/dashboard'), { siteId }, signal),

  activity: (query: { limit?: number; siteId?: string } = {}, signal?: AbortSignal) =>
    api.get<ActivityItem[]>(tenant('/dashboard/activity'), query as Query, signal),

  permissions: (query: AdminPermissionQuery = {}, signal?: AbortSignal) =>
    api.get<V2Page<Permission>>(tenant('/permissions'), query as Query, signal).then(toPage),

  permission: (id: string, signal?: AbortSignal) =>
    api.get<PermissionDetail>(tenant(`/permissions/${id}`), undefined, signal),

  /**
   * Bypasses the state machine deliberately, and is written to the audit log.
   * `POST /permissions/{id}/manual-override` — admin-only, MFA step-up level
   * 2 on the v2 contract. This app has no MFA flow yet (see the module
   * header), so this call is wired correctly but will 401/403 until that
   * exists on whichever session is calling it.
   */
  override: (id: string, status: PermissionStatus, note?: string, version?: string) =>
    api.post<Permission>(
      tenant(`/permissions/${id}/manual-override`),
      { status, note },
      undefined,
      { idempotencyKey: true, ifMatch: version }
    ),

  /**
   * `text/csv`, capped at 5000 rows. Still on `/v1/mobile/**` — v2 turns this
   * into an async report job (`POST /report-jobs` then poll `GET /jobs/{id}`),
   * which needs a progress UI this screen doesn't have yet. See the module
   * header.
   */
  exportPermissions: (query: AdminPermissionQuery = {}) =>
    api.csv(`${V1}/admin/permissions/export`, query as Query),

  announcements: (limit = 20, signal?: AbortSignal) =>
    api.get<Announcement[]>(tenant('/announcements'), { limit }, signal),

  /** `siteIds` defaults to the caller's sites. Every recipient also gets a push. */
  announce: (body: {
    title: string;
    body: string;
    audience?: 'all' | 'student' | 'parent' | 'warden';
    siteIds?: string[];
  }) => api.post<Announcement>(tenant('/announcements'), body, undefined, { idempotencyKey: true }),

  /** Still on `/v1/mobile/**` — same async-job gap as `exportPermissions`. */
  reports: (month?: string, signal?: AbortSignal) =>
    api.get<unknown>(`${V1}/admin/reports`, { month }, signal),

  /**
   * `GET /roles` + `GET /memberships` on v2, combined back into the one
   * `RolesResponse` shape this screen already renders. The v2 membership
   * object isn't in the handoff's role guide in enough detail to map every
   * field with confidence, so `staff[]` here is a best-effort projection —
   * worth re-checking against a live v2 backend before trusting it fully.
   */
  roles: async (signal?: AbortSignal): Promise<RolesResponse> => {
    const [roles, memberships] = await Promise.all([
      api.get<{ role: Role | string; label: string; capabilities: string[]; members: number }[]>(
        tenant('/roles'),
        undefined,
        signal
      ),
      api.get<
        {
          userId: string;
          role: Role | string;
          displayName: string | null;
          email: string | null;
          siteIds: string[];
        }[]
      >(tenant('/memberships'), undefined, signal),
    ]);
    return { roles, staff: memberships };
  },

  /**
   * Still on `/v1/mobile/**`. Not called from any screen today; v2's
   * equivalent (`PATCH /memberships/{membershipId}`) keys off a membership
   * id this app never fetches, so it's left alone rather than guessed at.
   * See the module header.
   */
  setRole: (userId: string, role: Role) =>
    api.put<unknown>(`${V1}/admin/users/${userId}/role`, { role }),

  emergencies: (status = 'open', signal?: AbortSignal) =>
    api.get<EmergencyAlert[]>(tenant('/emergencies'), { status }, signal),

  /**
   * `status: 'acknowledged'` calls the v2 acknowledge op, `'resolved'` calls
   * resolve — both require `If-Match`, which `version` (the alert's own
   * `version` field) supplies.
   */
  resolveEmergency: (
    id: string,
    status: 'acknowledged' | 'resolved' = 'resolved',
    note?: string,
    version?: string
  ) =>
    api.post<EmergencyAlert>(
      tenant(`/emergencies/${id}/${status === 'acknowledged' ? 'acknowledge' : 'resolve'}`),
      { note },
      undefined,
      { idempotencyKey: true, ifMatch: version }
    ),

  /* --- Profile change requests, admin side --- */

  profileRequests: (
    query: PageQuery & { status?: ProfileRequestStatus | 'all'; q?: string } = {},
    signal?: AbortSignal
  ) =>
    api.get<V2Page<ProfileRequest>>(tenant('/profile-requests'), query as Query, signal).then(toPage),

  /** Writes the whitelisted fields to the record and notifies the requester. */
  approveProfileRequest: (id: string, note?: string, version?: string) =>
    api.post<ProfileRequest>(tenant(`/profile-requests/${id}/approve`), { note }, undefined, {
      idempotencyKey: true,
      ifMatch: version,
    }),

  rejectProfileRequest: (id: string, note?: string, version?: string) =>
    api.post<ProfileRequest>(tenant(`/profile-requests/${id}/reject`), { note }, undefined, {
      idempotencyKey: true,
      ifMatch: version,
    }),

  /** Still on `/v1/mobile/**` — same async-job gap as `exportPermissions`. */
  exportProfileRequests: (status?: ProfileRequestStatus | 'all') =>
    api.csv(`${V1}/admin/profile-requests/export`, { status }),

  /* --- Groups, branding, roster --- */

  groups: (branded?: boolean, signal?: AbortSignal) =>
    api.get<Group[]>(tenant('/groups'), { branded }, signal),

  group: (id: string, signal?: AbortSignal) =>
    api.get<GroupDetail>(tenant(`/groups/${id}`), undefined, signal),

  /**
   * `name` is required and must be unique within the tenant — a duplicate is a
   * 400. Everything else is optional; the usual flow is to create with a name
   * and set the mark from the editor afterwards.
   */
  createGroup: (body: {
    name: string;
    appName?: string;
    iconColors?: string[];
    shape?: string;
    iconLabel?: string;
    /** `fileId` from `POST /uploads` with `purpose=group-icon`. */
    iconKey?: string;
  }) => api.post<Group>(tenant('/groups'), body, undefined, { idempotencyKey: true }),

  /**
   * The "Apply to N" action. `appName` ≤ 14 chars, `iconLabel` ≤ 2 chars, and
   * when `memberStudentIds` is present it **replaces** the roster.
   */
  applyBranding: (id: string, body: BrandingPayload) =>
    api.post<Group>(tenant(`/groups/${id}/branding`), body, undefined, { idempotencyKey: true }),

  roster: (query: PageQuery & { q?: string; siteId?: string } = {}, signal?: AbortSignal) =>
    api.get<V2Page<RosterStudent>>(tenant('/roster'), query as Query, signal).then(toPage),
};

/* ------------------------------------- 6. Warden queue (the admin persona) */

export const warden = {
  /** Site-scoped; defaults to pending_warden, waiting_parent and escalated. */
  permissions: (query: PermissionQuery = {}, signal?: AbortSignal) =>
    api.get<V2Page<Permission>>(tenant('/permissions'), query as Query, signal).then(toPage),

  /** Approving kicks off the guardian approval flow. Throttled to 1 per 5s. */
  decide: (id: string, response: 'approve' | 'reject', note?: string, version?: string) =>
    api.post<Permission>(
      tenant(`/permissions/${id}/warden-decision`),
      { response, note },
      undefined,
      { idempotencyKey: true, ifMatch: version }
    ),

  activate: (id: string, version?: string) =>
    api.post<Permission>(tenant(`/permissions/${id}/activate`), undefined, undefined, {
      idempotencyKey: true,
      ifMatch: version,
    }),

  /**
   * Closes a live pass by hand — the warden has seen the student back on
   * campus. `active` and `student_exited` both accept it; anything else is a
   * 409 `PERMISSION_NOT_ACTIVE`.
   *
   * Still on `/v1/mobile/**` — there is no v2 mapping for this route in the
   * migration matrix at all (it isn't a v1 endpoint that doc even lists), so
   * there is nothing documented to move it to. See the module header.
   */
  endPass: (id: string, note?: string) =>
    api.post<ClosedPermission>(`${V1}/warden/permissions/${id}/end`, note ? { note } : {}),

  /** Logs a guardian response that came in out of band. */
  resolveEscalated: (
    id: string,
    response: 'approve' | 'reject',
    note?: string,
    version?: string
  ) =>
    api.post<Permission>(
      tenant(`/permissions/${id}/resolve-escalated`),
      { response, note },
      undefined,
      { idempotencyKey: true, ifMatch: version }
    ),

  dashboard: (signal?: AbortSignal) =>
    api.get<WardenDashboard>(tenant('/dashboard'), undefined, signal),
};

/* ------------------------------------------------ 7. Profile change requests */

export const profileRequests = {
  /**
   * The whitelist of what this account may ask to change, plus whatever it has
   * already filed — shown inline so nobody submits the same thing twice.
   */
  fields: (signal?: AbortSignal) =>
    api.get<ProfileFields>(tenant('/profile-request-fields'), undefined, signal),

  /** `409 PROFILE_REQUEST_PENDING` — only one open request at a time. */
  create: (body: NewProfileRequest) =>
    api.post<ProfileRequest>(tenant('/me/profile-requests'), body, undefined, {
      idempotencyKey: true,
    }),

  list: (
    query: PageQuery & { status?: ProfileRequestStatus | 'all' } = {},
    signal?: AbortSignal
  ) =>
    api
      .get<V2Page<ProfileRequest>>(tenant('/me/profile-requests'), query as Query, signal)
      .then(toPage),

  get: (id: string, signal?: AbortSignal) =>
    api.get<ProfileRequest>(tenant(`/me/profile-requests/${id}`), undefined, signal),
};

/* ------------------------------------------------------------- 8. Uploads */

/** The wire shape of `UploadResponse` in the Hostel v2 contract. */
type V2Upload = {
  id: string;
  purpose: string;
  mime: string;
  sizeBytes: number;
  scanState: UploadScanState;
  createdAt: string;
};

function fromV2Upload(res: V2Upload, filename: string): UploadResult {
  return {
    fileId: res.id,
    filename,
    contentType: res.mime,
    size: res.sizeBytes,
    scanState: res.scanState,
    createdAt: res.createdAt,
  };
}

/**
 * The `purpose` values this app has always sent (`permission`,
 * `profile-request`, `group-icon`) against the v2 enum
 * (`student_photo | guardian_id | receipt | branding | general | group-icon
 * | org-logo`), which is a different vocabulary — the mobile handoff's prose
 * doc (`uploads.md`) actually disagrees with the OpenAPI bundle's enum on
 * this, so neither is guessed at here beyond the one purpose that appears in
 * both verbatim. **Needs confirming against a live backend** before this
 * mapping is trusted for anything audited by upload purpose.
 */
function v2UploadPurpose(purpose?: 'permission' | 'profile-request' | 'group-icon') {
  if (purpose === 'group-icon') return 'group-icon';
  if (purpose) return 'general'; // TODO(v2): confirm the real purpose for permission / profile-request docs.
  return 'general';
}

export const uploads = {
  /**
   * PDF/JPEG/PNG/HEIC/WEBP, max 5 MB. Send the returned `fileId` with
   * whatever needs it — `supportingDocKeys`, `attachmentKey`, `iconKey`.
   *
   * v2 gates the file behind a quarantine scan (`scanState`); a `pending`
   * result cannot be attached yet — see `canAttachUpload` in
   * `lib/attachments.ts`, which also polls `getScan` for this app so no
   * screen has to.
   */
  create: (
    file: { uri: string; name: string; type: string },
    purpose?: 'permission' | 'profile-request' | 'group-icon'
  ) => {
    const form = new FormData();
    form.append('file', file as unknown as Blob);
    form.append('purpose', v2UploadPurpose(purpose));
    return api
      .post<V2Upload>(tenant('/uploads'), form, undefined, { idempotencyKey: true })
      .then((res) => fromV2Upload(res, file.name));
  },

  /** Current scan/metadata state of a file already on record — for polling `pending`. */
  getScan: (fileId: string, filename = '') =>
    api.get<V2Upload>(tenant(`/uploads/${fileId}`)).then((res) => fromV2Upload(res, filename)),

  /** A fresh, short-lived (≤300s) read URL for an attachment already on record. */
  signedUrl: (fileId: string) =>
    api
      .post<{ downloadUrl: string; expiresInSeconds: number }>(
        tenant(`/uploads/${fileId}/download-url`),
        undefined,
        undefined,
        { idempotencyKey: true }
      )
      .then((res) => ({ key: fileId, url: res.downloadUrl })),
};

/* -------------------------------------------------------- 9. Notifications */

export const notifications = {
  list: (query: PageQuery & { unreadOnly?: boolean } = {}, signal?: AbortSignal) =>
    api.get<V2Page<AppNotification>>(tenant('/me/notifications'), query as Query, signal).then(toPage),

  /** The header badge. */
  unreadCount: (signal?: AbortSignal) =>
    api.get<{ unreadCount: number }>(tenant('/me/notifications/unread-count'), undefined, signal),

  markRead: (id: string) =>
    api.patch<{ count: number }>(tenant(`/me/notifications/${id}/read`), undefined, {
      idempotencyKey: true,
    }),

  markAllRead: () =>
    api.patch<{ count: number }>(tenant('/me/notifications/read-all'), undefined, {
      idempotencyKey: true,
    }),

  preferences: (signal?: AbortSignal) =>
    api.get<NotificationPreferences>(tenant('/me/notification-preferences'), undefined, signal),

  /** `push: false` stops server-side delivery; the inbox still fills. */
  setPreferences: (body: Partial<Pick<NotificationPreferences, 'push' | 'email' | 'sms'>>) =>
    api.put<NotificationPreferences>(tenant('/me/notification-preferences'), body, {
      idempotencyKey: true,
    }),
};

export const push = {
  /**
   * v2 registers a whole device record (`PushDeviceRegistration`), not just a
   * bare token, and returns a server-assigned `deviceId` — the provider token
   * itself is write-only and never echoed back. `lib/push.ts` keeps that id
   * in memory so sign-out can target `unregister(deviceId)`.
   */
  register: (body: PushDeviceRegistration) =>
    api.post<PushDeviceView>(tenant('/me/push-devices'), body, undefined, {
      idempotencyKey: true,
    }),

  unregister: (deviceId: string) =>
    api.del<void>(tenant(`/me/push-devices/${deviceId}`), undefined, { idempotencyKey: true }),
};
