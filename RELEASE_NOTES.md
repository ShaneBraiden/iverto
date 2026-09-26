# Iverto.ai 1.2.3 — sign-in moved to Hostel v2

| | |
|---|---|
| **Version** | 1.2.3 (versionCode 10) |
| **Platform** | Android |

No one could sign in to 1.2.2. It pointed at `https://api.iverto.ai/devhostel`,
but it still signed in through `/v1/mobile/auth/login`, and that deployment
serves no v1 routes. Every sign-in got a 404, and the login screen reads a 404
as "No app account has been set up for these details", so it looked like the
accounts were missing. They weren't.

## What changed

- **Sign-in, refresh, logout, forgot password and change password now use
  `/v2/auth/**`.** Login calls `POST /v2/auth/password/login` and then
  `GET /v2/tenants/{tenantId}/me`, because v2 login returns the actor type but
  not the role. Roles map as `student`→student, `guardian`→parent,
  `warden`→warden, `tenant_admin`→admin.
- **The login screen asks for a hostel code.** v2 needs a tenant code, and
  nothing in the build sets one. The device remembers the last code that
  signed in successfully. An unknown code gets the same 401 as a wrong
  password, so one message covers both.
- **Changing your password asks for the current one** (a v2 requirement), on
  both the change-password screen and the profile sheet.
- **Gate `security` accounts are turned away at sign-in with a clear message.**
  The app has no screens for them; before, they landed in the student shell.
- **Sessions are stored under new keychain keys (`iverto.*.v2`).** A v1
  session saved by an older build isn't restored against v2. After upgrading,
  users land on the login screen instead of seeing "your session ended".
- **The push device is unregistered before logout**, while the token can still
  authorise the DELETE.

## Artifacts

`dist/iverto-ai-1.2.3-vc10.aab` (26.99 MB) and
`dist/iverto-ai-1.2.3-vc10-mapping.txt`. Signed with the upload key (SHA-1
`89:A5:E7:60:75:A3:1A:DE:5D:FF:AA:B0:68:50:2C:6C:5C:D3:82:16`), and
`jarsigner -verify` reports `jar verified`. The Hermes bundle contains
`https://api.iverto.ai/devhostel` and `/auth/password/login`, and it does not
contain `/hostel`, `/v1/mobile/auth/login`, or any tenant code. All 18 arm64
libraries are 16 KB-aligned, and `tsc --noEmit` is clean.

## Still on v1 (left as-is on purpose)

Location sharing and geofence, the parent's ward-location card, the warden's
"End pass", admin CSV exports and reports, and the v1 onboarding link. v2 has
no plain route for these. On `/devhostel` they return 404, which these
features already tolerate. v2 sign-in returns accounts already linked, so
onboarding is never shown.

## Known: staff MFA

v2 reports `mfaEnrollmentRequired: true` for warden and admin accounts. Some
of their capabilities (such as `announcement.manage`) need MFA level 1. The
app has no MFA enrolment flow yet, so those actions may return 403 for staff.

---

# Iverto.ai 1.2.2 — points at the dev deployment

| | |
|---|---|
| **Version** | 1.2.2 (versionCode 9) |
| **Platform** | Android |

The only change from 1.2.1 is the API base URL. It is now
`https://api.iverto.ai/devhostel` (`extra.apiUrl` in `app.json` and
`EXPO_PUBLIC_API_URL` in `.env`), so v2 calls go to
`https://api.iverto.ai/devhostel/v2/tenants/...` and v1 auth calls go to
`https://api.iverto.ai/devhostel/v1/mobile/...`. The base does not include
`/v2`, because every path in `endpoints.ts` already starts with its own
version segment. The socket handshake path becomes `/devhostel/socket.io`.

## Artifacts

