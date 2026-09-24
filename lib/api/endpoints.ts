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
 * `Dev/mobile-v2-handoff/Mobile-v2-handoff/`. **`hostel-v2.bundle.yaml` is
 * the source of truth** for every v2 path, method, header, request body and
 * response shape below — where the prose docs disagree with it, the bundle
 * wins.
 *
 * Every function below still returns the same shape it always has
 * (`Page<T>`, `ParentPage<T>`, `Permission`, `Me`, …) regardless of which
 * surface answers it. v2 is *not* v1 with a new prefix: list envelopes differ
 * per route (`{items, nextCursor, hasMore}`, `{items, page}`, `{data, page}`,
 * or a bare `{data}`), several resources were reshaped (`/me`, curfew, the
 * permission summary, the profile-request whitelist, groups' `logoFileId`),
 * and request bodies renamed fields (`decision` not `response`, `targetStatus`
 * + `reason` on an override, `reason` on a profile rejection). All of that is
 * adapted right here, in the `fromV2*` helpers, so no screen has to know.
 *
 * Mutations that the contract marks `if-match` required send the resource's
 * `version` (the trailing `version?: string` parameter on each); every v2
 * mutation also carries a UUIDv7 `Idempotency-Key`.
 *
 * **What is deliberately still on v1**, and why:
 * - `auth.*` and `onboarding.*` — the v2 equivalents need UI this app does not
 *   have yet (a tenant-code entry step ahead of login, a two-step recovery
 *   flow with a code/token, a current-password field, cryptographic
 *   invitation links replacing phone/roll-number linking). `auth.refresh`
 *   stays with them: the refresh token it rotates was issued by the v1 login,
 *   so it belongs to the v1 session and must go back to the service that
 *   issued it.
 * - `location.*`, `warden.endPass` — no v2 mapping in the migration matrix.
 * - `admin.exportPermissions`, `admin.exportProfileRequests`, `admin.reports`
 *   — v2 turns a synchronous CSV download into an async report job, which
 *   needs a progress UI this screen doesn't have.
 * - `admin.setRole` — unused by any screen; v2 keys off a `membershipId` and
 *   an `If-Match` version.
 */
import { api, getSessionRole, requireTenantId, type Query } from './client';
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
  EditableField,
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
  Site,
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

/* ------------------------------------------------------------ v2 adapters */

/**
 * Every list envelope the v2 bundle uses. It is not consistent across routes:
 * permissions and notifications are `{ items, nextCursor, hasMore }`; profile
 * requests, emergencies, announcements and groups are `{ items, page }`;
 * roster, memberships, sites and dashboard activity are `{ data, page }`; the
 * guardian's children and late entries are a bare `{ data }`.
 */
type V2List<T> = {
  items?: T[];
  data?: T[];
  nextCursor?: string | null;
  hasMore?: boolean;
  page?: { nextCursor?: string | null; hasMore?: boolean };
};

/** Tolerates any of the envelopes above — and a bare array. */
function toPage<T, U = T>(res: V2List<T> | T[] | null | undefined, map?: (row: T) => U): Page<U> {
  const rows = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
  const env = Array.isArray(res) ? undefined : res;
  return {
    data: map ? rows.map(map) : (rows as unknown as U[]),
    nextCursor: env?.page?.nextCursor ?? env?.nextCursor ?? null,
    hasMore: !!(env?.page?.hasMore ?? env?.hasMore),
  };
}

function rows<T, U = T>(res: V2List<T> | T[] | null | undefined, map?: (row: T) => U): U[] {
  return toPage(res, map).data;
}

/** v1 list filters → the v2 query names (`q` → `search`, `childId` → `studentId`). */
function v2Query(query: Record<string, unknown>): Query {
  const { q, childId, ...rest } = query;
  return { ...(rest as Query), search: q as string | undefined, studentId: (childId ?? rest.studentId) as string | undefined };
}

/**
 * Staff/guardian permission rows name the student flat (`studentName`,
 * `studentRollNumber`); every screen reads the v1 nested `student` object.
 * Fields v2 no longer returns come back null rather than undefined so the
 * `Permission` type stays honest.
 */
type V2Permission = Partial<Permission> & {
  id: string;
  status: PermissionStatus;
  studentName?: string;
  studentRollNumber?: string;
  timeline?: PermissionDetail['timeline'];
};

function fromV2Permission(p: V2Permission): PermissionDetail {
  return {
    tenantId: '',
    siteId: '',
    studentId: '',
    type: '',
    reason: '',
    destination: null,
    startDate: null,
    startTime: null,
    endTime: null,
    emergencyContact: null,
    supportingDocKeys: null,
    wardenId: null,
    wardenDecisionAt: null,
    wardenNote: null,
    parentContactId: null,
    parentDecisionAt: null,
    parentNote: null,
    parentDecisionMethod: null,
    parentDecisionEvidence: null,
    exitTime: null,
    returnTime: null,
    durationMinutes: null,
    expiresAt: null,
    cancelledBy: null,
    cancelledAt: null,
    createdAt: '',
    updatedAt: '',
    ...p,
    student:
      p.student ??
      (p.studentName
        ? { id: p.studentId ?? '', name: p.studentName, rollNumber: p.studentRollNumber ?? '', roomNumber: null }
        : undefined),
    timeline: p.timeline ?? [],
    decidedBy: null,
  };
}

/** Pass statuses that mean "this request is still in play" — for the home screen's live card. */
const LIVE_STATUSES: PermissionStatus[] = [
  'pending_warden',
  'warden_approved',
  'waiting_parent',
  'parent_approved',
  'active',
  'student_exited',
  'escalated',
  'contact_parent',
  'parent_unreachable',
];

type V2Guardian = {
  id: string;
  guardianPrincipalId?: string | null;
  name: string;
  relationship: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  email?: string | null;
  decisionEligible: boolean;
  activationStatus: string;
};

function fromV2Guardian(g: V2Guardian): GuardianRecord {
  return {
    id: g.id,
    name: g.name,
    relationship: g.relationship ?? null,
    phone: g.phone ?? null,
    alternatePhone: g.alternatePhone ?? null,
    email: g.email ?? null,
    isApprover: !!g.decisionEligible,
    hasAppAccount: g.activationStatus === 'active',
  };
}

type V2Child = Omit<Ward, 'department' | 'year' | 'roomNumber'> & {
  roomNumber?: string | null;
  department?: string | null;
  year?: string | null;
};

function fromV2Child(c: V2Child): Ward {
  return {
    ...c,
    roomNumber: c.roomNumber ?? null,
    department: c.department ?? null,
    year: c.year ?? null,
    siblings: (c.siblings ?? []).map((s) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber })),
  };
}

