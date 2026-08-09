/**
 * The signed-in session, and the record behind it.
 *
 * Three things every screen reads from here:
 *   `user`    — id, role, tenant, sites. The role is the *server's*, never the
 *               one picked on the login screen.
 *   `linkage` — which Student / ParentContact the account is attached to.
 *               `linked: false` means onboarding has to run before any role
 *               screen will answer, so routing checks it before the role.
 *   `me`      — the role-aware profile from `GET /me`, refetched on launch.
 *
 * The session is restored from the keystore on launch, so a returning user
 * lands on their dashboard rather than on the login screen.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { router } from 'expo-router';
import {
  ApiError,
  setAuthToken,
  setTokenRefresher,
  setUnauthorizedHandler,
  type SessionEndReason,
} from '@/lib/api/client';
import { auth as authApi, me as meApi } from '@/lib/api/endpoints';
import {
  clearSession,
  loadSession,
  saveSession,
  updateStoredTokens,
  updateStoredUser,
} from '@/lib/session';
import type { AuthUser, Linkage, Me, Role, Session, Shell } from '@/types';

/**
 * Why the user is looking at the login screen.
 *
 * `signed-out` is the ordinary case and says nothing. The other two mean a
 * session the user already had was taken away underneath them, and the screen
 * says so — being silently returned to a blank login form with no explanation
 * is indistinguishable from the app having lost the tap.
 */
export type SessionEnd = { reason: SessionEndReason | 'signed-out'; at: number };

/** Wardens work the same queues as admins, so they share the admin shell. */
export function shellFor(role: Role | undefined): Shell {
  if (role === 'admin' || role === 'warden') return 'admin';
  if (role === 'parent') return 'parent';
  return 'student';
}

/**
 * Where an account belongs right now — a forced password change first, then
 * onboarding, then its shell.
 *
 * The password comes before onboarding on purpose: a provisioned account is
 * still on the default password the office handed out, and that credential is
 * shared knowledge until the user replaces it. Nothing else should happen on
 * it first.
 */
export function routeFor(user: AuthUser | null, linkage: Linkage | null) {
  if (!user) return '/';
  if (user.mustChangePassword) return '/change-password';
  if (linkage && !linkage.linked && (user.role === 'student' || user.role === 'parent')) {
    return `/onboarding?role=${user.role}`;
  }
  return `/${shellFor(user.role)}`;
}