`dist/iverto-ai-1.2.2-vc9.aab` (28.30 MB) and
`dist/iverto-ai-1.2.2-vc9-mapping.txt`. Signed with the upload key (SHA-1
`89:A5:E7:60:75:A3:1A:DE:5D:FF:AA:B0:68:50:2C:6C:5C:D3:82:16`), and
`jarsigner -verify` reports `jar verified`. The Hermes bundle contains
`https://api.iverto.ai/devhostel` and no `/hostel` host. All 18 arm64
libraries are 16 KB-aligned, and `tsc --noEmit` is clean.

---

# Iverto.ai 1.2.1 — Hostel v2 migration, corrected against the contract

1.2.0 moved the data calls to `/hostel/v2/**`, but checked against
`hostel-v2.bundle.yaml` operation by operation, most of those calls would
have failed or rendered empty against a real v2 server. This release fixes
them. Nothing new was moved to v2; the same routes are fixed so they match
the contract.

| | |
|---|---|
| **Version** | 1.2.1 (versionCode 8) |
| **Platform** | Android |

## What was wrong in 1.2.0, and is fixed here

- **List envelopes.** 1.2.0 assumed every v2 list is `{ data, page }`. The
  bundle uses four shapes: `{ items, nextCursor, hasMore }` (permissions,
  guardian queue, notifications), `{ items, page }` (profile requests,
  emergencies, announcements, groups), `{ data, page }` (roster, memberships,
  activity), and a bare `{ data }` (children, guardians, late entries).
  Most lists would have come back empty. They now read all four.
- **Request bodies.** Guardian and warden decisions send `decision`, not
  `response`. Manual override sends `targetStatus` + `reason`, and a
  profile-request rejection sends `reason`. Resolving an escalation sends
  `action: log_guardian_approval`. The contract has no way to log a guardian
  refusal, so "They refused" is recorded as a warden rejection.
- **Reshaped resources are adapted.** `/me` is now picked by role
  (`/me/student`, `/me` + `/me/children`, `/me` + `/sites`). Curfew, the
  student summary, the dashboard, roles, profile-request fields, ward
  detail, late entries and notifications are mapped back to the shapes the
  screens read. Fields v2 no longer supplies come back null or empty; none
  are made up.
- **Groups.** Branding is `PUT /groups/{id}/branding` with `If-Match` (1.2.0
  sent a POST, which does not exist in the contract). The roster is a
  separate `PUT /groups/{id}/members`. Icons travel as `logoFileId`.
- **Headers.** Idempotency keys are UUIDv7, as `x-idempotency: uuidv7_header`
  requires (1.2.0 sent v4). Student cancel now sends its required `If-Match`.
- **Errors.** `ProblemDetails.fieldErrors` is a field → messages map in the
  bundle. 1.2.0 only read an array, so it dropped every v2 validation message.
  A 409 on a pass action now refetches the pass and says it changed.
- **Token refresh is back on v1.** Login still issues a v1 session, so its
  refresh token has to be rotated by v1. 1.2.0 sent it to `/v2/auth/refresh`.
- **Query names.** `q` is sent as `search`, and the guardian's `childId` is
  sent as `studentId`.

## Still open (needs the backend team)

- **v2 host confirmed: `https://api.iverto.ai/hostel/v2`.** Ignore the
  handoff's `api.hostel.iverto.io`. The app gets this from `API_URL`
  (`https://api.iverto.ai/hostel`) plus the `/v2` segment, so nothing
  changed. Every `/v2/**` call will 404 until v2 is deployed there.
- **Cross-version tokens.** The v2 calls carry the v1 login's access token.
  Confirm that v2 accepts it; if not, login must move to
  `/auth/password/login` first.
- **MFA step-up.** Manual override, escalation resolution, profile approval,
  emergency creation and group writes are MFA level 2 in the contract. The
  app has no MFA flow, so expect 401/403 on those until it does.
- **Upload `purpose`.** Permission and profile-request documents go as
  `general` (see `v2UploadPurpose`).

## Artifacts

