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
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  /** What this device calls itself — group branding, or the stock name. */
  appName: string;
  /** True once the server says this device carries a group's own branding. */
  branded: boolean;
  /** Read URL for the admin's uploaded icon, when there is one and it resolved. */
  brandIconUri: string | null;
  unread: number;
  refreshUnread: () => void;
  /** Drop the badge to zero without waiting for the server to answer. */
  clearUnread: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const signedIn = !!user;

  const config = useQuery((signal) => configApi.get(signal), [signedIn], { enabled: signedIn });
  const branding = useQuery((signal) => meApi.branding(signal), [signedIn], { enabled: signedIn });
  const unreadQuery = useQuery(
    (signal) => notificationApi.unreadCount(signal),
    [signedIn],
    { enabled: signedIn }
  );

  /* Held locally so the socket and an optimistic "mark all read" can move the
     badge without a round trip. */
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (unreadQuery.data) setUnread(unreadQuery.data.unreadCount);
  }, [unreadQuery.data]);

  /* Resolved once for the whole session rather than by each screen that draws
     the mark. A failure needs no handling here — `<AppIcon>` falls back to the
     gradient, which is the same colours the admin picked. */
  const brandIconUri = useSignedUrl(branding.data?.iconKey, branding.data?.iconUrl);

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
    let unsubscribe: (() => void) | undefined;
    const tokenSub = watchTokenRefresh();

    void loadSession().then((stored) => {
      if (!alive || !stored?.accessToken) return;
      connectLive(stored.accessToken);
      unsubscribe = onLive('notification:new', () => setUnread((n) => n + 1));
    });

    return () => {
      alive = false;
      unsubscribe?.();
      tokenSub.remove();
      disconnectLive();
    };
  }, [signedIn]);

  const value = useMemo<AppContextValue>(() => {
    const branded = branding.data?.isDefault === false;
    return {
      config: config.data,
      branding: branding.data,
      appName: branded ? branding.data!.appName : DEFAULT_APP_NAME,
      branded,
      brandIconUri,
      unread,
      refreshUnread: unreadQuery.refetch,
      clearUnread: () => setUnread(0),
    };
  }, [config.data, branding.data, brandIconUri, unread, unreadQuery.refetch]);

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
