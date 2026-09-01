# Privacy Policy — Iverto.ai (Outpass)

**Effective date:** 18 August 2026
**Last updated:** 18 August 2026
**Applies to:** the Iverto.ai mobile app for Android and iOS (package `com.iverto.ai`) and the API it talks to at `https://api.iverto.ai`.

> **Placeholders to fill before publishing.** Everything marked `[…]` needs your legal
> details: `[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`, `[CONTACT EMAIL]`,
> `[GRIEVANCE OFFICER NAME]`, `[GRIEVANCE EMAIL]`, `[WEBSITE]`, `[RETENTION PERIOD]`.
> Nothing else in this document is a guess — the data practices described below were
> written from the app's source.

---

## 1. Who we are, and who decides what happens to your data

Iverto.ai is a hostel outpass and gate-permission app. Students raise passes, guardians
approve or decline them, and wardens and administrators act on them.

**Your institution is in charge of your data.** Accounts are created by the hostel office —
there is no sign-up inside the app — and your college, university or hostel operator decides
what information is held about you, who on their staff can see it, and how long it is kept.
Under India's Digital Personal Data Protection Act, 2023 your institution is the **Data
Fiduciary**; under the GDPR it is the **Controller**.

`[LEGAL ENTITY NAME]` (`[REGISTERED ADDRESS]`) builds and operates the app and its servers
**on your institution's instructions** — a **Data Processor**. We do not sell your data, use
it for advertising, or use it to train models.

If you want your data corrected or deleted, start with your institution's hostel office. We
will help them, but we act on their instructions, not independently.

---

## 2. What the app collects

### 2.1 Account and identity

Provided by your institution when your account is created, and shown to you in the app:

| Data | Applies to |
|---|---|
| Name, role (student / guardian / warden / admin) | Everyone |
| Roll number, hostel, room number, site/campus | Students |
| Email address, phone number, alternate phone | Everyone, where on record |
| Postal address, relationship to student | Students and guardians |
| Guardian records linked to a student, and sibling links | Students and guardians |
| Which institution (tenant) and campus (site) you belong to | Everyone |

We collect **no** self-declared profile data beyond this. You cannot edit these fields
directly — you file a change request (§2.6) and a staff member approves it.

### 2.2 Sign-in credentials

Your password is sent to the server to sign in and is **never stored on your device**. The
app stores the resulting access and refresh tokens (§4).

The app also remembers **the identifier you last signed in with** — your roll number, phone
or email — so the login screen can offer it back after a session expires. It is stored
encrypted on the device, kept deliberately after sign-out, and is never sent anywhere except
as part of a sign-in you initiate. No password is kept with it.

### 2.3 Outpass and gate records

Everything the workflow needs, created by you or about you:

- Pass type, category, reason, destination, and requested dates and times
- Approvals, rejections, escalations and overrides — with the **name of the person who
  decided, when, and any note they wrote**
- Gate scan-in and scan-out events
- **Late entries** — when a student returned after curfew — and whether a guardian has
  acknowledged them
- **Emergency alerts** a guardian raises: category (medical / family / safety / other), the
  message written, and an optional contact phone number

Decision notes and reasons are visible to the other parties on the pass. Write them
accordingly.

### 2.4 Supporting documents you upload

You may attach a file to a pass request or a profile change request: PDF, JPEG, PNG, HEIC or
WEBP, up to 5 MB. The app opens your device's own file picker — it does **not** browse your
storage, photo library, or camera on its own, and it can only read the single file you pick.

Uploaded files are stored by the server and served over links that **expire after five
minutes**. Whatever you put in the file — a medical certificate, a letter — is visible to the
staff and guardians handling that request, so upload only what the request needs.

### 2.5 Location — opt-in, foreground only

Location sharing is **off until a student turns it on** in their profile, and it exists so a
guardian can see whether their ward is on campus.

When it is on:

- The app records **latitude, longitude, accuracy, a timestamp**, whether the device is
  inside the campus geofence, and which geofence zone it was measured against.