`dist/iverto-ai-1.2.1-vc8.aab` (28.30 MB) and
`dist/iverto-ai-1.2.1-vc8-mapping.txt`. Signed with the same upload key as
1.2.0 (SHA-1 `89:A5:E7:60:75:A3:1A:DE:5D:FF:AA:B0:68:50:2C:6C:5C:D3:82:16`).
`jarsigner -verify` reports `jar verified`. The merged manifest reads
`versionCode="8"`, `versionName="1.2.1"`. All 18 arm64 libraries are
16 KB-aligned.

`tsc --noEmit` is clean. This build was not run against a live v2 server,
because none exists yet.

---

# Iverto.ai 1.2.0 — Hostel v2 data-plane migration

The app's data calls move from `/v1/mobile/**` to the Hostel v2 contract
(`/hostel/v2/tenants/{tenantId}/**`), against the handoff package in
`Dev/mobile-v2-handoff/`. Auth and onboarding deliberately did not move — see
below.

| | |
|---|---|
| **Version** | 1.2.0 (versionCode 7) |
| **Platform** | Android |
| **Minimum Android** | 7.0 (API 24), targets API 36 |
| **Runtime** | Expo SDK 54, React Native 0.81.5, React 19.1 |

## What changed

- **Every tenant-data endpoint now speaks Hostel v2**: `me`, app config,
  categories, curfew, student/guardian/warden/admin permissions, guardian
  decisions, warden decisions/activation/escalation, profile requests,
  notifications, push device registration, uploads, and groups/branding/roster.
  `lib/api/endpoints.ts` adapts each response back to the exact shape screens
  already read — the v2 `page{ nextCursor, hasMore }` envelope, RFC 7807
  `ProblemDetails` errors, and opaque `fileId` uploads are all normalized at
  that one boundary, so no screen had to change for it.
- **Optimistic concurrency**: guardian/warden decisions, manual overrides,
  emergency resolution, and profile-request review now send the resource's
  `version` as `If-Match`; a stale one is a 409 `PERMISSION_VERSION_CONFLICT`
  instead of a silent overwrite. Mutating calls also carry a generated
  `Idempotency-Key`.
- **Uploads are quarantine-scanned.** `POST /uploads` now returns a `fileId`
  and a `scanState`; `pickAndUpload` (`lib/attachments.ts`) polls a `pending`
  result for a few seconds, and the three screens that attach files (outpass
  request, profile-request proof, group icon) disable submission on an
  `infected`/`failed` scan rather than letting it through.
- **Push device registration** now sends a full device record
  (`installationId`, `platform`, `token`, `appVersion`, `locale`) and gets
  back a server-assigned `deviceId`; sign-out unregisters by that id instead
  of by the raw provider token, which v2 never echoes back.

### Deliberately still on `/v1/mobile/**`

Server v1 is retained unmodified through this migration (per the handoff's
own release runbook), so none of this blocks on the gaps below — each is
called out in `lib/api/endpoints.ts`'s header comment, next to the code:

