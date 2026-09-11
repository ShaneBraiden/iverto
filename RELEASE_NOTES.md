# Iverto.ai 1.1.1 — maintenance rebuild

No functional changes. The same code as 1.1.0, rebuilt with a new version so Play
accepts the upload.

| | |
|---|---|
| **Version** | 1.1.1 (versionCode 5) |
| **Platform** | Android |
| **Minimum Android** | 7.0 (API 24), targets API 36 |
| **Runtime** | Expo SDK 54, React Native 0.81.5, React 19.1 |

## What changed

- **`version` 1.1.0 → 1.1.1, Android `versionCode` 4 → 5, iOS `buildNumber` 2 → 3.**
  Play requires a higher `versionCode` on every upload; the rest track it.
- Nothing else — no dependency, source, permission or configuration change. The `android/`
  project was regenerated from `app.json` with `expo prebuild --clean` and rebuilt.

## Artifacts

| Artifact | Target | Size |
|---|---|---|
| `app-release.aab` | Google Play | 28.29 MB |

Signed with the Iverto.ai upload key — SHA-1 `89:A5:E7:60:75:A3:1A:DE:5D:FF:AA:B0:68:50:2C:6C:5C:D3:82:16`,
the same key as 1.1.0, so this is an in-place update of the existing Play listing. All 18
arm64 native libraries are 16 KB page-aligned. Upload
`android/app/build/outputs/mapping/release/mapping.txt` with the bundle for crash
de-obfuscation; native debug symbols are already embedded in it.

Split APKs were not built this cycle. Run `./gradlew assembleRelease` from `android/` if
direct-install APKs are needed — see [README.md](./README.md).

---

# Iverto.ai 1.1.0 — Android 16

A platform release. Nothing about what the app does has changed; what changed is the
runtime underneath it and the Android version it is built for.

| | |
|---|---|
| **Version** | 1.1.0 (versionCode 4) |
| **Platform** | Android |
| **Minimum Android** | 7.0 (API 24), targets API 36 |
| **Runtime** | Expo SDK 54, React Native 0.81.5, React 19.1 |

## Why this release exists

Google Play requires every app to target Android 16 (API 36) from 31 August 2026. The
previous build targeted API 35 and could not simply be re-pointed at 36: Play also requires
**16 KB memory page support** for anything targeting API 35 or above, and React Native 0.74
ships only 4 KB-aligned native libraries. Those arrive prebuilt from the React Native and
Expo maven artifacts, so no Gradle setting can change them — the runtime had to move.

Declaring API 36 without that move would have produced an app that passes Play's target-API
check and then fails to start on 16 KB devices, which is every device shipping with Android
15 or later.

## What changed

- **Expo SDK 51 → 54** (React Native 0.74.5 → 0.81.5, React 18 → 19.1). `compileSdk` and
  `targetSdk` are both 36, and all bundled native libraries are 16 KB aligned.
- **New Architecture (Fabric) is on.** Layout and view updates no longer cross the old
  bridge, which is the largest single change to how the app feels under load.
- **Edge-to-edge drawing**, which Android 16 enforces with no opt-out. The app already
  measured safe-area insets on every screen, so the layout was ready for it.
- **Predictive back** is enabled — the system back gesture previews where it is taking you.
- **Keyboard handling rewritten** for Android 15+, which ignores `adjustResize` for
  edge-to-edge apps. The window no longer shrinks when the keyboard opens, so the scroll
  containers now measure the keyboard's top edge directly rather than trusting the window to
  have moved. Sign-in, change-password and the request form are the screens this covers.