- Fixes are taken **only while the app is open on screen**. The app requests
  *when-in-use* permission only; Android background location is explicitly disabled in the
  build. Close the app and reporting stops.
- A location is sent **at most once a minute**, and only when the phone has actually moved
  about 50 metres — or immediately when it crosses the campus boundary, which is the event
  the feature exists to report.
- Guardians see the ward's last known position and the time of that fix. A stale fix is
  labelled as stale rather than presented as current.

**Turning it off** is a switch in the student's profile; the app stops taking fixes at once.
Revoking the OS location permission also stops it. Neither deletes fixes already sent — ask
your institution for those to be removed.

Guardians, wardens and administrators do not share their own location. The app has no
location feature for them.

### 2.6 Profile change requests

If a detail about you is wrong, you can request a change to a limited set of fields (name,
phone, alternate phone, email, room number, address, relationship). The request holds the
old value, the new value, any file you attach, and the staff decision and note. Only one
request can be open at a time.

### 2.7 Device and push notification data

- A **Firebase Cloud Messaging device token** and your platform (`android` / `ios`), so the
  server can notify you about your own passes. The token identifies the app installation on
  your device, not you personally. It is refreshed when Firebase rotates it, and disabled
  server-side when you sign out.
- Whether the app is running on a physical device — used only to skip push registration on
  emulators, which have no push service.
- Your notification preferences (push, email, SMS on/off).

Push notifications are currently delivered on **Android only**.

### 2.8 Technical data

Standard connection data reaches our servers when the app calls the API or opens its
realtime connection: IP address, timestamps, and which endpoint was called. Staff-facing
screens show an **audit/activity feed** of actions taken in the system (who approved what,
gate scans, announcements, overrides).

---

## 3. What the app does **not** collect

To be explicit, because a permissions list can look alarming without it:

- **No advertising, no analytics, no third-party trackers.** The app bundles no analytics or
  advertising SDK of any kind.
- **No background location.** Not requested, not enabled in the build.
- **No contacts, calendar, SMS, call log, microphone, or health data.**
- **No camera or photo-library access.** Attachments come through the system file picker.
- **No browsing history or data from other apps.**
- **No sale of personal data,** to anyone, ever.

---

## 4. What is stored on your device

| Stored | Where | Cleared when |
|---|---|---|
| Access token, refresh token, expiry | Android Keystore / iOS Keychain (encrypted) | Sign-out |
| Your name, role and account links | Android Keystore / iOS Keychain (encrypted) | Sign-out |
| Last sign-in identifier | Android Keystore / iOS Keychain (encrypted) | Uninstall, or clearing app data |
| Location-sharing on/off choice | Android Keystore / iOS Keychain (encrypted) | Uninstall, or clearing app data |
| Attachment files you picked | Temporary app cache, while uploading | Automatically by the OS |

The access token expires after one hour and is renewed silently while you use the app.
Signing out deletes the tokens and the stored profile from the device and disables that
device's push token on the server. Your profile is always re-fetched from the server on
launch — the app never trusts stale profile data on disk.

---

## 5. Who your data is shared with

**Within your institution.** By design, and because the workflow requires it:

- **Students** see their own passes, their own history, and their linked guardians.
- **Guardians** see their wards' passes, late entries, and — only if the student has turned
  it on — their ward's location. A guardian sees only students linked to their own record.
- **Wardens and administrators** see passes, students and activity for **their own campus**.
  Administrators can export pass and profile-request data as CSV.

**Service providers.** We use processors solely to run the service:

- **Google Firebase Cloud Messaging** — delivers push notifications. Google receives the
  device token and the notification content. See Google's privacy policy.
- **Cloud hosting and file storage** for the API, database and uploaded attachments.

**Legal.** We disclose data where required by law, court order, or a lawful request from a
government authority, and where necessary to protect someone's safety.

**Never** for advertising, data brokerage, or profiling.

---

## 6. Students who are minors

