/**
 * FCM device tokens, and the map from a push's `uri` to a screen.
 *
 * The backend sends through Firebase Admin directly rather than Expo's push service, so
 * this registers the *device* token (`getDevicePushTokenAsync`) and never an Expo push
 * token. Getting that wrong is silent: registration still returns 201 and no push ever
 * arrives.
 *
 * Android only for now — on iOS `getDevicePushTokenAsync` hands back an APNs token, which
 * Firebase Admin rejects as an FCM token. See Dev/fcm-integration.md §2.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { push as pushApi } from '@/lib/api/endpoints';
import type { Shell } from '@/types';

/** Kept so sign-out can unregister the exact token it registered. */
let currentToken: string | null = null;

export function currentPushToken() {
  return currentToken;
}

/**
 * Android 8+ ignores importance set at notify time, so the channel has to exist before the
 * first message or every push arrives silently with no heads-up banner. `defaultChannel` in
 * the app.json plugin config points at this id, and the server's `channel_id` must match.
 */
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Outpass alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Asks for permission, gets the FCM token, and registers it against the signed-in account.
 *
 * Returns null whenever push simply isn't available — a denied prompt, an emulator without
 * Play Services, iOS — and never throws for those. Push is a degradation, not a failure:
 * the inbox and the socket still work, so callers treat null as "no push on this device".
 */
export async function registerForPush(): Promise<string | null> {
  /* Emulators without Google Play Services and every simulator have no FCM at all. */
  if (!Device.isDevice) return null;

  /* Remove this guard when the backend accepts APNs tokens, or when RNFirebase is added
     for iOS. See Dev/fcm-integration.md §2. */
  if (Platform.OS !== 'android') return null;

  try {
    await ensureChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      /* Android 13+ POST_NOTIFICATIONS. On 12 and below this resolves granted at once. */
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    const { data } = await Notifications.getDevicePushTokenAsync();
    const token = String(data);
    await pushApi.register('android', token);
    currentToken = token;
    return token;
  } catch {
    /* A missing google-services.json, a package-name mismatch, or no network. */
    return null;
  }
}

/**
 * Drop the token locally without telling the server.
 *
 * For when `POST /auth/logout` was given the token and has already disabled it — the
 * explicit DELETE would then be a second round trip against a session that no longer
 * exists, which comes back 401 and trips the global session-expired handler.
 */
export function forgetPushToken() {
  currentToken = null;
}

/**
 * Unregister explicitly. Only needed when logout could not carry the token itself; call it
 * before clearing the session, while the access token is still valid.
 */
export async function unregisterForPush() {
  const token = currentToken;
  currentToken = null;
  if (!token) return;
  try {
    await pushApi.unregister(token);
  } catch {
    /* Signing out locally matters more than the server acknowledging it. */
  }
}

/**
 * FCM rotates tokens (app restore, data clear, ~270 days idle). A rotated token that is
 * never re-registered means the device goes quiet with no visible error.
 */
export function watchTokenRefresh() {
  return Notifications.addPushTokenListener(({ data }) => {
    if (Platform.OS !== 'android') return;
    const token = String(data);
    if (token === currentToken) return;
    currentToken = token;
    void pushApi.register('android', token).catch(() => {});
  });
}

/* ------------------------------------------------------------- Deep linking */

/**
 * Server `uri` → app route. The two are deliberately not the same vocabulary: the API calls
 * the record a "permission", the app screens call it an outpass, and the API pluralises
 * profile requests where the screen does not.
 *
 * `shell` is required for the permission case because `app/outpass/[id].tsx` picks its
 * endpoint from `?role=` and falls back to `student` when it is absent — which 403s for the
 * guardian who was the whole reason the push was sent. Pass `shellFor(user.role)`.
 *
 * Anything unrecognised returns null and the tap just opens the app.
 */
export function routeForUri(uri: string | undefined, shell: Shell): string | null {
  if (!uri) return null;
  const match = /^iverto:\/\/(.+)$/i.exec(uri.trim());
  if (!match) return null;
  const path = match[1].replace(/^\/+|\/+$/g, '');

  const permission = /^permissions\/(.+)$/.exec(path);
  if (permission) return `/outpass/${permission[1]}?role=${shell}`;
  if (path === 'notifications') return '/notifications';
  if (path === 'profile-requests') return '/profile-request';
  return null;
}

/** The `uri` a push carries, if it carries one. Every FCM `data` value is a string. */
export function uriFromNotification(notification: Notifications.Notification) {
  const uri = notification.request.content.data?.uri;
  return typeof uri === 'string' ? uri : undefined;
}