type AuthContextValue = {
  user: AuthUser | null;
  linkage: Linkage | null;
  me: Me | null;
  /** Which tab shell this account uses. */
  shell: Shell;
  /** True while the keystore is being read on launch — hold routing until then. */
  restoring: boolean;
  /** True while `GET /me` is in flight. */
  loading: boolean;
  error: Error | null;
  /**
   * Set when a session ended without the user asking. The login screen reads
   * it to explain itself, and clears it once it has been shown.
   */
  sessionEnd: SessionEnd | null;
  clearSessionEnd: () => void;
  /** Stores the session, loads `/me`, and returns where to route next. */
  signIn: (session: Session) => Promise<string>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** Called after onboarding links the account, so routing stops sending it back. */
  markLinked: (patch?: Partial<Linkage>) => void;
  /**
   * Called once `POST /auth/password` succeeds. Clears the forced-change flag
   * and answers with wherever the account goes next.
   */
  passwordChanged: () => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [linkage, setLinkage] = useState<Linkage | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sessionEnd, setSessionEnd] = useState<SessionEnd | null>(null);

  /**
   * Raised whenever the session is torn down. `signIn` checks it to tell "the
   * server rejected the token I just got" apart from a clean sign-in, so it
   * cannot route into a shell that has no session behind it any more.
   */
  const clearedAt = useRef(0);

  const clear = useCallback(() => {
    clearedAt.current = Date.now();
    setAuthToken(null);
    setUser(null);
    setLinkage(null);
    setMe(null);
    void clearSession();
  }, []);

  /**
   * `POST /auth/refresh`, wired into the API client.
   *
   * Called on a 401 from any authenticated call. The tokens are read from the
   * keystore rather than from state so this stays correct no matter what the
   * React tree is doing at the time.
   */
  const refreshUnsupported = useRef(false);
  const refreshAccessToken = useCallback(async () => {
    if (refreshUnsupported.current) return null;

    const stored = await loadSession();
    if (!stored?.refreshToken) return null;

    try {
      const next = await authApi.refresh(stored.refreshToken);
      if (!next?.accessToken) return null;
      await updateStoredTokens(next);
      setAuthToken(next.accessToken);
      return next.accessToken;
    } catch (err) {
      /* The route is not in the published API yet. If this build is talking to
         a server without it, stop asking on every 401 — one failed probe is
         enough, and the session ends with a message instead. */
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 404 || status === 405 || status === 501) refreshUnsupported.current = true;
      return null;
    }
  }, []);

  useEffect(() => {
    setTokenRefresher(refreshAccessToken);
    return () => setTokenRefresher(null);
  }, [refreshAccessToken]);

  /* A 401 on an authenticated call, once refreshing has failed, drops the
     session and returns to login — carrying the reason, so the screen can say
     what happened rather than just reappearing. */
  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      clear();
      setSessionEnd({ reason, at: Date.now() });
      router.replace('/');
    });
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  /* Restore on launch. The stored profile is only used to route; `GET /me` is
     what actually fills the screens, and a token the server has since revoked
     fails there and drops back to login through the 401 handler. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await loadSession();
      if (!alive) return;

      if (stored) {
        setAuthToken(stored.accessToken);
        setUser(stored.user);
        setLinkage(stored.linkage);

        /* An access token lives an hour. Reopening the app the next morning
           would otherwise fire every dashboard call against a token that is
           already dead, take a 401 on each, and land the user on the login
           screen. Renew first when the stored expiry says it has lapsed. */
        if (stored.expiresAt && stored.expiresAt <= Date.now()) {
          await refreshAccessToken();
          if (!alive) return;
        }

        void meApi
          .get()
          .then((profile) => alive && setMe(profile))
          .catch(() => {
            /* 401 is handled globally; anything else leaves the cached user in
               place so the app still opens. */
          });
      }
      setRestoring(false);
    })();
    return () => {
      alive = false;
    };
    /* `refreshAccessToken` is stable, so this still runs exactly once. */
  }, [refreshAccessToken]);

  const refreshMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMe(await meApi.get());
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (session: Session) => {
    const startedAt = Date.now();
    setSessionEnd(null);

    /* Persist *before* publishing the session to React. Anything keyed on
       "signed in" — the socket in AppProvider reads the token back out of the
       keystore — can run as soon as the state lands, so writing afterwards
       races it and hands the socket a token that is not there yet. */
    await saveSession(session);

    setAuthToken(session.accessToken);
    setUser(session.user);
    setLinkage(session.linkage);

    setLoading(true);
    setError(null);
    try {
      setMe(await meApi.get());
    } catch (err) {
      /* The token is valid — an unlinked account is exactly the case where
         `/me` 404s, and routing already sends it to onboarding. */
      setError(err as Error);
    } finally {
      setLoading(false);
    }

    /* If `/me` came back 401, the global handler has already torn this session
       down. Routing on regardless would open a dashboard with no session
       behind it, every call on it would 401, and the user would be bounced
       back to login a beat later with nothing to explain it. Stay put and let
       the login screen report the failure instead. */
    if (clearedAt.current > startedAt) {
      throw new ApiError(
        401,
        'The server would not accept that sign-in. Try again, or ask the hostel office to check the account.',
        'UNAUTHORIZED'
      );
    }

    return routeFor(session.user, session.linkage);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* Signing out locally matters more than the server acknowledging it. */
    }
    clear();
    setSessionEnd({ reason: 'signed-out', at: Date.now() });
  }, [clear]);

  const passwordChanged = useCallback(async () => {
    if (!user) return '/';
    const updated = { ...user, mustChangePassword: false };
    /* Persist before publishing, for the same reason `signIn` does: a relaunch
       must not resurrect the flag the user just cleared. */
    await updateStoredUser({ mustChangePassword: false });
    setUser(updated);
    return routeFor(updated, linkage);
  }, [user, linkage]);

  const markLinked = useCallback((patch?: Partial<Linkage>) => {
    setLinkage((prev) => ({
      studentId: null,
      rollNumber: null,
      parentContactIds: [],
      childStudentIds: [],
      ...prev,
      ...patch,
      linked: true,
    }));
  }, []);

  const clearSessionEnd = useCallback(() => setSessionEnd(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      linkage,
      me,
      shell: shellFor(user?.role),
      restoring,
      loading,
      error,
      sessionEnd,
      clearSessionEnd,
      signIn,
      signOut,
      refreshMe,
      markLinked,
      passwordChanged,
    }),
    [
      user,
      linkage,
      me,
      restoring,
      loading,
      error,
      sessionEnd,
      clearSessionEnd,
      signIn,
      signOut,
      refreshMe,
      markLinked,
      passwordChanged,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an <AuthProvider>');
  return ctx;
}

/* ------------------------------------------------------------ Display names */

/** The name to show for the signed-in account, whatever role it is. */
export function displayName(user: AuthUser | null, me: Me | null) {
  return me?.name ?? me?.profile?.displayName ?? user?.displayName ?? '—';
}