Some hostel residents are under 18. Where that is the case, your institution is responsible
for obtaining verifiable consent from a parent or lawful guardian before creating the
account, as required by §9 of the DPDP Act, 2023. The app does not show advertising, does
not track behaviour, and does not profile students.

Guardian visibility into a ward's passes and — when enabled — location is a deliberate
feature of the hostel's duty of care, not a covert one: the student turns location sharing
on themselves and can turn it off at any time.

---

## 7. How long data is kept

Retention is set by your institution. In general:

- **Pass and gate records** are kept as long as the hostel's own record-keeping requires —
  `[RETENTION PERIOD]`.
- **Location fixes** are short-lived; they exist to answer "where is my ward now", not to
  build a history.
- **Push tokens** are disabled on sign-out and dropped when Firebase reports them invalid.
- **Attachments** are kept with the request they belong to.
- **Data on your device** is gone when you sign out or uninstall (§4).

When your account is closed by the institution, its data is deleted or anonymised in line
with their retention schedule and any applicable law.

---

## 8. Your rights

Depending on where you live, you have the right to **access** your data, **correct** it,
request its **deletion**, **withdraw consent**, object to certain processing, and receive a
copy in a portable form. Under the DPDP Act you may also **nominate** someone to exercise
these rights on your behalf.

In practice:

| You want to | Do this |
|---|---|
| Correct a detail on your record | File a profile change request in the app (Profile → request a change) |
| Stop sharing location | Turn the switch off in your profile, or revoke the OS permission |
| Stop push notifications | Turn push off in notification preferences, or in your device settings |
| See or delete your records | Contact your hostel office; they are the data fiduciary |
| Complain | Write to our grievance officer (§10), or to your national data protection authority |

We answer requests forwarded by your institution within 30 days.

---

## 9. How data is protected

- All traffic between the app and the server uses **HTTPS/TLS**.
- Tokens and profile data on the device are held in the **Android Keystore / iOS Keychain**,
  not in plain app storage.
- Attachment links are **signed and expire in five minutes**.
- Access is **role- and campus-scoped** on the server: a guardian's token cannot read another
  family's ward, and a student's cannot reach admin screens.
- Decisions that bypass the normal workflow (administrator overrides) are **written to an
  audit log**.

No system is perfectly secure. If a breach affects your personal data, we will notify your
institution and, where the law requires it, the relevant authority and you.

---

## 10. Contact

**Data protection / privacy:** `[CONTACT EMAIL]`
**Grievance Officer (India, DPDP Act 2023):** `[GRIEVANCE OFFICER NAME]` — `[GRIEVANCE EMAIL]`
**Post:** `[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`
**Web:** `[WEBSITE]`

For anything about your own hostel record — a wrong phone number, a pass that should not be
there, an account to close — your hostel office is faster, and is the party that decides.

---

## 11. Changes to this policy

We will update this page when the app's data practices change, and move the "Last updated"
date at the top. A change that materially affects you will be announced in the app before it
takes effect. The current version is always the one published with the app.

---

## Appendix — Google Play Data Safety summary

For filling in the Play Console form.

| Data type | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Name | Yes | With institution staff & linked guardians | App functionality | No — provided by institution |
| Email address | Yes | Same | App functionality, account management | No |
| Phone number | Yes | Same | App functionality, account management | No |
| Address | Yes | Same | App functionality | No |
| Other IDs (roll number, user ID) | Yes | Same | App functionality | No |
| Approximate / precise location | Yes | With linked guardians and campus staff | App functionality (campus presence) | **Yes — opt-in, foreground only** |
| Files & documents (user-uploaded) | Yes | With staff handling the request | App functionality | Yes |
| App activity (pass history, in-app actions) | Yes | With institution staff | App functionality | No |
| Device or other IDs (FCM push token) | Yes | With Google (FCM) | Push notifications | Yes — declinable |
| Photos, contacts, calendar, SMS, health, financial, browsing history | **No** | — | — | — |

**Data is encrypted in transit:** Yes.
**Users can request data deletion:** Yes — through the operating institution.
**Data used for advertising or third-party marketing:** No.