type V2LateEntry = {
  id: string;
  date: string;
  actualEntryTime: string;
  delayMinutes: number;
  category: string;
  resolution: string;
  acknowledgedAt?: string | null;
  reason?: string | null;
  gateLabel?: string | null;
  version: string;
};

function fromV2LateEntry(e: V2LateEntry): LateEntry {
  return {
    id: e.id,
    permissionId: null,
    date: e.date,
    dueBackAt: null,
    scannedInAt: e.actualEntryTime ?? null,
    delayMinutes: e.delayMinutes,
    delayLabel: null,
    severity: e.category,
    reason: e.reason ?? null,
    resolution: e.resolution ?? null,
    resolutionNote: null,
    gate: e.gateLabel ?? null,
    recordedBy: null,
    acknowledged: !!e.acknowledgedAt,
    acknowledgedAt: e.acknowledgedAt ?? null,
  };
}

/** v2 `ProfileRequest` names the upload `attachmentFileId`; screens read `attachmentKey`. */
type V2ProfileRequest = ProfileRequest & { attachmentFileId?: string | null };

function fromV2ProfileRequest(r: V2ProfileRequest): ProfileRequest {
  return {
    ...r,
    reason: r.reason ?? '',
    siteId: r.siteId ?? null,
    attachmentKey: r.attachmentFileId ?? r.attachmentKey ?? null,
    reviewedBy: r.reviewedBy ?? null,
    reviewedAt: r.reviewedAt ?? null,
    reviewNote: r.reviewNote ?? null,
  };
}

/** v2 groups and branding carry `logoFileId`/`logoUrl`; screens read `iconKey`/`iconUrl`. */
type V2Group = Omit<Group, 'iconKey' | 'iconUrl' | 'appName'> & {
  appName: string | null;
  logoFileId?: string | null;
  logoUrl?: string | null;
  version: string;
  members?: { studentId: string; name?: string; rollNumber?: string; addedAt: string }[];
};

function fromV2Group(g: V2Group): GroupDetail {
  const { logoFileId, logoUrl, members, ...rest } = g;
  return {
    ...rest,
    appName: g.appName ?? '',
    iconKey: logoFileId ?? null,
    iconUrl: logoUrl ?? null,
    members: (members ?? []).map((m) => ({
      studentId: m.studentId,
      name: m.name ?? '',
      rollNumber: m.rollNumber ?? '',
      addedAt: m.addedAt,
    })),
  };
}

/** `parent` is v1's word; v2 accepts both but `guardian` is its own. */
function v2Audience(audience?: 'all' | 'student' | 'parent' | 'warden') {
  return audience === 'parent' ? 'guardian' : (audience ?? 'all');
}

function fromV2Audience<T extends { audience: string }>(row: T): T {
  return row.audience === 'guardian' ? { ...row, audience: 'parent' } : row;
}

