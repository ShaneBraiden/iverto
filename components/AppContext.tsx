/**
 * Everything the shell needs that is not tied to one role: the tenant's app
 * config, this device's branding, and the notification badge.
 *
 * All three are per-session rather than per-screen, so they are fetched once
 * here — mounted directly under `<AuthProvider>` in the root layout — instead
 * of by each dashboard.
 *
 * The unread count is kept live two ways: the socket bumps it the moment a
 * notification arrives while the app is open, and every screen that opens the
 * inbox calls `refreshUnread` on the way out.
 *
 * Branding is kept live the same two ways, and needs both. A group rebrand
 * arrives on the socket as `branding:updated` and is applied as sent. An
 * organisation rebrand emits nothing — it touches every member of the tenant,
 * so the server will not fan it out — which leaves the resume re-fetch below
 * as the only way it lands short of a cold start.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { appConfig as configApi, me as meApi, notifications as notificationApi } from '@/lib/api/endpoints';
import { useQuery } from '@/lib/api/useQuery';
import { connectLive, disconnectLive, onLive } from '@/lib/live';
import { loadSession } from '@/lib/session';
import { watchTokenRefresh } from '@/lib/push';
import { useAuth } from '@/lib/auth';
import { useSignedUrl } from '@/lib/useSignedUrl';
import { DEFAULT_APP_NAME } from '@/constants/config';
import type { AppConfig, Branding } from '@/types';

type AppContextValue = {
  config: AppConfig | undefined;
  branding: Branding | undefined;
  /** What this device calls itself — the mark it was sent, or the stock name. */
  appName: string;
  /**
   * True once the server says this device carries a mark of its own — a
   * group's or the university's.
   *
   * It reads `isDefault`, and nothing else may stand in for it. Branding
   * resolves group → organisation → stock, and the organisation's payload
   * arrives with a null `groupId` exactly like the stock one does, so keying
   * off `groupId` would show the built-in lockup to every university that has
   * branded itself but not this member's cohort — wardens and admins included,
   * since they sit in no group at all.
   */
  branded: boolean;
  /** Read URL for the admin's uploaded icon, when there is one and it resolved. */
  brandIconUri: string | null;
  unread: number;
  refreshUnread: () => void;
  /** Drop the badge to zero without waiting for the server to answer. */
  clearUnread: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

/** A resume re-fetches branding only if the copy in hand is at least this old. */
const BRANDING_RESUME_MS = 5 * 60_000;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const signedIn = !!user;

  const config = useQuery((signal) => configApi.get(signal), [signedIn], { enabled: signedIn });
  const brandingQuery = useQuery((signal) => meApi.branding(signal), [signedIn], {
    enabled: signedIn,
  });
  const unreadQuery = useQuery(
    (signal) => notificationApi.unreadCount(signal),
    [signedIn],
    { enabled: signedIn }
  );

  /* Held locally so `branding:updated` can be applied without a round trip —
     the socket sends the same object `GET /me/branding` returns. Cleared on
     sign-out so the next account never renders the previous one's mark while
     its own call is still in flight. */
  const [branding, setBranding] = useState<Branding | undefined>(undefined);
  useEffect(() => {
    if (brandingQuery.data) setBranding(brandingQuery.data);
  }, [brandingQuery.data]);
  useEffect(() => {
    if (!signedIn) setBranding(undefined);
  }, [signedIn]);

  /* "After login and on resume", which is what the endpoint asks for — and the
     only way an organisation-level rebrand reaches an app that never closes.
     Throttled: flicking between apps fired one `/me/branding` per switch, and
     an organisation rebrand landing a few minutes late costs nothing (a group
     rebrand still arrives instantly on the socket). */
  const refetchBranding = brandingQuery.refetch;
  const brandingFetchedAt = useRef(0);
  useEffect(() => {
    if (brandingQuery.data) brandingFetchedAt.current = Date.now();
  }, [brandingQuery.data]);
  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - brandingFetchedAt.current >= BRANDING_RESUME_MS) {
        refetchBranding();
      }
    });
    return () => sub.remove();
  }, [signedIn, refetchBranding]);

  /* Held locally so the socket and an optimistic "mark all read" can move the
     badge without a round trip. */
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (unreadQuery.data) setUnread(unreadQuery.data.unreadCount);
  }, [unreadQuery.data]);

  /* Resolved once for the whole session rather than by each screen that draws
     the mark. `iconUrl` comes down beside the key and is what gets used —
     the `/uploads/signed-url` round trip is only the fallback for a payload
     that carries no URL. A failure needs no handling here: `<AppIcon>` falls
     back to the gradient, which is the same colours the admin picked. */
  const brandIconUri = useSignedUrl(branding?.iconKey, branding?.iconUrl);

  /* One socket per session. The token is read back from the keystore rather
     than threaded through context, so this stays independent of sign-in order.
     The FCM token listener has the same lifetime: FCM rotates tokens on app
     restore, a data clear, or ~270 days idle, and a rotated token nobody
     re-registers means the device goes quiet with no visible error. */
  useEffect(() => {
    if (!signedIn) {
      disconnectLive();
      return;
    }

    let alive = true;
    const tokenSub = watchTokenRefresh();
    /* Two subscriptions on the one socket, torn down together. */
    const off: (() => void)[] = [];

    void loadSession().then((stored) => {
      if (!alive || !stored?.accessToken) return;
      connectLive(stored.accessToken);
      off.push(onLive('notification:new', () => setUnread((n) => n + 1)));
      /* Applied as sent — this is the same object the endpoint returns, and
         for a member the admin just dropped from a group it is the fallback
         the server resolved for them, not necessarily the stock lockup. */
      off.push(onLive('branding:updated', (next) => setBranding(next)));
    });

    return () => {
      alive = false;
      off.forEach((fn) => fn());
      tokenSub.remove();
      disconnectLive();
    };
  }, [signedIn]);

  const value = useMemo<AppContextValue>(() => {
    /* `isDefault` is the whole test — see `branded` on AppContextValue. */
    const branded = branding?.isDefault === false;
    return {
      config: config.data,
      branding,
      appName: branded ? branding!.appName : DEFAULT_APP_NAME,
      branded,
      brandIconUri,
      unread,
      refreshUnread: unreadQuery.refetch,
      clearUnread: () => setUnread(0),
    };
  }, [config.data, branding, brandIconUri, unread, unreadQuery.refetch]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside an <AppProvider>');
  return ctx;
}

/**
 * Re-runs a callback whenever a permission changes server-side.
 *
 * The handler is held in a ref so the subscription is set up once and survives
 * re-renders — a screen can pass an inline arrow function without tearing the
 * socket listener down and rebuilding it on every render.
 */
export function useLivePermissions(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onLive('permission:updated', () => ref.current()), []);
}
