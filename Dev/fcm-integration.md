# FCM push integration

How to wire Firebase Cloud Messaging into the Iverto.ai app (Expo SDK 51, RN 0.74.5,
expo-router). Written against the contract the backend already implements — see
`mobile-api-documentation.md` §8 and the existing `push` block in `lib/api/endpoints.ts`.

Android package / iOS bundle id: **`com.iverto.ai`**.

---

## 1. What already exists

Do not rebuild these — the client and server halves are both in place:

| Piece | Where | Status |
|---|---|---|
| `POST /v1/mobile/push/token` | `lib/api/endpoints.ts` → `push.register(platform, token)` | ✅ implemented |
| `DELETE /v1/mobile/push/token` | `push.unregister(token)` | ✅ implemented |
| `POST /v1/mobile/auth/logout` with `{ pushToken }` | `auth.logout(pushToken?)` | ✅ implemented, **not yet called with a token** |
| Notification inbox + unread badge | `notifications.*`, `components/AppContext.tsx` | ✅ implemented |
| Foreground live updates | `lib/live.ts` (Socket.IO) | ✅ implemented |
| Server-side sender | backend `FIREBASE_SERVICE_ACCOUNT` env | ✅ implemented (logs instead of sends when unset) |

**What is missing is only the device side**: acquiring an FCM token, registering it,
and routing a notification tap.

### The one fact that decides the approach

The backend sends through **Firebase Admin directly** (`FIREBASE_SERVICE_ACCOUNT`), not
through Expo's push service. `mobile-api-documentation.md` calls the value a `"fcm-token"`
in both directions. So the app must hand the server a **native FCM device token**, never an
Expo push token (`ExponentPushToken[...]`). Getting this wrong is silent: registration
returns 201 and no push ever arrives.

---

## 2. Choosing the library

| | `expo-notifications` ✅ recommended | `@react-native-firebase/messaging` |
|---|---|---|
| FCM token on Android | `getDevicePushTokenAsync()` returns the raw FCM token | `messaging().getToken()` |
| Prebuild-safe | Yes — one config plugin entry | Needs `expo-build-properties` + Gradle work |
| Extra native weight | Minimal | Full Firebase SDK (~3–4 MB, hurts the <40 MB target in README) |
| iOS token | **APNs token, not FCM** — see below | True FCM token |

**Use `expo-notifications`.** README's "Customising the native project" section makes
`android/` disposable and config plugins the house style; `expo-notifications` fits that,
react-native-firebase does not.

### iOS caveat — read before shipping iOS

`getDevicePushTokenAsync()` returns an **APNs** token on iOS, not an FCM token. If the
backend feeds it to Firebase Admin as an FCM token, every iOS send fails with
`INVALID_ARGUMENT`. Three ways out, pick one before iOS work starts:

1. **Android-first (current reality)** — only register on Android, skip iOS. The repo is
   Android-only today: there is no `ios/` folder and README is entirely Android.
2. **Backend accepts APNs tokens** — server branches on the stored `platform` column and
   sends iOS via APNs directly. It already stores `platform`, so this is a server change only.
3. **Add `@react-native-firebase/messaging` for iOS only** — it exchanges the APNs token for
   an FCM token. Heaviest option; only worth it if the backend must stay FCM-only.

This doc implements **option 1** and flags the exact line to change for 2 or 3.

---

## 3. Firebase console setup

1. Firebase console → your project (or create **Iverto**) → **Add app → Android**.
2. **Android package name: `com.iverto.ai`** — must match `android.package` in `app.json`
   exactly, or FCM silently drops every message.
3. Skip the SHA-1 step (only needed for Google Sign-In / Dynamic Links, neither is used).
4. Download **`google-services.json`** → place at the **repo root**, next to `app.json`.
   Not inside `android/` — that folder is gitignored and `prebuild --clean` deletes it.
5. Console → **Project settings → Cloud Messaging** → confirm the **Firebase Cloud
   Messaging API (V1)** is enabled. The legacy server-key API was shut off in June 2024;
   the backend's `FIREBASE_SERVICE_ACCOUNT` path is already the V1 one.
6. For the backend: **Project settings → Service accounts → Generate new private key**.
   That JSON is what `FIREBASE_SERVICE_ACCOUNT` holds. **It is a real secret — never commit it.**

> `google-services.json` is *not* a secret (it ships inside every APK) so committing it at
> the repo root is fine and keeps `prebuild` and EAS builds working with no extra setup.
> If you'd rather not, make it an EAS file secret and switch `app.json` → `app.config.js`
> so `googleServicesFile` can read `process.env.GOOGLE_SERVICES_JSON`.

