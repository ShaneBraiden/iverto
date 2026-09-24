/**
 * The one place the app talks to the network.
 *
 * Base URL comes from `EXPO_PUBLIC_API_URL` (a `.env` file, or the shell that
 * runs `expo start`), falling back to `extra.apiUrl` in `app.json` so a release
 * build has a host even with no env set. Every path in this app is written
 * from the version segment onwards (`/v1/mobile/...` or, for Hostel v2,
 * `/v2/tenants/{tenantId}/...`) exactly as the API doc writes it, and the base
 * carries the service prefix (`/hostel` for production, `/devhostel` for the
 * dev deployment):
 *
 *     https://api.iverto.ai/hostel  +  /v1/mobile/permissions
 *     https://api.iverto.ai/hostel  +  /v2/tenants/t_1/me/permissions
 *
 * so a path can be copied out of the doc and pasted into `endpoints.ts`
 * unchanged. See the `V1`/`V2` constants in `endpoints.ts` for which surface
 * each route is on — `Dev/mobile-v2-handoff/` has the v2 contract and the
 * migration matrix, and not everything has moved yet (see that module's own
 * header comment).
 */
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

const fromEnv = process.env.EXPO_PUBLIC_API_URL;
const fromConfig = extra?.apiUrl;

/** No trailing slash — paths always supply their own leading one. */
export const API_URL = (fromEnv ?? fromConfig ?? '').replace(/\/+$/, '');

/** The error codes the server documents. Screens branch on these, not on prose. */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_FAILED'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'
  | 'PERMISSION_ALREADY_DECIDED'
  /* Closing a pass that is not open — see Dev/pass-closure-and-late-alerts-api.md. */
  | 'PERMISSION_NOT_ACTIVE'
  | 'PROFILE_REQUEST_PENDING'
  | 'PROFILE_REQUEST_ALREADY_REVIEWED'
  /** `/hostel/v2/**` — a stale `If-Match` version lost a race with another writer. */
  | 'PERMISSION_VERSION_CONFLICT'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * How long to wait before giving up on a request.
 *
 * `fetch` has no timeout of its own: a connection that opens and then stalls —
 * a captive portal, a phone that has dropped to one bar mid-call — never
 * settles, so the promise never resolves and the screen sits on its skeleton
 * forever with no error and no way to retry. Thirty seconds is well past any
 * normal call on this API and short enough that the user has not yet decided
 * the app is broken.
 */
const TIMEOUT_MS = 30_000;

/** The envelope every `/v1/mobile/**` route returns on failure. */
type ErrorEnvelopeV1 = {
  statusCode?: number;
  error?: string;
  message?: string | string[];
  details?: Record<string, string[]>;
};

/**
 * RFC 7807 `ProblemDetails` — what every `/hostel/v2/**` route returns on
 * failure instead of the v1 envelope above. `code` replaces `error`, `detail`
 * replaces `message`, and `fieldErrors` replaces `details` (as an array of
 * `{field, message, code}` rather than a field → messages map).
 */
type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  instance?: string;
  requestId?: string;
  retryable?: boolean;
  /**
   * The bundle's `ProblemDetails` schema declares this as a field → messages
   * map; the migration matrix's prose describes an array of
   * `{ field, message, code }`. Both are accepted — see `readFieldErrors`.
   */
  fieldErrors?:
    | Record<string, string[]>
    | { field: string; message: string; code?: string }[];
};

type ErrorEnvelope = ErrorEnvelopeV1 & ProblemDetails;

/** Thrown for any non-2xx response, so screens can show the server's message. */
export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  /** Present only on validation failures — field name → messages. */
  details?: Record<string, string[]>;
  body: unknown;
  /** `/hostel/v2/**` only — the server's own correlation id for this failure. */
  requestId?: string;
  /** `/hostel/v2/**` only — whether the caller may safely retry as-is. */
  retryable?: boolean;

  constructor(
    status: number,
    message: string,
    code: ApiErrorCode = 'UNKNOWN',
    details?: Record<string, string[]>,
    body?: unknown,
    requestId?: string,
    retryable?: boolean
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
    this.requestId = requestId;
    this.retryable = retryable;
  }

  /** The first validation message for a field, if the server flagged one. */
  fieldError(field: string) {
    return this.details?.[field]?.[0];
  }
}

/* ------------------------------------------------------------------- Token */

let authToken: string | null = null;
let onUnauthorized: ((reason: SessionEndReason) => void) | null = null;
let refreshTokens: (() => Promise<string | null>) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

/** Why a signed-in session stopped being valid. Shown on the login screen. */
export type SessionEndReason = 'expired' | 'revoked';

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

/**
 * The signed-in account's tenant, for `/hostel/v2/tenants/{tenantId}/**`
 * paths. Set alongside the auth token (`lib/auth.tsx`) from `AuthUser.tenantId`
 * — v1 login already hands that back, so no separate tenant lookup is needed.
 */
let tenantId: string | null = null;

export function setTenantId(id: string | null) {
  tenantId = id;
}