- **Three permissions dropped** — `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and
  `WRITE_EXTERNAL_STORAGE`. Expo's template and `expo-file-system` declare them by default;
  this app never used any of them. CSV exports go to the cache directory and out through the
  share sheet, which needs no permission.
- **Lists re-render less.** The card every history and queue list is built from is memoised,
  so typing in a search box no longer re-renders every row on screen for each character.

## Artifacts

| Artifact | Target | Size |
|---|---|---|
| `app-release.aab` | Google Play | 28.29 MB |
| `app-arm64-v8a-release.apk` | Current 64-bit devices | 24.41 MB |
| `app-armeabi-v7a-release.apk` | Older 32-bit devices | 19.63 MB |
| `app-universal-release.apk` | Installs anywhere | 35.58 MB |

The bundle is larger than 1.0.0's 17.78 MB, and most of that is not shipped: 12.2 MB of it is
`BUNDLE-METADATA` — the R8 mapping file and native debug symbols Play keeps for crash
symbolication and strips before delivery. What a device actually receives is roughly 11–12 MB
(5.1 MB of arm64 native code, 3.7 MB of dex, 1.5 MB of resources, 1.1 MB of JS), against
20.96 MB for the 1.0.0 arm64 APK.

The direct-install APKs did grow — 20.96 MB to 24.41 MB for arm64. The JS bundle now ships
uncompressed, which is React Native's default from 0.79 because it removes a decompression
step from every cold start, and the New Architecture adds native code of its own. The trade is
about 3 MB of download for a faster launch.

Split APKs carry their own versionCode so a device cannot sidegrade between architectures:
`armeabi-v7a` is 41, `arm64-v8a` is 43, and the universal APK keeps the base 4.

## Verifying a build

16 KB alignment is the requirement that is easiest to break by accident and hardest to notice,
since a 4 KB-only build installs and runs perfectly on every 4 KB device. To check an APK or
AAB, read the ELF program headers of its arm64 libraries — every `PT_LOAD` segment needs
`p_align` of at least 16384. All 18 libraries in this build pass.

## Minimum Android is now 7.0

React Native 0.81 requires API 24. The previous floor was 6.0 (API 23), so devices on
Android 6.0 and 6.0.1 will no longer receive updates. They keep the version they have.

## Still true from 1.0.0

Everything below describes the app as it was first released and still behaves that way.

---

# Iverto.ai 1.0.0 — first release

Hostel outpass management for students, guardians and wardens — request a pass, get it
approved, and see it through the gate. One codebase, four roles, twenty-one screens.

| | |
|---|---|
| **Version** | 1.0.0 (versionCode 1) |
| **Platform** | Android |
| **Minimum Android** | 6.0 (API 23), targets API 34 |
| **Download** | 20.96 MB (`arm64-v8a`) |
| **Runtime** | Expo SDK 51, React Native 0.74.5 |

---

## Signing in

Accounts are provisioned by the hostel office. There is no self-service sign-up.

- **One password, three kinds of identifier.** Sign in with a roll number, mobile number or
  email. The role you pick only tells the server how to read the identifier — the account's
  real role decides which app you land in, so choosing "Admin" cannot get a student into the
  admin screens. Wardens use the admin shell.
- **Office-issued passwords are changed on first sign-in.** An account still on its default
  password goes straight to a new-password screen before any other. "Forgot password" emails a
  reset from the same screen.
- **New accounts link themselves to their campus record.** A student enters their roll number;
  a guardian enters their phone number, which links every ward registered against it in one
  step. Sessions survive a restart, and expired access tokens refresh in the background instead
  of dropping you mid-task.

`/` · `/change-password` · `/onboarding`

## For students

- **Home shows tonight's curfew and the pass in play.** The curfew strip, the currently live
  request, counters for pending and approved passes, and the most recent requests — all on the
  first screen.
- **A pass takes one screen to raise.** Pick a category, set out and back times, add a
  destination, a reason and an optional attachment. Categories come from your campus rather
  than being hardcoded, so the chips match what your hostel actually allows. Requests can be
  cancelled while they are still open.
- **History searches and filters on the server.** Filter by status and search the full record,
  not just the page you are looking at. Lists page as you scroll.
- **Location sharing, off until you turn it on.** Switch it on from your profile and your
  guardians can see whether you are on campus. Fixes are taken only while the app is open, at
  most one a minute, and only when the phone has actually moved 50 m or crossed the campus
  boundary. Switch it off any time.

`/student` · `/student/request` · `/student/history` · `/student/profile`

## For guardians

- **An approvals queue that puts your decisions first.** Anything waiting on you sits at the
  top. Approve, reject, or ask to speak to the warden before deciding — each with a note that
  the student and the warden both see.
- **Several wards on one account.** Sign in once with the phone number on record and switch
  between siblings from the header.
- **Ward overview: whereabouts, last gate scan, who to call.** Where your ward is relative to
  campus, when the fix was taken — and plainly when it is stale — their last scan through the
  gate, the other guardians on the record, and the warden's number.
- **Raise an emergency.** Medical, family, safety or other. Every warden on the ward's site is
  notified immediately.
- **Late returns, logged and marked as seen.** A running log of late entries, cleared of its
  "new" flag as you read it, plus the full history of past decisions per ward.

`/parent` · `/parent/ward` · `/parent/late-entries` · `/parent/history`

## For wardens and admins

- **Overview built for triage.** Open emergencies first, then four stat tiles, quick tools, a
  live activity feed of gate scans and decisions, and recent announcements. Emergencies are
  acknowledged or resolved from the same screen.
- **Every request on campus, searchable and exportable.** Search and filter the full register,
  then export the result as CSV straight into Drive, Gmail or WhatsApp through the share sheet —
  up to 5,000 rows per export.
- **Approvals, activation and override.** Approve a request to start the guardian approval flow,
  activate a pass at the gate, log a guardian response that came in by phone, or override a
  status outright. Overrides are written to the audit log.
- **Profile change requests, reviewed as a diff.** Students and guardians request changes to
  their own details from a field list the campus controls; admins see exactly what would change,
  alongside any supporting attachment, and approve or decline. One open request per person at a
  time.
- **Announcements to a chosen audience.** Send to everyone, or just students, guardians or
  wardens. Every recipient gets a notification.
- **Group branding and the app icon editor.** Group a set of students and give them their own
  app name and mark: gradient presets, icon shape, monogram or a custom upload, previewed as it
  will look on a home screen, with a searchable campus roster for choosing members. Rebranding
  reaches member devices while they are open. See the note below on the launcher icon itself.
- **Site scope and a roles reference.** Staff covering more than one site filter the whole shell
  to one of them. A roles sheet spells out what each role may do and who currently holds it.

`/admin` · `/admin/requests` · `/admin/profile-requests` · `/admin/groups` · `/icon-editor`

## Everyone gets

- **One pass detail screen, four points of view.** Status banner, trip details, the timeline of
  who did what and when, and an action bar holding only the actions your role actually has.
- **Notifications that say something.** Push notifications for approvals, decisions, gate scans,
  emergencies and announcements, each tapping through to what it is about. An in-app inbox with
  an unread badge backs them up, and mark-all-read clears it. Push, email and SMS are toggled
  per person — turning push off keeps the inbox filling.
- **Updates land while you are watching.** A guardian approving a request updates the student's
  screen as it happens, without a pull-to-refresh. If the live connection cannot be made the app
  falls back to refreshing on focus.
- **Loading that does not flash.** Skeletons shaped like the content they are standing in for,
  entrance animations that play once, real error states with a retry, and empty states that say
  what would fill them. Movement is dropped entirely for anyone who asked their phone for less
  of it.

`/outpass/[id]` · `/notifications` · `/profile-request`

---

## Not in this release

- **No scannable QR gate pass.** The gate flow runs on warden activation and gate-scan records
  rather than a code on the student's screen. A verifiable pass token needs its own signing and
  expiry design, and the app will not draw one it cannot back up.
- **Push is Android-only.** Notifications are delivered through Firebase. iOS needs its APNs
  token exchanged for an FCM one before push works there; until then iOS relies on the in-app
  inbox and live updates while the app is open.
- **Group branding does not change the launcher icon yet.** The editor, the preview and the
  saved branding are all live, and a branded group's name and mark appear inside the app.
  Swapping the icon on the home screen needs a native alternate-icon package and a rebuild, so
  it is not in this build.
- **Location is foreground-only.** No background tracking, by design — it is a separate
  permission and a store declaration, and this release does not ask for it. Guardians are told
  when a fix is stale rather than being shown an old one as if it were current.

## Rolling out (as of 1.0.0)

Hand out the `arm64-v8a` APK for current devices, or the universal APK when one file has to
install everywhere. Point the build at a backend with `EXPO_PUBLIC_API_URL`; unset, it uses the
host baked into `app.json`.

| Artifact | Target | Size |
|---|---|---|
| `app-arm64-v8a-release.apk` | Current 64-bit devices | 20.96 MB |
| `app-armeabi-v7a-release.apk` | Older 32-bit devices | 16.30 MB |
| `app-universal-release.apk` | Installs anywhere | 30.80 MB |
| `app-release.aab` | Google Play | — |

Build instructions, signing and the size configuration are in [README.md](./README.md).