/** `phone_number` → `Phone number`, for a whitelist that no longer ships labels. */
function labelFor(field: string) {
  const words = field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function inputTypeFor(field: string): EditableField['type'] {
  if (/phone|mobile/i.test(field)) return 'tel';
  if (/email/i.test(field)) return 'email';
  return 'text';
}

/* -------------------------------------------------------- 1. Auth & session */

/**
 * Password is the only credential. There is no OTP sign-in and no self-service
 * sign-up: accounts are provisioned by the hostel office, which is why a `404`
 * from `login` is a "contact the office" message rather than a way in.
 *
 * All still on `/v1/mobile/**` — see the module header for why.
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
   * Trades the refresh token for a fresh access token. On v1 because the v1
   * login issued it — see the module header. `lib/auth.tsx` feature-detects
   * it and signs out with an explanation if the server answers 404.
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

/** `GET /me` on v2 — the principal, not the campus record behind it. */
type V2Self = {
  principalId: string;
  actorType: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  tenantId?: string | null;
  role?: string | null;
  studentId?: string | null;
  childCount: number;
  version: string;
};

type V2SelfStudent = StudentProfile & {
  guardians?: V2Guardian[];
  version: string;
};

async function studentSelf(signal?: AbortSignal): Promise<Me> {
  const s = await api.get<V2SelfStudent>(tenant('/me/student'), undefined, signal);
  const { guardians, version: _version, ...student } = s;
  const site = await api
    .get<V2List<Site>>(tenant('/sites'), undefined, signal)
    .then((res) => rows(res).find((x) => x.id === s.siteId) ?? null)
    .catch(() => null);
  return {
    ...student,
    roomNumber: s.roomNumber ?? null,
    department: s.department ?? null,
    year: s.year ?? null,
    site,
    parents: (guardians ?? []).map(fromV2Guardian),
  } as Me;
}

async function guardianSelf(signal?: AbortSignal): Promise<Me> {
  const [self, children] = await Promise.all([
    api.get<V2Self>(tenant('/me'), undefined, signal),
    api.get<V2List<V2Child>>(tenant('/me/children'), undefined, signal),
  ]);
  /* v2 has no "my own guardian record" read. The guardian list on the first
     ward is the closest thing, and `guardianPrincipalId` says which row is
     the signed-in account. */
  const wards = rows(children, fromV2Child);
  const guardians = wards[0]
    ? await api
        .get<V2List<V2Guardian>>(tenant(`/me/children/${wards[0].id}/guardians`), undefined, signal)
        .then((res) => rows(res))
        .catch(() => [] as V2Guardian[])
    : [];
  const mine = guardians.filter((g) => g.guardianPrincipalId === self.principalId);
  return {
    parentContacts: (mine.length ? mine : []).map((g) => ({ ...fromV2Guardian(g), isYou: true })),
    children: wards.map((w) => ({ ...w, enrollmentStatus: null })),
    name: self.displayName,
    email: self.email ?? null,
    phone: self.phone ?? null,
  } as Me;
}

async function staffSelf(signal?: AbortSignal): Promise<Me> {
  const [self, sites] = await Promise.all([
    api.get<V2Self>(tenant('/me'), undefined, signal),
    api
      .get<V2List<Site>>(tenant('/sites'), undefined, signal)
      .then((res) => rows(res))
      .catch(() => [] as Site[]),
  ]);
  return {
    role: (self.role === 'tenant_admin' ? 'admin' : (self.role ?? 'warden')) as Role,
    userId: self.principalId,
    tenantId: self.tenantId ?? requireTenantId(),
    profile: { displayName: self.displayName, email: self.email ?? null, phone: self.phone ?? null },
    assignedSites: sites.map((x) => ({ id: x.id, name: x.name, timezone: x.timezone ?? null })),
  };
}

export const me = {
  /**
   * Role-aware: a Student, a `{ parentContacts, children }`, or staff + sites.
   * v2 splits this across `/me/student`, `/me` + `/me/children`, and `/me` +
   * `/sites`; the session role (`setSessionRole`) picks which.
   */
  get: (signal?: AbortSignal): Promise<Me> => {
    const role = getSessionRole();
    if (role === 'student') return studentSelf(signal);
    if (role === 'parent' || role === 'guardian') return guardianSelf(signal);
    return staffSelf(signal);
  },

  /**
   * What this device should render itself as. Call after login and on resume.
   *
   * Answers for whoever the token belongs to, resolving group → organisation →
   * stock. `isDefault` is the only field that says whether the app should draw
   * the bundled lockup instead.
   */
  branding: (signal?: AbortSignal) =>
    api
      .get<
        Omit<Branding, 'iconKey' | 'iconUrl' | 'groupName'> & {
          groupName?: string | null;
          logoFileId?: string | null;
          logoUrl?: string | null;
        }
      >(tenant('/me/branding'), undefined, signal)
      .then(({ logoFileId, logoUrl, ...b }): Branding => ({
        ...b,
        groupName: b.groupName ?? null,
        iconKey: logoFileId ?? null,
        iconUrl: logoUrl ?? null,
      })),
};

export const appConfig = {
  get: (signal?: AbortSignal) =>
    api
      .get<AppConfig & { tenantName: string | null }>(tenant('/app-config'), undefined, signal)
      .then((c): AppConfig => ({ ...c, tenantName: c.tenantName ?? '' })),
};

/* --------------------------------------------- 2b. Geofencing & location */

/**
 * Campus boundaries and where a ward is. Still on `/v1/mobile/**` — these
 * routes are not in the Hostel v2 contract at all (see
 * `mobile-api-additions.md` §2–4), so there is nothing documented to migrate
 * them to. v1 stays live through the migration, so this keeps working.
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
  /** Pass id, reason, destination, type. Sent to v2 as `search`. */
  q?: string;
};

