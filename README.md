# Iverto Outpass — Mobile UI

Single codebase for Android + iOS. **React Native (Expo SDK 54) + Expo Router + TypeScript.**
This pass is **UI only** — screens are static, no auth logic, no network calls.

## Run

```bash
npm install
npm start        # then press a (Android) / i (iOS), or scan the QR in Expo Go
npm run typecheck
```

Verified: `tsc --noEmit` clean, and `expo export` renders all 17 routes without errors.
The release APK is **20.96 MB** — see [App size](#app-size).

## Brand

The palette comes straight off the logo mark: **crimson `#B9000E`** on a **neutral
`#F3F3F3`** canvas. Both live in [`theme/index.ts`](./theme/index.ts) — change them there
and the whole app follows.

| Asset | What it is |
|---|---|
| `assets/logo.svg` | Vector source of the mark |
| `assets/logo.png` | 1024² raster master, crimson on transparency — every launcher asset is generated from this |
| `assets/logo-white.png` | Same mark in white, for crimson or dark surfaces |
| `theme/logo.ts` | The mark's path data, so the UI draws it as vector geometry |
| `components/Logo.tsx` | `<Logo>`, `<LogoBadge>`, `<BrandLockup>`, `<LogoWatermark>` |

The mark appears on the login lockup, every dashboard header, top bars with no right
action, the change-password screen, the "powered by" footer, and as a watermark behind
profile headers. It renders from vector path data rather than a bitmap, so it stays sharp at
every size — from the 13px footer mark to the 62px login badge.

## Motion

All animation lives in [`components/motion.tsx`](./components/motion.tsx) and is built on
React Native's own `Animated` — **no `react-native-reanimated`**. Reanimated would be the
right call for gesture-driven work; this app has none, and its worklet runtime plus native
library is ~2 MB of APK for effects that do not need it. The whole motion system costs about
10 KB. See [App size](#app-size).

| Export | What it does | Where it shows up |
|---|---|---|
| `Appear` | Fades and lifts a child in, once, on mount | Headers, empty/error states, login |
| `Stagger` | Gives each child its own `Appear`, one after the next | Every `Screen`, every list |
| `usePressMotion` | Dips a surface under the finger and springs it back | Buttons, cards, tiles, chips, icon buttons |
| `usePop` | Springs between two scales when a flag flips | Checkbox tick, notification badge, tab icons |
| `CountUp` | Rolls a number up to its value | `StatCard` counters |
| `LiveDot` | Status dot with a pulsing halo | `StatusPill`, unsettled statuses only |
| `animateLayout` | Animates the next layout pass | Keyboard show/hide |

Three rules the code holds to:

1. **Native driver only.** Everything animates `opacity` and `transform` and nothing else, so
   it runs on the UI thread and keeps 60 fps while JS is parsing the response that is about to
   replace it. Nothing animates colour, height or `elevation` — those cannot cross to the
   native driver. Layout changes go through `animateLayout()` instead.
2. **Entrances play once, on mount.** Remounting is what replays them, which is exactly right:
   swapping a skeleton for real content mounts new elements and they arrive; a refetch that
   lands the same rows leaves them mounted and still.
3. **Reduced motion is honoured.** `AccessibilityInfo` is read once at import and cached, so
   an entrance has the answer synchronously at mount. A user who asked the OS for less movement
   gets the final frame immediately, never a frozen blank one.

`Screen` staggers its own children, so a screen gets its entrance without asking — the same
reasoning as the keyboard handling: a screen cannot be relied on to remember. Pass
`animate={false}` to opt out. `Stagger` keys its wrappers off `React.Children.toArray`, not
off the rendered position, so a strip appearing at the top of a dashboard does not shift every
key below it and remount the screen underneath.

---

# Building an APK / AAB with Gradle

Expo projects have no `android/` folder until you generate one. `expo prebuild` writes a
complete native Android project — Gradle wrapper, `build.gradle` files, manifest, resources
— from `app.json`. After that it's an ordinary Gradle build and Expo is out of the loop.

`android/` is in `.gitignore` and is meant to be **disposable**: regenerate it rather than
hand-editing it. See [Customising the native project](#customising-the-native-project) if you
need changes that survive.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **JDK** | **17** | Required by AGP 8.x. JDK 21 is not supported by this Gradle version. |
| **Android SDK** | Platform 34, Build-Tools 34.0.0 | Easiest via Android Studio → SDK Manager. |
| **Node** | 18+ | |

Set the environment so Gradle can find the SDK:

```powershell
# Windows (PowerShell) — persists for future sessions
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Java\jdk-17"
```

```bash
# macOS / Linux — add to ~/.zshrc or ~/.bashrc
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

Open a new terminal afterwards, then confirm:

```bash
java -version      # must print 17.x
adb --version
```

If you'd rather not set `ANDROID_HOME`, create `android/local.properties` after prebuild with
`sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk` (escape the colon and backslashes).

## 1. Generate the native project

```bash
npm install
npx expo prebuild --platform android
```

This creates `android/` with `gradlew`, applies `app.json` (package name `com.iverto.ai`,
version, icons, splash), and links every autolinked native module. Run it again with
`--clean` whenever you change `app.json`, add a native dependency, or want a fresh slate:

```bash
npx expo prebuild --platform android --clean
```

> ⚠️ **`--clean` regenerates `android/` from scratch and throws away the size configuration.**
> The next `assembleRelease` would then produce a single ~58 MB APK. If you run it, re-apply
> the four edits listed in [Keeping the size config through a prebuild](#keeping-the-size-config-through-a-prebuild).
> Plain `prebuild` (no `--clean`) leaves existing files alone and is safe.

## 2. Build

All Gradle commands run **from inside `android/`**. On Windows use `.\gradlew` (PowerShell)
or `gradlew` (cmd); on macOS/Linux use `./gradlew`.

### Debug APK — quickest, installs anywhere

```bash
cd android
./gradlew assembleDebug
```

→ `android/app/build/outputs/apk/debug/app-debug.apk`

Expects a Metro dev server (`npm start`) for the JS bundle.

### Release APK — standalone, shareable

```bash
cd android
./gradlew assembleRelease
```

The JS bundle is compiled in, so this runs with no dev server. These are the files to hand
to testers. The build emits **three** APKs, not one:

| File in `android/app/build/outputs/apk/release/` | Size | Install on |
|---|---|---|
| `app-arm64-v8a-release.apk` | **20.96 MB** | Every phone sold since ~2017. **Use this one.** |
| `app-armeabi-v7a-release.apk` | **16.30 MB** | Older/budget 32-bit devices. |
| `app-universal-release.apk` | **30.80 MB** | Both of the above in one file — when you don't know the target. |

All three are well under the 40 MB budget. See [App size](#app-size) for how that is held.

> Note the filenames — there is **no** `app-release.apk`. Per-architecture APKs are what
> keeps the download small; a device only needs the libraries for its own CPU.

### Release AAB — for Google Play

```bash
cd android
./gradlew bundleRelease
```

→ `android/app/build/outputs/bundle/release/app-release.aab`

An `.aab` **cannot be sideloaded** — Play generates per-device APKs from it. Use
`assembleRelease` for anything you want to install directly.

### Useful extras

```bash
./gradlew clean                    # wipe build outputs
./gradlew assembleRelease --scan   # deep timing/failure report
./gradlew tasks                    # every available task
./gradlew installRelease           # build + install on the connected device
```

Or skip the two-step entirely and let Expo drive Gradle:

```bash
npx expo run:android --variant release
```

## 3. Install

```bash
adb devices                                                              # confirm the device is listed
adb install -r android/app/build/outputs/apk/release/app-arm64-v8a-release.apk
```

Not sure which architecture a device is? Ask it:

```bash
adb shell getprop ro.product.cpu.abi     # arm64-v8a on anything modern
```

Or install `app-universal-release.apk`, which covers both ARM targets.

`-r` reinstalls over an existing copy. If it fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`,
the installed build was signed with a different key — `adb uninstall com.iverto.ai` first.

## App size

**Budget: under 40 MB.** Current release builds, measured on a clean build:

| APK | Size |
|---|---|
| `app-arm64-v8a-release.apk` | 20.96 MB |
| `app-armeabi-v7a-release.apk` | 16.30 MB |
| `app-universal-release.apk` | 30.80 MB |

Install the split that matches the device — `arm64-v8a` for anything current — and the universal
APK only when one file has to install anywhere. Wiring up the API moved these by roughly
0.2 MB: four dependencies in (`expo-secure-store`, `expo-file-system`, `expo-sharing`,
`socket.io-client`), and `react-native-qrcode-svg` out with the QR gate pass.

Animation cost **~10 KB**, all of it JavaScript. `components/motion.tsx` is built on React
Native's own `Animated`, which is already in the runtime — see [Motion](#motion).

### Debug builds are not a size signal

`assembleDebug` produces a **~158 MB** APK. That is expected and does not mean anything is
wrong: a debug build carries all four CPU architectures, unstripped native symbols, no
minification, and the dev-support machinery. **Only ever judge size from `assembleRelease`.**

### What holds the budget

| Lever | Where | Effect |
|---|---|---|
| Release build instead of debug | `assembleRelease` | 158 MB → ~30 MB |
| Only ARM architectures — `x86`/`x86_64` are emulator-only | `reactNativeArchitectures` in `android/gradle.properties` | −27 MB |
| One APK per architecture | `splits { abi { ... } }` in `android/app/build.gradle` | −10 MB per device |
| R8 minification + resource shrinking | `android.enableProguardInReleaseBuilds`, `android.enableShrinkResourcesInReleaseBuilds` | −3 MB dex/resources |
| Icons imported one set at a time | `import Ionicons from '@expo/vector-icons/Ionicons'` | −2.9 MB of fonts |
| Fonts imported one weight at a time | `@expo-google-fonts/poppins/400Regular` etc. in `app/_layout.tsx` | −2.3 MB of fonts |
| `react-native-reanimated` stays out — the app animates on RN's own `Animated` | `components/motion.tsx` | −2 MB |

### The two font traps

Both are easy to reintroduce and neither shows up until you inspect the APK.

```ts
import { Ionicons } from '@expo/vector-icons';                 // ✗ bundles all 19 icon fonts
import Ionicons from '@expo/vector-icons/Ionicons';            // ✓ bundles one

import { Poppins_400Regular } from '@expo-google-fonts/poppins';        // ✗ bundles all 18 faces
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular'; // ✓ bundles one
```

Both packages' root modules `require()` **every** font file they ship. Metro bundles any
asset it sees a `require` for, so importing from the package root ships the lot — 3.8 MB of
icon fonts and 2.7 MB of Poppins weights and italics this app never renders.

### Checking what is actually in an APK

```bash
# Biggest entries
python -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); \
[print(f'{i.file_size/1048576:8.2f} MB  {i.filename}') for i in sorted(z.infolist(), key=lambda i:-i.file_size)[:25]]" \
  android/app/build/outputs/apk/release/app-arm64-v8a-release.apk

# Every font that got bundled — expect 5: Ionicons + 4 Poppins weights
python -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); \
t=[i for i in z.infolist() if i.filename.endswith('.ttf')]; \
print(len(t),'fonts, %.2f MB'%(sum(i.file_size for i in t)/1048576))" \
  android/app/build/outputs/apk/release/app-arm64-v8a-release.apk
```

Android Studio's **Build → Analyze APK…** gives the same breakdown with a UI.

### If it ever grows past 40 MB

In rough order of what to reach for:

1. **Ship arm64 only.** Drop `armeabi-v7a` from `reactNativeArchitectures`. 32-bit-only
   Android phones are essentially gone.
2. **Compress the native libraries.** Set `expo.useLegacyPackaging=true` in
   `android/gradle.properties` — takes roughly 30% off the `.so` payload in the *download*,
   at the cost of a larger install footprint and slightly slower first launch.
3. **Ship an AAB instead** (`bundleRelease`). Play then generates a per-device APK and strips
   unused densities and languages on top of everything above. Only helps via Play — an AAB
   cannot be sideloaded.

### Do not exclude Kotlin metadata

`android/app/build.gradle` strips some duplicated `META-INF` files from the APK. It is
tempting to also exclude `kotlin/**` and `META-INF/*.kotlin_module`, which look like dead
weight. **They are not.** They are Kotlin's reflection metadata, and Expo resolves view props
through `kotlin-reflect` at runtime. Excluding them builds and installs fine, then fails on
the first screen with:

```
Cannot set prop 'endPoint' on view 'class ...'
Caused by: Unresolved class: float (kind = null)
```

The comment in `packagingOptions` says the same thing — leave it there.

## Signing

**By default `assembleRelease` signs with the debug keystore.** The APK installs fine and is
right for internal testing, but Play will reject it and you cannot rotate to a real key later
without users reinstalling. Set up a proper upload key before any public release.

### 1. Create a keystore

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore iverto-upload.keystore \
  -alias iverto-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Keep it **outside** `android/` — that folder gets deleted by `prebuild --clean`. Something
like `~/keys/iverto-upload.keystore` works.

### 2. Store the credentials globally

Put these in `~/.gradle/gradle.properties` (`%USERPROFILE%\.gradle\gradle.properties` on
Windows) — never in the repo:

```properties
IVERTO_UPLOAD_STORE_FILE=/absolute/path/to/iverto-upload.keystore
IVERTO_UPLOAD_KEY_ALIAS=iverto-upload
IVERTO_UPLOAD_STORE_PASSWORD=••••••
IVERTO_UPLOAD_KEY_PASSWORD=••••••
```

### 3. Point the release build at it

In `android/app/build.gradle`, add the config and switch the release build type to use it:

```gradle
android {
    signingConfigs {
        release {
            if (project.hasProperty('IVERTO_UPLOAD_STORE_FILE')) {
                storeFile file(IVERTO_UPLOAD_STORE_FILE)
                storePassword IVERTO_UPLOAD_STORE_PASSWORD
                keyAlias IVERTO_UPLOAD_KEY_ALIAS
                keyPassword IVERTO_UPLOAD_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release   // was: signingConfigs.debug
            ...
        }
    }
}
```

Verify what a build was actually signed with:

```bash
keytool -printcert -jarfile android/app/build/outputs/apk/release/app-release.apk
```

**Back the keystore up.** Losing it means you can never publish an update to an existing Play
listing — only a new app under a new package name.

> This edit lives in generated code, so `prebuild --clean` will revert it. To make it stick,
> see below.

## Customising the native project

Anything you change by hand inside `android/` is lost on the next `prebuild --clean`. Two
durable options:

1. **Stop regenerating** — delete `android/` from `.gitignore`, commit it, and treat it as
   normal source. Simplest, but you then own upgrades: every Expo SDK bump means merging
   native changes yourself.
2. **Config plugins** — express the change as a plugin so prebuild reapplies it every time.
   Common knobs (minSdk, NDK, Proguard, JVM args) are covered by:

   ```bash
   npx expo install expo-build-properties
   ```

   ```json
   "plugins": [
     "expo-router",
     ["expo-build-properties", {
       "android": { "compileSdkVersion": 36, "targetSdkVersion": 36, "minSdkVersion": 24 }
     }]
   ]
   ```

Option 2 is the recommended path for this project — it keeps `android/` disposable.

### Keeping the size and signing config through a prebuild

Nothing here has to be re-applied by hand any more. `android/` is disposable: run
`npx expo prebuild --platform android --clean` whenever you like and every setting below
comes back.

Two mechanisms carry it, and which one a setting uses is worth knowing before you go
looking for it:

| Setting | Where it lives |
|---|---|
| `minSdkVersion`, `compileSdkVersion`, `targetSdkVersion`, `buildToolsVersion` | `expo-build-properties` in `app.json` |
| ABIs to build (`armeabi-v7a`, `arm64-v8a` — no x86) | `expo-build-properties` → `buildArchs` |
| R8, resource shrinking, PNG crunching, bundle compression | `expo-build-properties` |
| `packagingOptions` excludes, extra Proguard rules | `expo-build-properties` |
| `ndk { abiFilters }`, ABI splits + universal APK, per-ABI `versionCode` | `plugins/with-android-release.js` |
| Release upload-key `signingConfig` | `plugins/with-android-release.js` |
| The Android 16 restricted-resizability opt-out | `plugins/with-android-release.js` |

Rule of thumb: if `expo-build-properties` has a key for it, use the key — it is versioned
with Expo and survives SDK upgrades untouched. `plugins/with-android-release.js` exists only
for the gaps, and it appends a second `android { }` block to `android/app/build.gradle`
rather than rewriting the template's, so an SDK upgrade that reformats the template cannot
break it.

The upload keystore is deliberately *not* in this repo. `plugins/with-android-release.js`
reads four properties from the user-level `~/.gradle/gradle.properties`
(`%USERPROFILE%\.gradle\gradle.properties` on Windows):

```properties
IVERTO_UPLOAD_STORE_FILE=…
IVERTO_UPLOAD_STORE_PASSWORD=…
IVERTO_UPLOAD_KEY_ALIAS=…
IVERTO_UPLOAD_KEY_PASSWORD=…
```

Without them the release build still succeeds — it falls back to the debug key, so it runs
but is not publishable. That is intentional: a fresh clone and a CI job with no secrets
should both be able to build.

## Checking a release before you upload it

Two of Play's requirements fail in ways that ordinary testing cannot see, so check them
against the built artifact rather than trusting the config.

**16 KB memory pages.** Required for anything targeting API 35 or above. A build whose
native libraries are 4 KB-aligned installs and runs perfectly on every 4 KB device, so
nothing in normal testing catches it — it only fails on 16 KB hardware, which is what new
Android 15+ devices ship with, and Play rejects it. The libraries come prebuilt inside
dependency AARs, so no Gradle setting fixes a bad one; the runtime has to move. That is
what forced the Expo SDK 51 → 54 upgrade.

```bash
npm run check:16kb -- android/app/build/outputs/bundle/release/app-release.aab
```

Exits non-zero if any arm64 library has a `PT_LOAD` segment aligned below 16384, and names
the offenders. Safe to gate a release on.

**Target API level.** Read it off the merged manifest, not `app.json` — `app.json` is the
input, and the merged manifest is what Play actually receives:

```bash
grep -o 'targetSdkVersion="[0-9]*"' \
  android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml
```

The same file is the place to confirm that `blockedPermissions` did its job: anything listed
there should be absent from the merged output entirely, not merely marked for removal.

## Versioning

`app.json` is the source of truth; prebuild copies these into the Gradle build. Bump both
before a release:

- `expo.version` — user-facing string, e.g. `1.0.1`
- `expo.android.versionCode` — integer, must strictly increase for every Play upload

Then re-run `npx expo prebuild --platform android` so `android/app/build.gradle` picks them up.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `SDK location not found` | Set `ANDROID_HOME`, or write `android/local.properties`. |
| `Unsupported class file major version` | Wrong JDK. Must be 17 — check `java -version` *and* `JAVA_HOME`. |
| `Could not find tools.jar` | `JAVA_HOME` points at a JRE, not a JDK. |
| Build hangs at `Configure project` | First run downloads Gradle and dependencies — expect 10–20 min. Later builds take 1–3 min. |
| `OutOfMemoryError` during `assembleRelease` | Raise `org.gradle.jvmargs=-Xmx4096m` in `android/gradle.properties`. |
| App installs but shows a red screen | Release build with no bundle — you ran `assembleDebug` without Metro. Use `assembleRelease`. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Signature mismatch. `adb uninstall com.iverto.ai`, then reinstall. |
| Stale assets after an icon change | `./gradlew clean` then rebuild; icons are copied at prebuild time, so re-run prebuild too. |
| `app-release.apk` not found | Expected — the build emits per-architecture APKs. Use `app-arm64-v8a-release.apk`. |
| APK is ~158 MB | You built `assembleDebug`. Debug builds are never representative — use `assembleRelease`. |
| Release APK suddenly ~58 MB | `x86`/`x86_64` are back. Something reset `reactNativeArchitectures` or dropped `abiFilters` — usually `prebuild --clean`. |
| Fonts jumped by ~3 MB | Someone reintroduced a package-root font import. See [The two font traps](#the-two-font-traps). |
| `Unresolved class: float (kind = null)` on first screen | Kotlin reflection metadata was stripped. Do not exclude `kotlin/**` or `META-INF/*.kotlin_module` in `packagingOptions`. |
| Release build crashes but debug is fine | R8 stripped something reached only by reflection. Add a `-keep` rule to `android/app/proguard-rules.pro`; confirm by temporarily setting `android.enableProguardInReleaseBuilds=false`. |
| Stale fonts/assets still in the APK | The JS bundle task does not purge its output dir. `./gradlew clean` before re-measuring. |

## Alternative: EAS Build (cloud)

If you'd rather not install the Android toolchain, [`eas.json`](./eas.json) is still
configured and builds on Expo's servers:

```bash
npm install -g eas-cli
eas login
eas init                                          # once per project
eas build --platform android --profile preview    # .apk
eas build --platform android --profile production # .aab
```

| Profile | Output | Use it for |
|---|---|---|
| `preview` | `.apk`, release JS, internal distribution | Sharing a testable build. |
| `development` | `.apk` with `expo-dev-client` | Day-to-day native development against a local Metro server. |
| `production` | `.aab` | Google Play uploads. |
| `production-apk` | `.apk`, production config | A release build you need to install outside Play. |

EAS generates and stores an upload keystore on the first Android build — press Enter when
asked, then back it up with `eas credentials --platform android`.

## Icons and splash

`assets/` is generated by [`assets/generate-icons.py`](./assets/generate-icons.py) from the
`assets/logo.png` master. Requires Pillow (`pip install Pillow`):

```bash
python assets/generate-icons.py
```

It writes `icon.png` (1024², mark on the `#F3F3F3` canvas), `adaptive-icon.png` (Android
foreground, transparent, mark inside the 66% safe zone), `splash.png`, `favicon.png` and
`notification-icon.png` (white silhouette for the status bar). `app.json` points at all of
them, with `android.adaptiveIcon.backgroundColor` set to the brand canvas `#F3F3F3`.

Re-run `npx expo prebuild --platform android` after regenerating so the native project picks
up the new files.

## Screens

| Route | Screen |
|---|---|
| `/` | Login — email/roll number and password. The server's role decides the shell |
| `/change-password` | New password for an account still on the office-issued default |
| `/onboarding` | Links a fresh account to its Student or ParentContact record |
| `/notifications` | Inbox — deep-links each notification to what it is about |
| `/profile-request` | Diff builder for a profile change, from the server's field whitelist |
| `/student` | Home — curfew strip, live request, counters, recent list |
| `/student/request` | New outpass form — category chips, date/time pickers, destination, reason, attachment |
| `/student/history` | All requests, server-side status filter + search, paginated |
| `/student/profile` | Profile + settings |
| `/parent` | Approvals queue with inline Approve / Reject / Talk to the warden |
| `/parent/history` | Past decisions, per ward |
| `/parent/ward` | Ward overview — whereabouts, last gate scan, guardians, warden, emergency |
| `/parent/late-entries` | Late return log, acknowledged on view |
| `/parent/profile` | Profile + settings |
| `/admin` | Overview — open emergencies, 4 stat tiles, quick tools, activity feed, announcements |
| `/admin/requests` | Campus-wide requests, search + filters, CSV export |
| `/admin/profile-requests` | Profile change queue — diff, attachment, approve / decline |
| `/admin/groups` | Group list, each row opens the icon editor |
| `/icon-editor` | **Per-group app icon editor** — live home-screen preview, gradient presets, shape, monogram, custom upload, paginated roster picker |
| `/admin/profile` | Profile, site filter, roles & permissions |
| `/outpass/[id]` | Shared detail — status banner, trip details, server-rendered timeline, role-specific action bar |

Which shell opens is decided by `user.role` in the login response, not by the role picker — the
picker only tells the server how to read the identifier. Wardens use the admin shell.

## Structure

```
app/            expo-router routes (file = route)
components/     ui.tsx (Button, Card, Field, StatusPill, Avatar, ...), Screen.tsx,
                motion.tsx (Appear, Stagger, usePressMotion, CountUp, LiveDot),
                Logo.tsx, OutpassCard, ProfileBody, TabBar,
                AppContext (config/branding/badge), AdminContext, WardContext
lib/            api/client.ts    one fetch wrapper, error envelope, bearer token
                api/endpoints.ts every documented endpoint, one function each
                api/useQuery.ts  useQuery / useMutation / usePagedQuery (cursor paging)
                auth.tsx         session, linkage, role → shell routing
                session.ts       keystore persistence
                status.ts        backend status → chip, colour, label, predicates
                datetime.ts      ISO 8601 ↔ display
                live.ts          Socket.IO foreground updates
                export.ts        CSV → share sheet
theme/          index.ts (colours, spacing, radius, type, shadow), logo.ts (mark path)
constants/      config.ts — presets, icon maps, page sizes
types/          index.ts — the wire shapes, named exactly as the API doc names them
assets/         logo master + generated launcher/splash assets
android/        generated by `expo prebuild` — not committed
```

## API

Every endpoint in `mobile-api-documentation.md` is wired. Point the app at a host with one
variable:

```
EXPO_PUBLIC_API_URL=https://api.iverto.ai/hostel
```

Unset, it falls back to `extra.apiUrl` in `app.json`, so a release build works with no env at
all. Paths are written from the version segment on (`/v1/mobile/...`) and appended to the base,
so they can be copied out of the doc unchanged.

Two things in the doc are deliberately **not** in the app:

- **The QR gate pass.** `/pass`, `/issue-pass` and `/gate/scan` are not implemented server-side —
  a verifiable pass token needs its own signing and expiry design — so the app does not draw a
  scannable code it cannot back up.
- **FCM push registration.** `POST /push/token` is implemented in `lib/api/endpoints.ts`, but
  nothing calls it yet: that needs `expo-notifications`, a `google-services.json` and a Firebase
  project. Until then the in-app inbox (`/notifications`) and the Socket.IO connection cover
  delivery while the app is open. See "Turning push on" below.

### Turning push on

1. `npx expo install expo-notifications`
2. Drop `google-services.json` into the project root and add it to `app.json` under
   `android.googleServicesFile`.
3. On sign-in, request permission, read the FCM token and call `push.register(platform, token)`.
4. Pass the same token to `auth.logout(token)` on sign-out — the server disables it so the
   device stops receiving pushes.

Push payloads already carry a `uri` (`iverto://permissions/<id>`), and the `iverto` scheme is
registered in the manifest, so deep links resolve once the tokens are flowing.

## App icon per group (admin feature)

The editor UI is complete. To make it take effect on device you'll need a native alternate-icon
package — `expo-dynamic-app-icon` or `react-native-change-icon` — plus a dev/EAS build (it does not
work in Expo Go). Icon variants must be declared at build time; the API then selects among them.

- iOS shows a system alert when the icon changes.
- Android applies it silently via activity-alias on next launch.

Suggested flow: admin saves → server stores `groupId → iconKey` → member app reads its assigned key
on launch → calls the native setter if it differs from the current icon.