export function getTenantId() {
  return tenantId;
}

/**
 * The signed-in account's role, for the few v2 reads that answer differently
 * per actor and have to be picked client-side (`/me` for a student is
 * `/me/student`; the profile-request whitelist is keyed by subject type).
 * Set alongside the tenant from `AuthUser.role`.
 */
let sessionRole: string | null = null;

export function setSessionRole(role: string | null) {
  sessionRole = role;
}

export function getSessionRole() {
  return sessionRole;
}

/** Throws rather than building a request against `/tenants/undefined/...`. */
export function requireTenantId(): string {
  if (!tenantId) {
    throw new ApiError(0, 'No tenant on the current session.', 'UNKNOWN');
  }
  return tenantId;
}

/**
 * Called when a request made *with* a token comes back 401 — the auth provider
 * uses it to drop the session.
 *
 * A 401 with no token attached is deliberately not routed here. `POST
 * /auth/login` answers 401 for bad credentials, and treating that as an expired
 * session meant a mistyped password tore down the session and replaced the
 * route with `/` — which is the login screen itself. The screen remounted, the
 * error state went with it, and the user was handed a blank form with no idea
 * what had gone wrong. A credential rejection is the caller's to display.
 */
export function setUnauthorizedHandler(handler: ((reason: SessionEndReason) => void) | null) {
  onUnauthorized = handler;
}

/**
 * Supplies a way to trade the refresh token for a new access token.
 *
 * Set by the auth provider. Returning a token means "retry the request";
 * returning null means the session is genuinely over.
 */
export function setTokenRefresher(refresher: (() => Promise<string | null>) | null) {
  refreshTokens = refresher;
  refreshInFlight = null;
}

/**
 * One refresh at a time. A dashboard fires four calls on mount, so an expired
 * token produces four simultaneous 401s — four independent refreshes would race
 * and leave three of them holding a token the server has already rotated away.
 */