export const permissions = {
  /**
   * One call for the home screen on v1. v2's summary is counters only, so the
   * live card and the recent list come from the first page of the list —
   * two calls, in parallel.
   */
  summary: async (signal?: AbortSignal): Promise<PermissionSummary> => {
    const [counts, recent] = await Promise.all([
      api.get<PermissionSummary['counts'] & { active?: number }>(
        tenant('/me/permissions/summary'),
        undefined,
        signal
      ),
      api.get<V2List<V2Permission>>(tenant('/me/permissions'), { limit: 5 }, signal),
    ]);
    const list = rows(recent, fromV2Permission);
    return {
      counts,
      liveRequest: list.find((p) => LIVE_STATUSES.includes(p.status)) ?? null,
      recent: list,
    };
  },

  list: (query: PermissionQuery = {}, signal?: AbortSignal) =>
    api
      .get<V2List<V2Permission>>(tenant('/me/permissions'), v2Query(query), signal)
      .then((res) => toPage(res, fromV2Permission)),

  get: (id: string, signal?: AbortSignal) =>
    api.get<V2Permission>(tenant(`/me/permissions/${id}`), undefined, signal).then(fromV2Permission),

  /**
   * One-step submit — there is no server-side draft. v2 requires `startTime`
   * and `endTime` (date-times) alongside `startDate`; the app's single
   * "leaving" / "returning" instants fill all three.
   */
  submit: ({ endDate, ...body }: NewPermission) =>
    api
      .post<V2Permission>(
        tenant('/me/permissions'),
        { ...body, startTime: body.startDate, endTime: endDate },
        undefined,
        { idempotencyKey: true }
      )
      .then(fromV2Permission),

  /** `If-Match` is required by the bundle for this one — pass the pass's `version`. */
  cancel: (id: string, version?: string) =>
    api
      .post<V2Permission>(tenant(`/me/permissions/${id}/cancel`), {}, undefined, {
        idempotencyKey: true,
        ifMatch: version,
      })
      .then(fromV2Permission),

  /**
   * v2's curfew is the student's own in/out state and violations, not the
   * site's window — `activeCurfew` has no v2 source and is always null. The
   * active pass is fetched by id when the server names one.
   */
  curfew: async (signal?: AbortSignal): Promise<Curfew> => {
    const c = await api.get<{
      state: 'in' | 'out';
      since: string;
      activePermissionId?: string | null;
      recentViolations: {
        id: string;
        severity: string;
        status: string;
        occurredAt: string;
        note?: string | null;
      }[];
    }>(tenant('/me/curfew'), undefined, signal);
    const activePermission = c.activePermissionId
      ? await permissions.get(c.activePermissionId, signal).catch(() => null)
      : null;
    return {
      currentStatus: c.state === 'out' ? 'outside' : 'inside',
      activeCurfew: null,
      activePermission,
      recentViolations: (c.recentViolations ?? []).map((v) => ({
        id: v.id,
        permissionId: null,
        date: v.occurredAt,
        dueBackAt: null,
        scannedInAt: v.occurredAt,
        delayMinutes: 0,
        delayLabel: null,
        severity: v.severity,
        reason: v.note ?? null,
        resolution: v.status,
        resolutionNote: null,
        gate: null,
        recordedBy: null,
        acknowledged: v.status !== 'open',
        acknowledgedAt: null,
      })),
    };
  },

  /** Tenant-overridable — always render the chips from this, never hardcode. */
  categories: (signal?: AbortSignal) =>
    api
      .get<Category[] | V2List<Category>>(tenant('/categories'), undefined, signal)
      .then((res) => rows(res)),
};

/* ------------------------------------------ 4. Guardian — wards & decisions */

export type ParentPermissionQuery = PermissionQuery & {
  /** Sent to v2 as `studentId`. */
  childId?: string;
  /** `true` → history: only requests that already carry a decision. */
  decided?: boolean;
};