- **`auth.login`, `auth.forgotPassword`, `auth.changePassword`,
  `onboarding.*`.** Their v2 equivalents need UI this app doesn't have yet —
  a tenant-code entry step ahead of login, a two-step password recovery with
  a code, a current-password field, and cryptographic invitation links
  replacing phone/roll-number onboarding. Swapping the wire call without that
  UI would strand a real user outside a shell they can't get back into, so
  this waits for a product decision rather than a guess. (`auth.refresh` did
  move — it's a background call with no UI of its own.)
- **`location.*`, `warden.endPass`.** Not in the v2 contract at all; nothing
  to move them to yet.
- **`admin.exportPermissions`, `admin.exportProfileRequests`, `admin.reports`.**
  v2 turns a synchronous CSV download into an async report job (`POST
  /report-jobs` + poll), which needs a progress UI these screens don't have.
- **`admin.setRole`.** Unused by any screen today; v2 keys off a
  `membershipId` this app never fetches, so left alone rather than guessed at.

### The v2 backend is not live yet

`EXPO_PUBLIC_API_URL` / `app.json`'s `extra.apiUrl` are unchanged
(`https://api.iverto.ai/hostel`) — v2 paths are additive (`/v2/tenants/...`
alongside the existing `/v1/mobile/...`), so no host or env change was
needed or made. But per the handoff package's own caveat, the v2 surface
has not been deployed anywhere yet. **This build will not work against
today's production host for anything migrated above** until that side is
deployed and health-checked — expect 404s on every `/v2/**` call until then.
Do not distribute this build to real users before that's confirmed; it's
signed and staged in `dist/` for internal/QA use in the meantime.

Two more real gaps worth flagging, not blocking, found while wiring this up:

- `admin.roles()` now combines two v2 calls (`GET /roles` + `GET
  /memberships`) into the shape the roles sheet already renders — the
  handoff's role guide doesn't detail the membership object enough to map
  every field with full confidence, so treat `staff[]` there as best-effort
  until checked against a live backend.
- The upload `purpose` enum genuinely disagrees between the handoff's prose
  doc (`permission` / `profile-request` / `branding`) and its OpenAPI bundle
  (`student_photo` / `guardian_id` / `receipt` / `branding` / `general` /
  `group-icon` / `org-logo`). `permission` and `profile-request` uploads are
  sent as `general` for now — `group-icon` is the one value both sources
  agree on. Flagged with a `TODO(v2)` at `v2UploadPurpose` in
  `lib/api/endpoints.ts`.

## Artifacts

| Artifact | Target | Size |
|---|---|---|
| `iverto-ai-1.2.0-vc7.aab` | Google Play | 28.29 MB |
| `iverto-ai-1.2.0-vc7-arm64-v8a.apk` | Current 64-bit devices | 24.42 MB |
| `iverto-ai-1.2.0-vc7-armeabi-v7a.apk` | Older 32-bit devices | 19.64 MB |
| `iverto-ai-1.2.0-vc7-universal.apk` | Installs anywhere | 35.60 MB |

Signed with the Iverto.ai upload key — SHA-1 `89:A5:E7:60:75:A3:1A:DE:5D:FF:AA:B0:68:50:2C:6C:5C:D3:82:16`,
the same key as every release back to 1.1.0, so this is an in-place update of the existing Play listing.

## Verified before upload

Checked against the built bundle, not against `app.json`:

- **Version** — merged manifest reads `versionCode="7"`, `versionName="1.2.0"`.
- **16 KB pages** — all 18 arm64 libraries 16 KB aligned in both the AAB and
  the arm64 APK (`node scripts/check-16kb.mjs`).
- **Target API** — merged manifest `targetSdkVersion="36"`, `minSdkVersion="24"`.
- **Permissions** — `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and
  `WRITE_EXTERNAL_STORAGE` are absent from the merged manifest entirely.
- **ABIs** — `arm64-v8a` and `armeabi-v7a` only, 36 native libraries total, no x86.
- **API host** — the Hermes bundle carries `https://api.iverto.ai/hostel` and no dev host.
  (React Native's own `http://localhost:8081` dev-server fallback is present in every
  release bundle and is unreachable when `__DEV__` is false.)
- **v2 wiring present** — the Hermes bundle contains `/tenants/`,
  `/me/permissions`, `/guardian-permissions`, `warden-decision`,
  `/me/push-devices`, `Idempotency-Key`, and `If-Match`.
- **Signing** — `jarsigner -verify` reports `jar verified`; the certificate
  SHA-1 matches the upload key above, not the debug key.
- `tsc --noEmit` clean.

Upload `android/app/build/outputs/mapping/release/mapping.txt` with the bundle for crash
de-obfuscation; native debug symbols are already embedded in it. All five artifacts are
staged in `dist/` as `iverto-ai-1.2.0-vc7.*`.

**Size note**: the split APKs (`assembleRelease`) are 3.3–4.8 MB larger per
architecture than the 1.1.2 cycle's documented numbers (20.96 / 16.30 / 30.80
MB), despite no dependency or native-module change in this diff — it touches
only `lib/api/**`, `types/index.ts`, `lib/push.ts`, `lib/auth.tsx`,
`lib/attachments.ts`, `app.json`, and three screens' upload handling, no
native code, and no `package.json` change. The AAB, which is what Play
actually serves, is within 5 KB of 1.1.2's — **not** larger, so whatever
moved is specific to how `assembleRelease` splits/packages locally, not a
real regression in what ships. Worth a `./gradlew clean` rebuild to confirm
before reading anything into the APK delta; not chased further here since
it's outside this migration's scope and every artifact is still well under
the 40 MB budget.

