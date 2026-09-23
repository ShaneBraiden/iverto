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
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { idempotencyKey } from '@/lib/api/client';
import { push as pushApi } from '@/lib/api/endpoints';
import { eventKey, needsRewrite, notificationCopy } from '@/lib/notificationText';
import type { Shell } from '@/types';

/** Kept so sign-out can unregister the exact token it registered. */
let currentToken: string | null = null;
/**
 * The server-assigned id from the last successful `POST /me/push-devices` —
 * v2 unregisters by this, not by the provider token, which is write-only and
 * never echoed back. In memory only, like `currentToken`: this app
 * re-registers on every launch, so a fresh one is always obtained before it's
 * ever needed.
 */
let currentDeviceId: string | null = null;

export function currentPushToken() {
  return currentToken;
}

const INSTALLATION_ID_KEY = 'iverto.installationId.v1';

/**
 * A stable id for this app install, sent as `installationId` on every v2
 * device registration so the server can tell "the same phone, a rotated FCM
 * token" apart from "a second phone". Generated once and kept in SecureStore
 * — it isn't a secret, but every other per-device value already lives there,
 * and this avoids adding a storage dependency for one string.
 */
async function installationId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
    if (existing) return existing;
  } catch {
    /* Fall through to a fresh, unpersisted id for this launch. */
  }
  const fresh = idempotencyKey();
  try {
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, fresh);
  } catch {
    /* No keystore available — the id just won't survive a relaunch. */
  }
  return fresh;
}

/** BCP-47 tag for `locale` on registration. Hermes ships a usable `Intl`; `en-US` otherwise. */
function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
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
    const device = await pushApi.register({
      installationId: await installationId(),
      platform: 'android',
      token,
      appVersion: Constants.expoConfig?.version ?? '0.0.0',
      locale: deviceLocale(),
    });
    currentDeviceId = device.deviceId;
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
  currentDeviceId = null;
}

/**
 * Unregister explicitly. Only needed when logout could not carry the token itself; call it
 * before clearing the session, while the access token is still valid.
 */
export async function unregisterForPush() {
  const deviceId = currentDeviceId;
  currentToken = null;
  currentDeviceId = null;
  if (!deviceId) return;
  try {
    await pushApi.unregister(deviceId);
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
    void (async () => {
      const device = await pushApi.register({
        installationId: await installationId(),
        platform: 'android',
        token,
        appVersion: Constants.expoConfig?.version ?? '0.0.0',
        locale: deviceLocale(),
      });
      currentDeviceId = device.deviceId;
    })()
      .then(() => note('registered', token))
      .catch((err) => note('register-failed', err));
  });
}

/* ------------------------------------------------- Foreground presentation */

/**
 * Set on a notification this app posted itself, so the handler below can tell
 * one of its own rewrites from an incoming push and not loop on it.
 */
const REWRITTEN = 'ivertoRewritten';

/**
 * What to do with a notification that arrives while the app is running.
 *
 * The socket (lib/live.ts) already updates the screen the user is looking at,
 * so a banner on top of it is redundant for the current screen — but a push
 * about a *different* pass still deserves one. Showing it is the lesser evil;
 * suppressing per-screen is not worth the bookkeeping.
 *
 * The badge stays off on purpose: AppContext already increments `unread` from
 * the socket's `notification:new`, and counting it twice is worse than not
 * counting it here.
 *
 * The one case that is not shown as it arrived is a push whose title is the
 * raw event code — `parent_decided` and friends. That one is swallowed and
 * immediately re-posted with copy a person can read. Only the tray text is
 * rebuilt; `data` is carried over verbatim, so the deep link on tap is the one
 * the server sent.
 *
 * This cannot reach a push that lands while the app is backgrounded or killed
 * — Android draws those itself, from the `notification` block, before any JS
 * runs. Fixing those means fixing the sender: see
 * `server-changes-notifications.md`.
 */
export async function foregroundBehaviour(
  notification: Notifications.Notification
): Promise<Notifications.NotificationBehavior> {
  /* `shouldShowAlert` was split in expo-notifications 0.31 into the banner (the
     heads-up card) and the list (the shade). Both are wanted here — the old
     single flag meant exactly this. */
  const show: Notifications.NotificationBehavior = {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  };

  const content = notification.request.content;
  const data = (content.data ?? {}) as Record<string, unknown>;
  const payload = { title: content.title, body: content.body, data };

  /* Our own repost coming back around, or a push the server wrote properly. */
  if (data[REWRITTEN] === '1') return show;
  if (!needsRewrite(payload)) return show;

  /* No event code anywhere in it, so there is nothing to name it with — a
     rewrite could only produce a banner reading "Notification". Leave it
     exactly as it arrived; this is the path a bare data message takes. */
  if (!eventKey(payload)) return show;

  const copy = notificationCopy(payload);

  /* Fire-and-forget, because the handler has to answer this frame — the banner
     for the original is being decided on the strength of what we return. */
  void Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.body || undefined,
      data: { ...data, [REWRITTEN]: '1' },
    },
    /* Immediate delivery, on the channel `ensureChannel` created — an unknown
       channel id on Android 8+ means the notification is dropped entirely. */
    trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
  }).catch((err) => console.warn(`[push] rewrite-failed: ${String(err)}`));

  return {
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  };
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