export const parent = {
  children: (signal?: AbortSignal) =>
    api.get<V2List<V2Child>>(tenant('/me/children'), undefined, signal).then((res) => rows(res, fromV2Child)),

  /**
   * v2's ward read is the same card the list returns; the richer v1 overview
   * (last gate scan, hostel wardens, term counters) has no v2 source, so
   * those fields come back empty rather than invented. Guardians are a
   * separate call the ward screen already makes.
   */
  child: (studentId: string, signal?: AbortSignal) =>
    api.get<V2Child>(tenant(`/me/children/${studentId}`), undefined, signal).then((c): WardDetail => {
      const w = fromV2Child(c);
      return {
        ...w,
        enrollmentStatus: null,
        lastGateScan: null,
        activePermission: null,
        passesThisTerm: 0,
        termStart: null,
        openViolations: 0,
        site: null,
        hostel: w.roomNumber ? { room: w.roomNumber, group: null, wardens: [] } : null,
        guardians: [],
      };
    }),

  guardians: (studentId: string, signal?: AbortSignal) =>
    api
      .get<V2List<V2Guardian>>(tenant(`/me/children/${studentId}/guardians`), undefined, signal)
      .then((res) => rows(res, fromV2Guardian)),

  /** Ordering puts everything still `waiting_parent` first, then newest-first. */
  permissions: (query: ParentPermissionQuery = {}, signal?: AbortSignal) =>
    api
      .get<V2List<V2Permission>>(tenant('/me/guardian-permissions'), v2Query(query), signal)
      .then((res): ParentPage<Permission> => {
        const page = toPage(res, fromV2Permission);
        return { permissions: page.data, nextCursor: page.nextCursor, hasMore: page.hasMore };
      }),

  permission: (id: string, signal?: AbortSignal) =>
    api
      .get<V2Permission>(tenant(`/me/guardian-permissions/${id}`), undefined, signal)
      .then(fromV2Permission),

  /**
   * Replaying the same decision returns the current state. A different later
   * decision is a 409. `version` is the permission's own `version` (from the
   * read that put it on screen) — sent as `If-Match`, which v2 requires.
   */
  decide: (
    id: string,
    decision: 'approve' | 'reject' | 'contact_warden',
    note?: string,
    version?: string
  ) =>
    api
      .post<V2Permission>(
        tenant(`/me/guardian-permissions/${id}/decision`),
        { decision, note },
        undefined,
        { idempotencyKey: true, ifMatch: version }
      )
      .then(fromV2Permission),

  /** v2 returns a bare `{ data }` with no counter, so the unread count is worked out here. */
  lateEntries: (studentId: string, query: PageQuery = {}, signal?: AbortSignal) =>
    api
      .get<V2List<V2LateEntry>>(tenant(`/me/children/${studentId}/late-entries`), query as Query, signal)
      .then((res): LateEntryPage => {
        const page = toPage(res, fromV2LateEntry);
        return { ...page, unacknowledged: page.data.filter((e) => !e.acknowledged).length };
      }),

  /** Clears the "new since you last checked" flag. Calling it twice is harmless. */
  acknowledgeLateEntry: (id: string) =>
    api
      .post<V2LateEntry>(tenant(`/me/late-entries/${id}/acknowledge`), undefined, undefined, {
        idempotencyKey: true,
      })
      .then(fromV2LateEntry),

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

type V2Dashboard = {
  pendingApprovals?: { permissions?: number; profileRequests?: number };
  studentsInside?: { outside?: number };
  lateReturnsToday?: { count?: number };
  adminStats?: {
    approvedToday?: number;
    currentlyOut?: number;
    overdue?: number;
    openEmergencies?: number;
    pendingProfileRequests?: number;
  };
  summary?: { overduePermissions?: number };
  generatedAt: string;
};

export const admin = {
  stats: (siteId?: string, signal?: AbortSignal) =>
    api.get<V2Dashboard>(tenant('/dashboard'), { siteId }, signal).then(
      (d): AdminStats => ({
        pending: d.pendingApprovals?.permissions ?? 0,
        approvedToday: d.adminStats?.approvedToday ?? 0,
        currentlyOut: d.adminStats?.currentlyOut ?? d.studentsInside?.outside ?? 0,
        overdue: d.adminStats?.overdue ?? d.summary?.overduePermissions ?? 0,
        openEmergencies: d.adminStats?.openEmergencies ?? 0,
        pendingProfileRequests:
          d.adminStats?.pendingProfileRequests ?? d.pendingApprovals?.profileRequests ?? 0,
        generatedAt: d.generatedAt,
      })
    ),

  activity: (query: { limit?: number; siteId?: string } = {}, signal?: AbortSignal) =>
    api
      .get<
        V2List<{
          id: string;
          type: string;
          occurredAt: string;
          summary: string;
          actorType?: string | null;
        }>
      >(tenant('/dashboard/activity'), query as Query, signal)
      .then((res) =>
        rows(
          res,
          (a): ActivityItem => ({
            id: a.id,
            at: a.occurredAt,
            action: a.type,
            targetType: a.type,
            targetId: '',
            actorUserId: null,
            actorType: a.actorType ?? '',
            summary: a.summary,
          })
        )
      ),

  permissions: (query: AdminPermissionQuery = {}, signal?: AbortSignal) =>
    api
      .get<V2List<V2Permission>>(tenant('/permissions'), v2Query(query), signal)
      .then((res) => toPage(res, fromV2Permission)),

  permission: (id: string, signal?: AbortSignal) =>
    api.get<V2Permission>(tenant(`/permissions/${id}`), undefined, signal).then(fromV2Permission),

  /**
   * Bypasses the state machine deliberately, and is written to the audit log.
   * Admin-only, MFA step-up level 2 on the v2 contract — this app has no MFA
   * flow yet, so expect a 401/403 until a session has stepped up.
   */
  override: (id: string, status: PermissionStatus, reason: string, version?: string) =>
    api
      .post<V2Permission>(
        tenant(`/permissions/${id}/manual-override`),
        { targetStatus: status, reason },
        undefined,
        { idempotencyKey: true, ifMatch: version }
      )
      .then(fromV2Permission),

  /** `text/csv`, capped at 5000 rows. Still on `/v1/mobile/**` — see the module header. */
  exportPermissions: (query: AdminPermissionQuery = {}) =>
    api.csv(`${V1}/admin/permissions/export`, query as Query),

  announcements: (limit = 20, signal?: AbortSignal) =>
    api
      .get<V2List<Announcement>>(tenant('/announcements'), { limit }, signal)
      .then((res) => rows(res, fromV2Audience)),

  /** `siteIds` defaults to the caller's sites. Every recipient also gets a push. */
  announce: (body: {
    title: string;
    body: string;
    audience?: 'all' | 'student' | 'parent' | 'warden';
    siteIds?: string[];
  }) =>
    api
      .post<Announcement>(
        tenant('/announcements'),
        { ...body, audience: v2Audience(body.audience) },
        undefined,
        { idempotencyKey: true }
      )
      .then(fromV2Audience),

  /** Still on `/v1/mobile/**` — same async-job gap as `exportPermissions`. */
  reports: (month?: string, signal?: AbortSignal) =>
    api.get<unknown>(`${V1}/admin/reports`, { month }, signal),

  /** `GET /roles` + `GET /memberships`, combined into the one shape the roles sheet renders. */
  roles: async (signal?: AbortSignal): Promise<RolesResponse> => {
    const [roles, memberships] = await Promise.all([
      api.get<{ key: string; name: string; privileged: boolean; capabilities: string[] }[]>(
        tenant('/roles'),
        undefined,
        signal
      ),
      api.get<
        V2List<{
          principalId: string;
          role: string;
          displayName: string;
          email: string;
          siteIds: string[];
        }>
      >(tenant('/memberships'), { limit: 100 }, signal),
    ]);
    const staff = rows(memberships, (m) => ({
      userId: m.principalId,
      role: m.role,
      displayName: m.displayName ?? null,
      email: m.email ?? null,
      siteIds: m.siteIds ?? [],
    }));
    return {
      roles: rows(roles).map((r) => ({
        role: r.key,
        label: r.name,
        capabilities: r.capabilities ?? [],
        members: staff.filter((s) => s.role === r.key).length,
      })),
      staff,
    };
  },

  /** Still on `/v1/mobile/**`, and not called from any screen. See the module header. */
  setRole: (userId: string, role: Role) =>
    api.put<unknown>(`${V1}/admin/users/${userId}/role`, { role }),

  emergencies: (status = 'open', signal?: AbortSignal) =>
    api.get<V2List<EmergencyAlert>>(tenant('/emergencies'), { status }, signal).then((res) => rows(res)),

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
    api
      .get<V2List<V2ProfileRequest>>(
        tenant('/profile-requests'),
        { ...v2Query(query), status: query.status === 'all' ? undefined : query.status },
        signal
      )
      .then((res) => toPage(res, fromV2ProfileRequest)),

  /** Writes the whitelisted fields to the record and notifies the requester. */
  approveProfileRequest: (id: string, note?: string, version?: string) =>
    api
      .post<V2ProfileRequest>(tenant(`/profile-requests/${id}/approve`), { note }, undefined, {
        idempotencyKey: true,
        ifMatch: version,
      })
      .then(fromV2ProfileRequest),

  /** v2 names the rejection note `reason`, and requires it. */
  rejectProfileRequest: (id: string, note?: string, version?: string) =>
    api
      .post<V2ProfileRequest>(
        tenant(`/profile-requests/${id}/reject`),
        { reason: note?.trim() || 'Rejected' },
        undefined,
        { idempotencyKey: true, ifMatch: version }
      )
      .then(fromV2ProfileRequest),

  /** Still on `/v1/mobile/**` — same async-job gap as `exportPermissions`. */
  exportProfileRequests: (status?: ProfileRequestStatus | 'all') =>
    api.csv(`${V1}/admin/profile-requests/export`, { status }),

  /* --- Groups, branding, roster --- */

  /** v2 has no `branded` query filter, so it is applied to the page here. */
  groups: (branded?: boolean, signal?: AbortSignal) =>
    api
      .get<V2List<V2Group>>(tenant('/groups'), { limit: 100 }, signal)
      .then((res) =>
        rows(res, fromV2Group).filter((g) => branded === undefined || g.hasCustomBranding === branded)
      ),

  group: (id: string, signal?: AbortSignal) =>
    api.get<V2Group>(tenant(`/groups/${id}`), undefined, signal).then(fromV2Group),

  /**
   * `name` is required and must be unique within the tenant — a duplicate is a
   * 400. The usual flow is to create with a name and set the mark from the
   * editor afterwards.
   */
  createGroup: ({ iconKey, ...body }: {
    name: string;
    appName?: string;
    iconColors?: string[];
    shape?: string;
    iconLabel?: string;
    /** `fileId` from `POST /uploads` with `purpose=group-icon`. Sent as `logoFileId`. */
    iconKey?: string;
  }) =>
    api
      .post<V2Group>(tenant('/groups'), { ...body, logoFileId: iconKey }, undefined, {
        idempotencyKey: true,
      })
      .then(fromV2Group),

  /**
   * The "Apply to N" action. v2 splits this into two writes, each
   * conditional on the group's `version`: `PUT /branding` (a full replace, so
   * `appName`, `iconColors` and `shape` are required) and, when
   * `memberStudentIds` is present, `PUT /members`, which **replaces** the
   * roster. The second is conditional on the version the first returned.
   */
  applyBranding: async (id: string, body: BrandingPayload, version?: string): Promise<Group> => {
    const { memberStudentIds, iconKey, ...mark } = body;
    let group = await api
      .put<V2Group>(
        tenant(`/groups/${id}/branding`),
        { ...mark, logoFileId: iconKey ?? null },
        { idempotencyKey: true, ifMatch: version }
      )
      .then(fromV2Group);
    if (memberStudentIds) {
      group = await api
        .put<V2Group>(
          tenant(`/groups/${id}/members`),
          { studentIds: memberStudentIds },
          { idempotencyKey: true, ifMatch: group.version }
        )
        .then(fromV2Group);
    }
    return group;
  },

  /** v2's roster rows carry no group membership, so `branded`/`groupId` are unknown here. */
  roster: (query: PageQuery & { q?: string; siteId?: string } = {}, signal?: AbortSignal) =>
    api
      .get<
        V2List<{ id: string; name: string; rollNumber: string; roomNumber?: string | null; siteId: string }>
      >(tenant('/roster'), v2Query(query), signal)
      .then((res) =>
        toPage(
          res,
          (s): RosterStudent => ({
            id: s.id,
            name: s.name,
            rollNumber: s.rollNumber,
            roomNumber: s.roomNumber ?? null,
            siteId: s.siteId,
            branded: false,
            groupId: null,
            groupName: null,
          })
        )
      ),
};

/* ------------------------------------- 6. Warden queue (the admin persona) */

export const warden = {
  /** Site-scoped; defaults to pending_warden, waiting_parent and escalated. */
  permissions: (query: PermissionQuery = {}, signal?: AbortSignal) =>
    api
      .get<V2List<V2Permission>>(tenant('/permissions'), v2Query(query), signal)
      .then((res) => toPage(res, fromV2Permission)),

  /** Approving kicks off the guardian approval flow. Throttled to 1 per 5s. */
  decide: (id: string, decision: 'approve' | 'reject', note?: string, version?: string) =>
    api
      .post<V2Permission>(
        tenant(`/permissions/${id}/warden-decision`),
        { decision, note },
        undefined,
        { idempotencyKey: true, ifMatch: version }
      )
      .then(fromV2Permission),

  activate: (id: string, version?: string) =>
    api
      .post<V2Permission>(tenant(`/permissions/${id}/activate`), {}, undefined, {
        idempotencyKey: true,
        ifMatch: version,
      })
      .then(fromV2Permission),

  /**
   * Closes a live pass by hand — the warden has seen the student back on
   * campus. `active` and `student_exited` both accept it; anything else is a
   * 409 `PERMISSION_NOT_ACTIVE`. Still on `/v1/mobile/**` — no v2 mapping.
   */
  endPass: (id: string, note?: string) =>
    api.post<ClosedPermission>(`${V1}/warden/permissions/${id}/end`, note ? { note } : {}),

  /**
   * Logs a guardian response that came in out of band.
   *
   * v2's `resolve-escalated` only knows `log_guardian_approval` (plus
   * `resend_guardian` and `mark_guardian_unreachable`) — there is no "log a
   * guardian refusal" action. A refusal is recorded as a warden rejection
   * instead, with the note saying where it came from.
   */
  resolveEscalated: (
    id: string,
    response: 'approve' | 'reject',
    note?: string,
    version?: string
  ) =>
    response === 'approve'
      ? api
          .post<V2Permission>(
            tenant(`/permissions/${id}/resolve-escalated`),
            { action: 'log_guardian_approval', note },
            undefined,
            { idempotencyKey: true, ifMatch: version }
          )
          .then(fromV2Permission)
      : warden.decide(id, 'reject', note ? `Guardian refused. ${note}` : 'Guardian refused.', version),

  dashboard: (signal?: AbortSignal) =>
    api.get<V2Dashboard>(tenant('/dashboard'), undefined, signal).then(
      (d): WardenDashboard => ({
        pendingPermissions: d.pendingApprovals?.permissions ?? 0,
        activePermissions: d.adminStats?.currentlyOut ?? d.studentsInside?.outside ?? 0,
        studentsOut: d.studentsInside?.outside ?? 0,
      })
    ),
};

/* ------------------------------------------------ 7. Profile change requests */

export const profileRequests = {
  /**
   * The whitelist of what this account may ask to change, plus whatever it has
   * already filed. v2's whitelist is field names per subject type only — the
   * labels, input types and current values v1 carried are rebuilt here from
   * the account's own record, and the open request from its request list.
   */
  fields: async (signal?: AbortSignal): Promise<ProfileFields> => {
    const role = getSessionRole();
    const subjectType = role === 'student' ? 'student' : 'guardian';
    const [whitelist, record, open] = await Promise.all([
      api.get<{ student?: string[]; guardian?: string[] }>(
        tenant('/profile-request-fields'),
        undefined,
        signal
      ),
      subjectType === 'student'
        ? api.get<Record<string, unknown>>(tenant('/me/student'), undefined, signal)
        : api.get<Record<string, unknown>>(tenant('/me'), undefined, signal).then((s): Record<string, unknown> => ({
            ...s,
            name: s.displayName,
          })),
      api.get<V2List<V2ProfileRequest>>(tenant('/me/profile-requests'), { limit: 20 }, signal),
    ]);
    const names = (subjectType === 'student' ? whitelist.student : whitelist.guardian) ?? [];
    return {
      subjectType: subjectType === 'student' ? 'student' : 'parent',
      subjectId: String(record.id ?? record.principalId ?? ''),
      fields: names.map((field) => {
        const current = record[field];
        return {
          field,
          label: labelFor(field),
          type: inputTypeFor(field),
          currentValue: current == null ? null : String(current),
        };
      }),
      pendingRequest:
        rows(open, fromV2ProfileRequest).find((r) => r.status === 'pending') ?? null,
    };
  },

  /** `409 PROFILE_REQUEST_PENDING` — only one open request at a time. */
  create: ({ attachmentKey, ...body }: NewProfileRequest) =>
    api
      .post<V2ProfileRequest>(
        tenant('/me/profile-requests'),
        { ...body, attachmentFileId: attachmentKey },
        undefined,
        { idempotencyKey: true }
      )
      .then(fromV2ProfileRequest),

  /** v2 has no status filter on this list, so `status` is applied to the page here. */
  list: (
    query: PageQuery & { status?: ProfileRequestStatus | 'all' } = {},
    signal?: AbortSignal
  ) => {
    const { status, ...paging } = query;
    return api
      .get<V2List<V2ProfileRequest>>(tenant('/me/profile-requests'), paging as Query, signal)
      .then((res) => {
        const page = toPage(res, fromV2ProfileRequest);
        return status && status !== 'all'
          ? { ...page, data: page.data.filter((r) => r.status === status) }
          : page;
      });
  },

  get: (id: string, signal?: AbortSignal) =>
    api
      .get<V2ProfileRequest>(tenant(`/me/profile-requests/${id}`), undefined, signal)
      .then(fromV2ProfileRequest),
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
 * `profile-request`, `group-icon`) against the bundle's enum (`student_photo |
 * guardian_id | receipt | branding | general | group-icon | org-logo`). The
 * handoff's prose doc (`uploads.md`) uses a third vocabulary; the bundle wins,
 * and only `group-icon` appears in both, so the two document uploads go as
 * `general`. **Confirm against a live backend** before anything audits by
 * upload purpose.
 */
function v2UploadPurpose(purpose?: 'permission' | 'profile-request' | 'group-icon') {
  return purpose === 'group-icon' ? 'group-icon' : 'general';
}

export const uploads = {
  /**
   * PDF/JPEG/PNG/HEIC/WEBP, max 5 MB. Send the returned `fileId` with
   * whatever needs it — `supportingDocKeys`, `attachmentKey`, `iconKey`.
   *
   * v2 gates the file behind a quarantine scan (`scanState`); a `pending`
   * result cannot be attached yet — see `canAttachUpload` in
   * `lib/attachments.ts`, which also polls `getScan` so no screen has to.
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
        {},
        undefined,
        { idempotencyKey: true }
      )
      .then((res) => ({ key: fileId, url: res.downloadUrl })),
};

/* -------------------------------------------------------- 9. Notifications */

type V2Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string> | null;
  readAt: string | null;
  createdAt: string;
  version: string;
};

function fromV2Notification(n: V2Notification): AppNotification {
  return {
    ...n,
    tenantId: requireTenantId(),
    siteId: n.data?.siteId ?? null,
    userId: '',
    permissionId: n.data?.permissionId ?? null,
  };
}

export const notifications = {
  list: (query: PageQuery & { unreadOnly?: boolean } = {}, signal?: AbortSignal) =>
    api
      .get<V2List<V2Notification>>(tenant('/me/notifications'), query as Query, signal)
      .then((res) => toPage(res, fromV2Notification)),

  /** The header badge. */
  unreadCount: (signal?: AbortSignal) =>
    api.get<{ unreadCount: number }>(tenant('/me/notifications/unread-count'), undefined, signal),

  markRead: (id: string) =>
    api
      .patch<V2Notification>(tenant(`/me/notifications/${id}/read`), undefined, {
        idempotencyKey: true,
      })
      .then(() => ({ count: 1 })),

  markAllRead: () =>
    api
      .patch<{ changed: number }>(tenant('/me/notifications/read-all'), undefined, {
        idempotencyKey: true,
      })
      .then((res) => ({ count: res?.changed ?? 0 })),

  preferences: (signal?: AbortSignal) =>
    api.get<NotificationPreferences>(tenant('/me/notification-preferences'), undefined, signal),

  /**
   * `push: false` stops server-side delivery; the inbox still fills. v2's PUT
   * is a full replace (all three flags required), so a partial change is
   * merged onto the current preferences first.
   */
  setPreferences: async (body: Partial<Pick<NotificationPreferences, 'push' | 'email' | 'sms'>>) => {
    const current = await notifications.preferences();
    return api.put<NotificationPreferences>(
      tenant('/me/notification-preferences'),
      {
        push: body.push ?? current.push,
        email: body.email ?? current.email,
        sms: body.sms ?? current.sms,
      },
      { idempotencyKey: true }
    );
  },
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
