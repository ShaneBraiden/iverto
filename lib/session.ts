/**
 * Where the signed-in session lives between app launches.
 *
 * `expo-secure-store` puts it in the Android keystore / iOS keychain rather
 * than in plain app storage, which matters because the access token is a
 * bearer credential for the whole campus API.
 *
 * It is written as **two** entries, not one. SecureStore caps a single value
 * at 2048 bytes on Android, and a Supabase JWT plus a refresh token plus the
 * user record can get close enough to that ceiling to be worth not betting on.
 * Splitting them keeps each well clear, and means a profile that fails to
 * store never costs us the tokens.
 *
 * Only what is needed to restore a session is kept. The profile itself is
 * always refetched from `GET /me`, never trusted from disk.
 */
import * as SecureStore from 'expo-secure-store';
import type { AuthUser, Linkage, Session } from '@/types';

/**
 * `.v2` since sign-in moved to Hostel v2. A session saved by an older build
 * holds v1 tokens the v2 server has never issued; under the old keys it would
 * be restored, fail its first call, and greet the user with "your session
 * ended". New keys mean an upgrade simply starts at the login screen, and the
 * old entries are deleted on the next `clearSession`.
 */
const TOKEN_KEY = 'iverto.tokens.v2';
const PROFILE_KEY = 'iverto.profile.v2';
const LEGACY_KEYS = ['iverto.tokens.v1', 'iverto.profile.v1'];
/**
 * The identifier of the last account to sign in on this device. Deliberately
 * *not* cleared on sign-out: it is how the login screen can offer the email
 * back after a session expires instead of making the user type it again. No
 * credential is kept with it.
 */
const LAST_IDENTIFIER_KEY = 'iverto.lastIdentifier.v1';
/** The hostel code last signed in with — kept for the same reason, and not a secret. */
const LAST_TENANT_CODE_KEY = 'iverto.lastTenantCode.v1';

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. Absent on sessions stored by an older build. */
  expiresAt?: number;
};
type StoredProfile = { user: AuthUser; linkage: Linkage };

export type StoredSession = StoredTokens & StoredProfile;

async function write(key: string, value: unknown) {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
    return true;
  } catch {
    /* No keystore, or over the size limit. An in-memory session still works
       for this launch — the user just signs in again next time. */
    return false;
  }
}

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session) {
  await write(TOKEN_KEY, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: expiryFrom(session.expiresIn),
  } satisfies StoredTokens);

  await write(PROFILE_KEY, {
    user: session.user,
    linkage: session.linkage,
  } satisfies StoredProfile);
}

/** `expiresIn` is seconds from now; store the instant so a relaunch can read it. */
function expiryFrom(expiresIn: number | undefined) {
  return expiresIn && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined;
}

/**
 * Replaces the tokens after a refresh, leaving the profile alone.
 *
 * A server that rotates refresh tokens sends a new one; a server that does not
 * omits it, and the stored one is kept rather than being overwritten with
 * `undefined` — which would leave the next launch unable to refresh at all.
 */
export async function updateStoredTokens(next: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}) {
  const current = await read<StoredTokens>(TOKEN_KEY);
  await write(TOKEN_KEY, {
    accessToken: next.accessToken,
    refreshToken: next.refreshToken ?? current?.refreshToken ?? '',
    expiresAt: expiryFrom(next.expiresIn),
  } satisfies StoredTokens);
}

/* --------------------------------------------------------- Last identifier */

export async function rememberIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  if (trimmed) await write(LAST_IDENTIFIER_KEY, trimmed);
}

export async function lastIdentifier() {
  return read<string>(LAST_IDENTIFIER_KEY);
}

export async function rememberTenantCode(code: string) {
  const trimmed = code.trim();
  if (trimmed) await write(LAST_TENANT_CODE_KEY, trimmed);
}

export async function lastTenantCode() {
  return read<string>(LAST_TENANT_CODE_KEY);
}

/**
 * Patches the stored user in place, leaving the tokens alone.
 *
 * Used when a flag on the account changes without a new session behind it —
 * `mustChangePassword` clearing after a password change is the case that
 * matters: miss this and the next launch restores the old flag and sends the
 * user back to a screen they have already finished with.
 */
export async function updateStoredUser(patch: Partial<AuthUser>) {
  const profile = await read<StoredProfile>(PROFILE_KEY);
  if (!profile?.user) return;
  await write(PROFILE_KEY, {
    ...profile,
    user: { ...profile.user, ...patch },
  } satisfies StoredProfile);
}

/**
 * Both halves have to be present to restore. A token with no profile cannot
 * route anywhere, so it is treated as no session at all.
 */
export async function loadSession(): Promise<StoredSession | null> {
  const [tokens, profile] = await Promise.all([
    read<StoredTokens>(TOKEN_KEY),
    read<StoredProfile>(PROFILE_KEY),
  ]);

  if (!tokens?.accessToken || !profile?.user) return null;
  return { ...tokens, ...profile };
}

export async function clearSession() {
  await Promise.all(
    [TOKEN_KEY, PROFILE_KEY, ...LEGACY_KEYS].map(async (key) => {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        /* Nothing to clear, or no keystore. Signing out locally still works. */
      }
    })
  );
}
