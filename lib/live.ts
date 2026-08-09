/**
 * Live updates while the app is in the foreground.
 *
 * Push covers a backgrounded app; the socket covers the case where the user is
 * looking at the screen when something changes — a guardian approving while the
 * student watches the detail page, say.
 *
 * The namespace and the handshake path are two different things and both are
 * required, per the API doc:
 *
 *     io('https://api.iverto.ai/mobile', { path: '/hostel/socket.io' })
 *          ^ namespace on the origin        ^ the deployment's prefix
 *
 * Both are derived from `API_URL`, which is the one place `/hostel` is allowed
 * to appear. That makes local dev fall out for free: a base of
 * `http://192.168.1.10:3000` has no prefix to carry, so the path comes out as
 * plain `/socket.io` — exactly what a backend run without `WS_PATH` serves.
 *
 * Everything here degrades silently: if the socket cannot connect, the app
 * keeps working on focus-refetch alone.
 */
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/lib/api/client';
import type { AppNotification, Permission } from '@/types';

type Events = {
  'notification:new': (payload: AppNotification) => void;
  'permission:updated': (payload: Permission) => void;
};

let socket: Socket | null = null;

/**
 * `https://api.iverto.ai/hostel` → namespace URL + handshake path.
 *
 * Split with a regex rather than `new URL()`: React Native's URL class has no
 * `origin` or `pathname` getters, so both would come back undefined.
 */
function endpoints() {
  const match = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(API_URL);
  if (!match) return null;

  const origin = match[1];
  const base = (match[2] ?? '').replace(/\/+$/, '');
  return {
    namespace: `${origin}/mobile`,
    path: `${base}/socket.io`,
  };
}

/**
 * Opens the connection for a session. Safe to call again with the same token —
 * the existing socket is reused rather than stacked.
 */
export function connectLive(token: string) {
  if (!API_URL || !token) return null;
  if (socket?.connected) return socket;

  const target = endpoints();
  if (!target) return null;

  socket?.disconnect();
  socket = io(target.namespace, {
    path: target.path,
    auth: { token },
    transports: ['websocket'],
    /* Bounded backoff: a rejected handshake (bad token) must not turn into a
       reconnect storm against the API. */
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
    autoConnect: true,
  });

  return socket;
}

export function disconnectLive() {
  socket?.disconnect();
  socket = null;
}

/**
 * Subscribes to one server event. Returns the unsubscribe function, so a
 * screen can wire it straight into a `useEffect` cleanup.
 */
export function onLive<E extends keyof Events>(event: E, handler: Events[E]) {
  socket?.on(event as string, handler as (...args: unknown[]) => void);
  return () => {
    socket?.off(event as string, handler as (...args: unknown[]) => void);
  };
}
