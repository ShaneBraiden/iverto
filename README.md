# Iverto Outpass — Mobile UI

Single codebase for Android + iOS. **React Native (Expo SDK 51) + Expo Router + TypeScript.**
This pass is **UI only** — screens are static, no auth logic, no network calls.

## Run

```bash
npm install
npm start        # then press a (Android) / i (iOS), or scan the QR in Expo Go
npm run typecheck
```

Verified: `tsc --noEmit` clean, and `expo export` renders all 17 routes without errors.

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
action, the OTP screen, the "powered by" footer, and as a watermark behind profile
headers. It renders from vector path data rather than a bitmap, so it stays sharp at
every size — from the 13px footer mark to the 62px login badge.

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

This creates `android/` with `gradlew`, applies `app.json` (package name `ai.iverto.app`,
version, icons, splash), and links every autolinked native module. Run it again with
`--clean` whenever you change `app.json`, add a native dependency, or want a fresh slate:

```bash
npx expo prebuild --platform android --clean
```

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

→ `android/app/build/outputs/apk/release/app-release.apk`

The JS bundle is compiled in, so this runs with no dev server. This is the file to hand to
testers.

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
adb devices                                                       # confirm the device is listed
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`-r` reinstalls over an existing copy. If it fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`,
the installed build was signed with a different key — `adb uninstall ai.iverto.app` first.

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
       "android": { "compileSdkVersion": 34, "targetSdkVersion": 34, "minSdkVersion": 24 }
     }]
   ]
   ```

Option 2 is the recommended path for this project — it keeps `android/` disposable.

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
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Signature mismatch. `adb uninstall ai.iverto.app`, then reinstall. |
| Stale assets after an icon change | `./gradlew clean` then rebuild; icons are copied at prebuild time, so re-run prebuild too. |

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
| `/` | Login — role selector (Student / Parent / Admin), password, OTP option |
| `/otp` | 6-digit OTP entry with custom keypad |
| `/student` | Home — latest request highlight, quick action, counters, recent list |
| `/student/request` | New outpass form — category chips, date/time pickers, destination, reason, attachment |
| `/student/history` | All requests with status filter |
| `/student/profile` | Profile + settings |
| `/parent` | Approvals queue with inline Approve / Reject |
| `/parent/history` | Past decisions |
| `/parent/ward` | Ward overview — on-campus status, hostel & warden contact |
| `/parent/profile` | Profile + settings |
| `/admin` | Overview — 4 stat tiles, quick tools grid, activity feed |
| `/admin/requests` | Campus-wide requests, search + filters |
| `/admin/groups` | Group list, each row opens the icon editor |
| `/icon-editor` | **Per-group app icon editor** — live home-screen preview, 6 gradient presets, shape, monogram, custom upload |
| `/admin/profile` | Profile + branding shortcut |
| `/outpass/[id]` | Shared detail — status banner, QR gate pass (when approved), trip details, approval timeline, role-specific action bar + reject-reason sheet |

Login "Continue" routes straight to the selected role's dashboard, so all three shells are reachable without a backend.

## Structure

```
app/            expo-router routes (file = route)
components/     ui.tsx (Button, Card, Field, StatusPill, Avatar, ...), Screen.tsx,
                Logo.tsx, OutpassCard, ProfileBody, TabBar
theme/          index.ts (colours, spacing, radius, type, shadow), logo.ts (mark path)
constants/      sample.ts — static display data
assets/         logo master + generated launcher/splash assets
android/        generated by `expo prebuild` — not committed
```

## Wiring up your APIs

Everything the UI reads comes from `constants/sample.ts`. The types there (`Outpass`, `Group`) are
already shaped like expected API responses — replace each export with a fetch/React Query hook and
the screens work unchanged.

Places that need a call once endpoints exist:

- `app/index.tsx` — login submit, and route by the role the server returns rather than the picker
- `app/otp.tsx` — send / verify OTP
- `app/student/request.tsx` — create outpass
- `app/parent/index.tsx` and `app/outpass/[id].tsx` — approve / reject
- `app/icon-editor.tsx` — save group icon

## App icon per group (admin feature)

The editor UI is complete. To make it take effect on device you'll need a native alternate-icon
package — `expo-dynamic-app-icon` or `react-native-change-icon` — plus a dev/EAS build (it does not
work in Expo Go). Icon variants must be declared at build time; the API then selects among them.

- iOS shows a system alert when the icon changes.
- Android applies it silently via activity-alias on next launch.

Suggested flow: admin saves → server stores `groupId → iconKey` → member app reads its assigned key
on launch → calls the native setter if it differs from the current icon.
#   i v e r t o  
 