---

## 4. Dependencies

```bash
npx expo install expo-notifications expo-device
```

Let `expo install` pick the versions — it resolves the SDK 51-compatible pair
(`expo-notifications@~0.28.x`, `expo-device@~6.0.x`). Do not `npm install` these by hand.

---

## 5. `app.json` changes

Add `googleServicesFile` under `android`, and the `expo-notifications` plugin. Everything
here is prebuild-safe, which is the point.

```jsonc
{
  "expo": {
    "android": {
      "package": "com.iverto.ai",
      "googleServicesFile": "./google-services.json",
      // ...existing keys unchanged
    },
    "plugins": [
      "expo-router",
      ["expo-location", { /* ...unchanged... */ }],
      ["expo-notifications", {
        "icon": "./assets/notification-icon.png",
        "color": "#F3F3F3",
        "defaultChannel": "default"
      }]
    ]
  }
}
```

The notification icon must be a **white-on-transparent PNG** (96×96 or larger). Android
renders any coloured icon as a solid white square in the status bar. If you don't have one
yet, drop the `icon` key — Expo falls back to the app icon, which will look wrong but won't
break anything.

Then:

```bash
npx expo prebuild --platform android
```

Plain `prebuild`, **not `--clean`** — `--clean` throws away the APK-size configuration in
`android/app/build.gradle` and `android/gradle.properties` (README, "Keeping the size config
through a prebuild"). Plain prebuild adds the `google-services` Gradle plugin and the FCM
manifest entries while leaving your edits alone.

Verify it landed:

```bash
grep -r "google-services" android/build.gradle android/app/build.gradle
```

---

## 6. `lib/push.ts` — new file

```ts
/**
 * FCM device tokens.
 *
 * The backend sends through Firebase Admin directly, not Expo's push service, so this
 * registers the *device* token (`getDevicePushTokenAsync`) and never an Expo push token.
 *
 * Android only for now: on iOS `getDevicePushTokenAsync` hands back an APNs token, which
 * Firebase Admin rejects as an FCM token. See Dev/fcm-integration.md §2.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { push as pushApi } from '@/lib/api/endpoints';

/** Kept so sign-out can unregister the exact token it registered. */
let currentToken: string | null = null;

export function currentPushToken() {
  return currentToken;
}

/**
 * Android 8+ ignores importance set at notify time, so the channel has to exist before
 * the first message or every push arrives silently with no heads-up banner.
 * `defaultChannel` in the app.json plugin config points at this id.
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
 * Returns null whenever push simply isn't available — a denied prompt, an emulator without
 * Play Services, iOS — and never throws for those. Callers treat null as "no push here".
 */
export async function registerForPush(): Promise<string | null> {
  /* Emulators without Google Play Services and every simulator have no FCM at all. */
  if (!Device.isDevice) return null;

  /* Remove this guard when the backend accepts APNs tokens, or when RNFirebase is added
     for iOS. See Dev/fcm-integration.md §2. */
  if (Platform.OS !== 'android') return null;

  await ensureChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    /* Android 13+ POST_NOTIFICATIONS. On 12 and below this resolves granted immediately. */
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    const token = String(data);
    await pushApi.register('android', token);
    currentToken = token;
    return token;
  } catch {
    /* A missing google-services.json, a package-name mismatch, or no network. Push is a
       degradation, not a failure — the inbox and the socket still work. */
    return null;
  }
}

/** Call before clearing the session, while the access token is still valid. */
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
```

---

## 7. Deep-link routing — the URI/route mismatch

⚠️ **The server's `uri` values do not match this app's expo-router routes.** Two of the
three need translating, so a tap handler that calls `router.push(data.uri)` will land on a
404 screen for permissions and profile requests.

| Server sends (`data.uri`) | expo-router route | File |
|---|---|---|
| `iverto://permissions/<id>` | `/outpass/<id>?role=<shell>` | `app/outpass/[id].tsx` |
| `iverto://notifications` | `/notifications` | `app/notifications.tsx` ✅ direct |
| `iverto://profile-requests` | `/profile-request` | `app/profile-request.tsx` (singular) |

### The `role` param is not optional in practice

`app/outpass/[id].tsx` reads `?role=` and **silently defaults to `student`**:

```ts
const role: Role =
  roleParam === 'parent' ? 'parent' : roleParam === 'admin' ? 'admin' : 'student';
```

That role picks the endpoint — `permissions.get` vs `parent.permission` vs
`admin.permission`. So a guardian tapping a `PARENT_APPROVAL_REQUEST` push (the single most
important push in the app) would land on the student endpoint, get a 403/404, and see no
approve/reject buttons. Every in-app link already passes `?role=`; a deep link must too.

Use `shellFor(user.role)` from `lib/auth.tsx` — its three return values (`student` /
`parent` / `admin`, with wardens folded into `admin`) are exactly the values the screen
accepts.

Add to `lib/push.ts`:

```ts
import type { Shell } from '@/types';

/**
 * Server `uri` → app route. The two are deliberately not the same vocabulary: the API
 * calls the record a "permission", the app screens call it an outpass.
 *
 * `shell` is required for the permission case because the detail screen picks its endpoint
 * from `?role=` and falls back to `student` when it is absent — which 403s for the guardian
 * who was the whole reason the push was sent. Pass `shellFor(user.role)`.
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
```

`Shell` (`'student' | 'parent' | 'admin'`) comes from `types/index.ts`; `shellFor` is
imported from `lib/auth.tsx`.

> Alternative: ask the backend to emit `iverto://outpass/<id>` and `iverto://profile-request`
> instead, and delete this mapping. Cleaner long-term, but it breaks any already-installed
> build, so the client-side map is the safer move now.

---

## 8. Wiring it up

### 8a. Foreground display behaviour — `app/_layout.tsx`

Set this at **module scope**, above the component, so it is installed before any listener
fires:

```ts
import * as Notifications from 'expo-notifications';

/* The socket (lib/live.ts) already updates the screen the user is looking at, so a banner
   on top of it would be redundant for the current screen — but a push about a *different*
   pass still deserves one. Showing it is the lesser evil; suppressing per-screen is not
   worth the bookkeeping. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,   // see the badge note in §9
  }),
});
```

### 8b. Tap handling — `app/_layout.tsx`, inside `RootLayout`

```ts
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { routeForUri } from '@/lib/push';

function usePushRouting() {
  const router = useRouter();
  const { shell, restoring, user } = useAuth();

  useEffect(() => {
    /* Hold every deep link until the keystore has been read. `shell` is 'student' by
       default while restoring, so routing now would send a guardian to the student
       endpoint — the same 403 the ?role= param exists to avoid. */
    if (restoring || !user) return;

    let alive = true;

    /* Cold start: the tap that launched the process is not delivered to the listener
       below, only to this. Without it, tapping a push on a killed app opens the home
       screen and drops the deep link. */
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!alive) return;
      const uri = response?.notification.request.content.data?.uri as string | undefined;
      const route = routeForUri(uri, shell);
      if (route) router.push(route);
    });

    /* Warm start: app already running, foreground or background. */
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const uri = response.notification.request.content.data?.uri as string | undefined;
      const route = routeForUri(uri, shell);
      if (route) router.push(route);
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, [router, shell, restoring, user]);
}
```

Call `usePushRouting()` from a component rendered **inside** `AuthProvider` — it needs
`useAuth()`, and routing to `/outpass/<id>` before the session restores would bounce off the
auth guard anyway. `RootLayout` itself renders `AuthProvider`, so put the call in a small
child component rather than in `RootLayout` directly.

> `getLastNotificationResponseAsync` keeps returning the same launch response for the life
> of the process, so this re-fires if `shell` changes. In practice `shell` settles once per
> session and the second `push` is a no-op onto the same route; if you see a duplicate
> navigation, latch it with a `useRef` of the handled notification id.

### 8c. Registration lifecycle — `lib/auth.tsx`

Three edits, mirroring how the socket is handled in `components/AppContext.tsx`:

**On sign-in** — in `signIn`, after `/me` succeeds and before the `routeFor(...)` return:

```ts
/* Fire-and-forget: a denied notification permission must not block landing on the
   dashboard, and registerForPush already swallows its own failures. */
void registerForPush();
```

**On session restore** — in the launch `useEffect`, alongside the `meApi.get()` call:

```ts
void registerForPush();
```

Re-registering the same token is explicitly a refresh, not a duplicate
(`mobile-api-documentation.md` §8), so calling this on every launch is correct and is what
keeps `lastSeenAt` warm.

**On sign-out** — `signOut` currently calls `authApi.logout()` with no token, so the server
keeps pushing to a signed-out device. Change it to:

```ts
const signOut = useCallback(async () => {
  const token = currentPushToken();
  try {
    /* Passing the token disables it server-side in the same round trip — one call
       instead of logout + DELETE /push/token. */
    await authApi.logout(token ?? undefined);
  } catch {
    /* Signing out locally matters more than the server acknowledging it. */
  }
  await unregisterForPush();
  clear();
  setSessionEnd({ reason: 'signed-out', at: Date.now() });
}, [clear]);
```

`auth.logout(pushToken?)` already accepts this — no endpoint change needed.

### 8d. Token refresh — `components/AppContext.tsx`

Add to the existing session `useEffect`, next to `connectLive`:

```ts
const tokenSub = watchTokenRefresh();
// ...and in the cleanup:
tokenSub.remove();
```

---

## 9. What the backend must send

For a notification to appear in the tray while the app is backgrounded or killed, the FCM
message needs a **`notification` block as well as `data`**. A data-only message is handed to
the app silently and shows nothing unless the app is running.

```jsonc
{
  "message": {
    "token": "<the registered device token>",
    "notification": {
      "title": "Permission Approval Request",
      "body": "Permission request for Doctor visit requires your approval"
    },
    "data": {
      "permissionId": "ckp1...",
      "type": "PARENT_APPROVAL_REQUEST",
      "uri": "iverto://permissions/ckp1..."
    },
    "android": {
      "priority": "high",
      "notification": { "channel_id": "default" }
    }
  }
}
```

Three rules that bite:

- **Every value in `data` must be a string.** FCM rejects numbers, booleans and nested
  objects. `permissionId` is already a string; watch any counter you add later.
- **`channel_id` must be `"default"`** — the channel `lib/push.ts` creates. An unknown
  channel id on Android 8+ means the notification is dropped entirely.
- **`priority: "high"`** or Doze delays delivery by minutes. Approval requests are
  time-sensitive; announcements are not, so `"normal"` is fine for those.

The `title`/`body`/`data` values are already on the notification row the inbox returns, so
the sender can reuse them verbatim.

### Badge counting — do not double-count

`components/AppContext.tsx` already increments `unread` on the socket's `notification:new`
event. If a push listener *also* increments it, a foreground notification counts twice.
Leave `shouldSetBadge: false` and let the socket plus `notifications.unreadCount` own the
badge, exactly as they do today.

---

## 10. Testing

```bash
npx expo prebuild --platform android      # no --clean
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-arm64-v8a-release.apk
```

Push does **not** work on the Expo Go app or on an emulator image without Google Play
Services — you need a development or release build on a real device. `Device.isDevice`
guards this, so it fails quietly rather than crashing.

Confirm the token reached the server:

```bash
adb logcat | grep -i "FirebaseMessaging\|expo-notifications"
```

Then send a test from Firebase console → **Messaging → New campaign → Notifications →
Send test message**, pasting the device token. Note the console's test sender only sends a
`notification` block with no `data`, so the notification will appear but tapping it opens
the home screen — that is expected and does not mean §7 is broken. To test deep links, send
a real one through the backend, or hit the FCM V1 REST endpoint with the JSON in §9.

Force a token rotation to check §8d: clear app storage, relaunch, and confirm a second
`POST /push/token` with a different value.

### Troubleshooting

| Symptom | Cause |
|---|---|
| Registration 201s, nothing ever arrives | Package name in Firebase ≠ `com.iverto.ai`, or `google-services.json` is from a different project |
| Works in debug, silent in release | R8 stripped a Firebase class — add keep rules to `android/app/proguard-rules.pro` |
| Notification shows, tap opens home screen | The `uri` mapping in §7 — check it isn't `iverto://permissions/...` hitting `router.push` raw |
| Guardian taps approval push, sees "not found" / no approve buttons | Missing `?role=parent` — the detail screen defaulted to `student`. See §7 |
| Nothing on Android 13+, no prompt seen | `POST_NOTIFICATIONS` denied. Settings → Apps → Iverto.ai → Notifications |
| Silent notification, no banner | Missing or mismatched `channel_id`, or the channel was created after the first push |
| `INVALID_ARGUMENT` from Firebase Admin | An APNs token registered as an FCM token — the iOS case in §2 |
| Token missing after `prebuild --clean` | `--clean` wiped the size config too; restore per README before rebuilding |

---

## 11. Order of work

1. Firebase console app for `com.iverto.ai`, `google-services.json` at repo root. (§3)
2. `npx expo install expo-notifications expo-device`, edit `app.json`, plain `prebuild`. (§4–5)
3. Add `lib/push.ts`. (§6–7)
4. Wire `_layout.tsx`, `lib/auth.tsx`, `AppContext.tsx`. (§8)
5. Confirm with the backend that sends carry `notification` + `data` + `channel_id`. (§9)
6. Test on a real device. (§10)

Steps 1–4 are client-only and safe to land before the backend's `FIREBASE_SERVICE_ACCOUNT`
is configured — with it unset the server logs pushes instead of sending them, so nothing
breaks while the rest catches up.
