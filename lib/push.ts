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
 * Why the last `registerForPush()` gave up, or 'registered' if it did not.
 *
 * Every failure path returns the same `null`, so without this a device that never gets a
 * push is indistinguishable from one that was never asked. Read it from a screen, or watch
 * for the tag below in `adb logcat -s ReactNativeJS`.
 */
export type PushStatus =
  | 'registered'
  | 'not-a-device'
  | 'ios-unsupported'
  | 'permission-denied'
  | 'no-token'
  | 'register-failed';

let lastStatus: PushStatus | null = null;
let lastDetail: string | null = null;

export function pushStatus() {
  return { status: lastStatus, detail: lastDetail };
}

/* console.warn survives release builds — babel.config.js adds no transform-remove-console,
   and the `-assumenosideeffects` rule in proguard-rules.pro only strips android.util.Log
   from Java, not Hermes' console bridge. So this is readable on the installed APK. */
function note(status: PushStatus, detail?: unknown) {
  lastStatus = status;
  lastDetail = detail === undefined ? null : String(detail);
  console.warn(`[push] ${status}${lastDetail ? `: ${lastDetail}` : ''}`);
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
  if (!Device.isDevice) {
    note('not-a-device');
    return null;
  }

  /* Remove this guard when the backend accepts APNs tokens, or when RNFirebase is added
     for iOS. See Dev/fcm-integration.md §2. */
  if (Platform.OS !== 'android') {
    note('ios-unsupported');
    return null;
  }

  /* Guarded because every caller is `void registerForPush()` — this function is documented
     never to throw, and an unhandled rejection here would take out the sign-in path. */
  try {
    await ensureChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      /* Android 13+ POST_NOTIFICATIONS. On 12 and below this resolves granted at once. */
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      note('permission-denied', status);
      return null;
    }
  } catch (err) {
    note('permission-denied', err);
    return null;
  }

  /* Split from the register call below on purpose: "Firebase never gave us a token" and
     "the server refused the token we had" are different bugs with different owners, and
     one shared catch reported them as the same silence. */
  let token: string;
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    token = String(data);
  } catch (err) {
    /* A missing google-services.json, a package-name mismatch, or no Play Services. */
    note('no-token', err);
    return null;
  }

  try {
    await pushApi.register('android', token);
  } catch (err) {
    note('register-failed', err);
    return null;
  }

  currentToken = token;
  /* The token itself, so a Firebase console test message can be aimed at this device
     without instrumenting the app further. */
  note('registered', token);
  return token;
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
    void pushApi
      .register('android', token)
      .then(() => note('registered', token))
      .catch((err) => note('register-failed', err));
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
