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

## Rolling out

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