## Not deployed

Nothing in this release has been submitted to Play or installed on a
production device. See "The v2 backend is not live yet" above.

---

# Iverto.ai 1.1.2 — list view for the warden's pass queue

One UI addition on **All passes**, plus the version bump Play requires.

| | |
|---|---|
| **Version** | 1.1.2 (versionCode 6) |
| **Platform** | Android |
| **Minimum Android** | 7.0 (API 24), targets API 36 |
| **Runtime** | Expo SDK 54, React Native 0.81.5, React 19.1 |

## What changed

- **All passes can be shown as a list or as cards.** A two-position toggle sits on the
  results line; the list draws each pass as one row — status dot, student and roll
  number, the window, the pass id, and an overdue line when the return time has passed —
  so roughly three times as many fit on screen as in card view. Cards remain the default,
  the toggle holds for the session, and both views tap through to the same pass detail.
  Search, the status chips, CSV export and the site filter are untouched.
- **`version` 1.1.1 → 1.1.2, Android `versionCode` 5 → 6, iOS `buildNumber` 3 → 4.**
  Play requires a higher `versionCode` on every upload; the rest track it.
- No dependency, permission or configuration change — the diff is
  `app/admin/requests.tsx` and `components/OutpassCard.tsx`.

## Artifacts

| Artifact | Target | Size |
|---|---|---|
| `app-release.aab` | Google Play | 28.29 MB |

Signed with the Iverto.ai upload key — SHA-1 `89:A5:E7:60:75:A3:1A:DE:5D:FF:AA:B0:68:50:2C:6C:5C:D3:82:16`,
the same key as 1.1.0 and 1.1.1, so this is an in-place update of the existing Play listing.

## Verified before upload

Checked against the built bundle, not against `app.json`:

- **Version** — merged manifest reads `versionCode="6"`, `versionName="1.1.2"`.
- **16 KB pages** — all 18 arm64 libraries 16 KB aligned (`npm run check:16kb`).
- **Target API** — merged manifest `targetSdkVersion="36"`, `minSdkVersion="24"`.
- **Permissions** — `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and
  `WRITE_EXTERNAL_STORAGE` are absent from the merged manifest entirely.
- **ABIs** — `arm64-v8a` and `armeabi-v7a` only, 36 native libraries, no x86.
- **API host** — the Hermes bundle carries `https://api.iverto.ai/hostel` and no dev host.
  (React Native's own `http://localhost:8081` dev-server fallback is present in every
  release bundle and is unreachable when `__DEV__` is false.)
- **Signing** — `keytool -printcert -jarfile` reports the upload key above, not the debug key.
- `tsc --noEmit` clean.

Upload `android/app/build/outputs/mapping/release/mapping.txt` with the bundle for crash
de-obfuscation; native debug symbols are already embedded in it. Both artifacts are staged
in `dist/` as `iverto-ai-1.1.2-vc6.aab` and `iverto-ai-1.1.2-vc6-mapping.txt`.

Split APKs were not built this cycle. Run `./gradlew assembleRelease` from `android/` if
direct-install APKs are needed — see [README.md](./README.md).

---

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