function refreshOnce() {
  if (!refreshTokens) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/* ------------------------------------------------------------------ Request */

export type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * A UUIDv7 for the `Idempotency-Key` header. Every mutating `/hostel/v2/**`
 * operation declares `x-idempotency: uuidv7_header`, so a v4 key is not what
 * the contract asks for: v7 leads with a 48-bit millisecond timestamp, which is
 * what lets the server order and expire its idempotency records.
 *
 * The random tail is not cryptographically strong — nothing here needs that,
 * only unpredictable enough that two independent requests never collide.
 * Hermes has no built-in `crypto.randomUUID`, so this is rolled by hand.
 */
export function idempotencyKey(): string {
  const hex = Date.now().toString(16).padStart(12, '0').slice(-12);
  const rand = (n: number) =>
    Array.from({ length: n }, () => ((Math.random() * 16) | 0).toString(16)).join('');
  const variant = (8 + ((Math.random() * 4) | 0)).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7${rand(3)}-${variant}${rand(3)}-${rand(12)}`;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialised as JSON unless it is already a FormData. */
  body?: unknown;
  /** Appended as a query string; `undefined` / `null` / `''` entries are dropped. */
  query?: Query;
  signal?: AbortSignal;
  /** `text/csv` exports come back as a string rather than JSON. */
  accept?: string;
  /**
   * `/hostel/v2/**` mutations: a client-generated key so a retried request is
   * safe to send twice. Pass `true` to have one generated per call, a string
   * to reuse a specific key (a manual "retry with the same key" control), or
   * leave it unset on a v1 route, which ignores the header.
   */
  idempotencyKey?: boolean | string;
  /**
   * `/hostel/v2/**` mutations with optimistic concurrency: the resource
   * `version` this write is conditional on. Sent as `If-Match`; a stale value
   * comes back as a 409 `PERMISSION_VERSION_CONFLICT`.
   */
  ifMatch?: string;
  /**
   * Set internally when a request is replayed after a token refresh, so a
   * second 401 ends the session instead of refreshing round and round.
   */
  retried?: boolean;
  /**
   * Public route: send no bearer token, and let a 401 through untouched.
   *
   * Two reasons this exists. The §1 auth routes are public and their 401 means
   * "those credentials are wrong", which the calling screen displays. And the
   * refresh call itself must never re-enter the refresh machinery — it runs
   * *inside* it, so a 401 there would leave it waiting on the very promise it
   * is in the middle of resolving.
   */
  anonymous?: boolean;
};

/**
 * Built by hand rather than with `URLSearchParams`: React Native ships a
 * partial implementation whose `toString()` joins the pairs *without*
 * percent-encoding them. Search terms here are free text — a `q` containing a
 * space or an `&` would silently corrupt the query.
 */
function buildUrl(path: string, query?: Query) {
  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length ? `${url}?${pairs.join('&')}` : url;
}

/**
 * `/hostel/v2/**` sends `detail`; `/v1/mobile/**` sends `message`, which
 * NestJS validation pipes may send as an array — flattened to one line.
 */
function readMessage(payload: ErrorEnvelope | null, status: number) {
  if (typeof payload?.detail === 'string' && payload.detail) return payload.detail;
  const raw = payload?.message;
  if (Array.isArray(raw) && raw.length) return raw.join('\n');
  if (typeof raw === 'string' && raw) return raw;
  if (payload?.error) return payload.error;
  if (payload?.title) return payload.title;
  return `Request failed (${status})`;
}

/** `ProblemDetails.fieldErrors` → the v1 `details` shape (field → messages). */
function readFieldErrors(payload: ErrorEnvelope | null): Record<string, string[]> | undefined {
  if (payload?.details) return payload.details;
  const raw = payload?.fieldErrors;
  if (!raw || typeof raw !== 'object') return undefined;
  if (!Array.isArray(raw)) return raw;
  const out: Record<string, string[]> = {};
  for (const { field, message } of raw) {
    (out[field] ??= []).push(message);
  }
  return out;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, 'API URL is not configured. Set EXPO_PUBLIC_API_URL.', 'UNKNOWN');
  }

  const {
    method = 'GET',
    body,
    query,
    signal,
    accept = 'application/json',
    idempotencyKey: idemOption,
    ifMatch,
    retried,
    anonymous,
  } = options;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers: Record<string, string> = { Accept: accept };
  /* Leave Content-Type off a FormData body — the runtime has to set the
     multipart boundary itself, and overwriting it breaks the upload. */
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  /* Captured rather than read again below: by the time the response lands, a
     concurrent refresh may already have replaced the module-level token, and
     what matters is whether *this* request was authenticated. */
  const sentWithToken = anonymous ? null : authToken;
  if (sentWithToken) headers.Authorization = `Bearer ${sentWithToken}`;
  if (idemOption) headers['Idempotency-Key'] = idemOption === true ? idempotencyKey() : idemOption;
  if (ifMatch) headers['If-Match'] = ifMatch;

  /* One controller for two reasons to give up: the caller unmounting (its own
     `signal`) and the deadline below. `fetch` only takes one signal, so the
     caller's is chained onto ours rather than passed through. */
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  const relayAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener?.('abort', relayAbort);
  }
  const releaseAbort = () => {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', relayAbort);
  };

  let text: string;
  try {
    const response = await fetch(buildUrl(path, query), {
      method,
      headers,
      signal: controller.signal,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });

    /* Reading the body can stall on its own, so the deadline covers it too —
       it is only released once there is a complete response in hand. */
    text = await response.text();
    releaseAbort();

    if (!response.ok) throw toApiError(response.status, text);
    /* CSV exports and 204s are not JSON. */
    if (!text) return undefined as T;
    if (accept !== 'application/json') return text as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } catch (err) {
    releaseAbort();

    if (err instanceof ApiError) {
      /* A 401 on an authenticated call means the token stopped being good, not
         that the caller got something wrong — try to renew it once and replay,
         and only end the session if that fails. A 401 with no token attached is
         a credential rejection and belongs to whoever made the call. */
      if (err.status === 401 && sentWithToken) {
        if (!retried) {
          const fresh = await refreshOnce();
          if (fresh) return request<T>(path, { ...options, retried: true });
        }
        onUnauthorized?.(retried ? 'revoked' : 'expired');
      }
      throw err;
    }

    if (timedOut) {
      throw new ApiError(0, 'The server took too long to answer.', 'TIMEOUT');
    }
    /* The caller aborted — `useQuery` swallows this, and it must not be
       rewritten into a failure the screen would then display. */
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'NETWORK');
  }
}

/** Builds the typed error for a non-2xx response body. */
function toApiError(status: number, text: string) {
  let payload: ErrorEnvelope | null = null;
  try {
    payload = text ? (JSON.parse(text) as ErrorEnvelope) : null;
  } catch {
    /* Not JSON — a proxy error page, say. The status still tells the story. */
  }
  return new ApiError(
    status,
    readMessage(payload, status),
    ((payload?.code || payload?.error) as ApiErrorCode) ?? 'UNKNOWN',
    readFieldErrors(payload),
    payload,
    payload?.requestId,
    payload?.retryable
  );
}

/** Extra transport concerns a v2 mutation can opt into — see `RequestOptions`. */
type MutationOptions = { idempotencyKey?: boolean | string; ifMatch?: string };

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query, opts?: MutationOptions) =>
    request<T>(path, { method: 'POST', body, query, ...opts }),
  put: <T>(path: string, body?: unknown, opts?: MutationOptions) =>
    request<T>(path, { method: 'PUT', body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts?: MutationOptions) =>
    request<T>(path, { method: 'PATCH', body, ...opts }),
  del: <T>(path: string, body?: unknown, opts?: MutationOptions) =>
    request<T>(path, { method: 'DELETE', body, ...opts }),
  csv: (path: string, query?: Query) =>
    request<string>(path, { method: 'GET', query, accept: 'text/csv' }),
  /** For the public §1 auth routes — see `anonymous` in `RequestOptions`. */
  postAnon: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body, anonymous: true }),
};
