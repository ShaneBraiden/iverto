# Iverto Outpass — Mobile API

Everything the app needs, endpoint by endpoint. Written for the app developer: each entry gives
the method, path, who may call it, the request parameters and the exact response shape the
backend sends.

- **Base URL:** `https://api.iverto.ai/hostel` — that host runs two services; Caddy routes
  `/hostel` to this one. Nothing in the app needs to care how that is wired: append the paths
  below to the base URL and they resolve.

  ```
  https://api.iverto.ai/hostel  +  /v1/mobile/permissions
  = https://api.iverto.ai/hostel/v1/mobile/permissions
  ```

  Every path in this document is written from the version segment onwards (`/v1/mobile/...`),
  so **prepend the base URL to each one**. Point the app at a single
  `API_BASE_URL` and concatenate: `https://api.iverto.ai/hostel` in production,
  `http://localhost:3000` in local dev (no proxy in front, so no `/hostel`).
- **Content type:** `application/json` unless stated (uploads are `multipart/form-data`,
  exports are `text/csv`).
- **Auth:** `Authorization: Bearer <accessToken>` on every endpoint except the ones marked
  **public** in §1.
- **Not implemented on purpose:** the QR gate pass (`/pass`, `/issue-pass`, `/gate/scan`). No
  endpoint below returns a scannable token.

---

## Conventions

### Pagination

Every list is cursor-paginated. Pass `limit` (default 20, admin roster 50) and, for the next
page, `cursor` = the `nextCursor` you were handed.

```json
{ "data": [ ... ], "nextCursor": "cku8...", "hasMore": true }
```

Two lists use a different key for the array, kept for the screens that already consume them:

| Endpoint | Array key |
|---|---|
| `GET /v1/mobile/parent/permissions` | `permissions` |
| everything else | `data` |

### Status filters

`status=` accepts an app-level chip **or** a concrete backend status, or a comma-separated mix.
Omit it (or send `all`) for everything.

| Chip | Expands to |
|---|---|
| `pending` | `draft`, `pending_warden`, `warden_approved`, `waiting_parent`, `escalated`, `contact_parent` |
| `approved` | `parent_approved`, `active`, `student_exited`, `completed` |
| `active` | `active`, `student_exited` |
| `rejected` | `rejected_warden`, `rejected_parent`, `parent_unreachable` |
| `expired` | `expired` |
| `cancelled` | `cancelled` |

Full state machine: `draft → pending_warden → warden_approved → waiting_parent →
parent_approved → active → student_exited → completed`, with `rejected_warden`,
`rejected_parent`, `escalated`, `contact_parent`, `parent_unreachable`, `expired`, `cancelled`
as exits.

### Errors

Every `/v1/mobile/**` route returns this envelope:

```json
{
  "statusCode": 409,
  "error": "PERMISSION_ALREADY_DECIDED",
  "message": "Parent has already responded to this permission",
  "details": { "startDate": ["startDate must be a valid ISO 8601 date string"] }
}
```

`details` appears only on validation failures. `error` codes you can branch on:

`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_FAILED`,
`TOO_MANY_REQUESTS`, `INTERNAL_ERROR`, `PERMISSION_ALREADY_DECIDED`, `PROFILE_REQUEST_PENDING`,
`PROFILE_REQUEST_ALREADY_REVIEWED`.

### The Permission (outpass) object

Returned by every pass endpoint:

```json
{
  "id": "ckp1...",
  "tenantId": "t_1", "siteId": "s_1", "studentId": "stu_1",
  "type": "outing",
  "status": "waiting_parent",
  "reason": "Doctor visit",
  "destination": "City Clinic",
  "startDate": "2026-08-08T10:00:00.000Z",
  "startTime": "2026-08-08T10:00:00.000Z",
  "endTime":   "2026-08-08T18:00:00.000Z",
  "emergencyContact": "+919876543210",
  "supportingDocKeys": ["t_1/permission/u_1/9f2c.pdf"],
  "wardenId": null, "wardenDecisionAt": null, "wardenNote": null,
  "parentContactId": "pc_1", "parentDecisionAt": null, "parentNote": null,
  "parentDecisionMethod": null, "parentDecisionEvidence": null,
  "exitTime": null, "returnTime": null, "durationMinutes": null,
  "expiresAt": null, "cancelledBy": null, "cancelledAt": null,
  "createdAt": "2026-08-07T09:12:31.000Z",
  "updatedAt": "2026-08-07T09:12:31.000Z",
  "student": { "id": "stu_1", "name": "Asha", "rollNumber": "CS101", "roomNumber": "A-101" }
}
```

**Detail** endpoints (`GET .../permissions/:id`) add two fields:

```json
{
  "timeline": [
    { "key": "submitted", "label": "Request submitted", "state": "done",     "at": "...", "by": "Asha",     "note": "Doctor visit" },
    { "key": "guardian",  "label": "Guardian approval", "state": "current",  "at": null,  "by": null,       "note": null },
    { "key": "warden",    "label": "Warden clearance",  "state": "pending",  "at": null,  "by": null,       "note": null }
  ],
  "decidedBy": { "role": "warden", "at": "...", "note": "Approved" }
}
```

`state` is one of `done | current | pending | rejected | skipped`. `decidedBy` is `null` while
nobody has decided.

---

## 1. Auth & session

All of §1 is **public** except `password` and `logout`.

### POST /v1/mobile/auth/login

The role picker on the login screen only tells the server how to read `identifier` — route the
app by `user.role` in the response, which is the account's real role.

```json
{ "identifier": "CS101", "password": "hunter2", "role": "student", "tenantId": "t_1" }
```

| Field | Required | Notes |
|---|---|---|
| `identifier` | yes | roll number (student), mobile number (guardian), email (admin/warden) |
| `password` | yes | |
| `role` | no | `student` \| `parent` \| `admin` — how to read `identifier`. Inferred when omitted |
| `tenantId` | no | only needed if the same roll no./number exists in more than one tenant (409 tells you) |

**200**

```json
{
  "accessToken": "eyJ...", "refreshToken": "v1...", "expiresIn": 3600, "tokenType": "bearer",
  "user": {
    "id": "u_1", "role": "student", "tenantId": "t_1",
    "email": "asha@example.edu", "phone": null,
    "displayName": "Asha", "siteIds": ["s_1"],
    "mustChangePassword": true
  },
  "linkage": {
    "studentId": "stu_1", "rollNumber": "CS101",
    "parentContactIds": [], "childStudentIds": [],
    "linked": true
  }
}
```

`linkage.linked === false` → send the user through onboarding (§2) before any role screen.

`user.mustChangePassword === true` → the account is still on the default password the hostel
office issued. Send the user to the change-password screen first; it clears on success.

Errors: `401` bad credentials · `404` identifier unknown, or no app account yet ·
`409` ambiguous across tenants.

A `404` with "no app account yet" means the roll number / phone exists in the hostel records but
nobody has provisioned a login for it. There is no self-service sign-up: show the user a "contact
the hostel office" message.

### POST /v1/mobile/auth/forgot-password

`{ "identifier": "CS101", "role": "student", "tenantId": "t_1" }` →
`200 { "sent": true, "email": "as***@example.edu" }` (address is masked on purpose).

### POST /v1/mobile/auth/password  *(bearer)*

`{ "newPassword": "at-least-8-chars" }` → `200 { "updated": true }`

### POST /v1/mobile/auth/logout  *(bearer)*

`{ "pushToken": "fcm-token" }` (optional) → `200 { "signedOut": true }`. The token is disabled
server-side so the device stops receiving pushes.

> **Not implemented:** OTP sign-in. There is no `otp/send`, `otp/resend` or `otp/verify`
> endpoint. Password is the only credential; accounts are provisioned by staff (see §2).

---

## 2. Onboarding & profile

**Accounts are created by the hostel office, not by the app.** When a warden enrols a student,
the server provisions a login for the student and one per parent email address, and stamps the
resulting user id onto the `Student` and `ParentContact` rows. By the time anyone opens the app
their account exists and is already linked, so the two link endpoints below are only needed for
records enrolled before this was in place.

Two consequences worth designing for:

- **Siblings need no action.** A parent's account is keyed on their email. Enrolling a second
  child reuses the existing account and links the new `ParentContact` row to it, so the extra
  ward simply appears under `GET /v1/mobile/parent/children`. Never assume one parent = one child.
- **Local guardians are not app users.** A `ParentContact` whose relationship is `Local Guardian`
  is a number the office can call — no account is provisioned and no email is required for one.
  The app has no guardian role; the roles are `student`, `parent`, `warden` and `admin`.
- **New accounts start on a default password** issued by the office, and come back with
  `user.mustChangePassword: true` on login. Route straight to the change-password screen; the
  flag clears when `POST /v1/mobile/auth/password` succeeds.

### POST /v1/mobile/onboarding/parent-link — role `parent`

`{ "phone": "9000000001" }` → links **every** `ParentContact` row with that number, so a
guardian with several wards is linked to all of them in one call.

**201** `{ "linkedContactsCount": 2, "studentIds": ["stu_1", "stu_2"] }` · `404` no contact found.

### POST /v1/mobile/onboarding/student-link — role `student`

`{ "rollNumber": "CS101" }` → **201** the Student object · `404` unknown roll number ·
`409` already linked to another account.

### GET /v1/mobile/me

Role-aware profile.

- **student** → the Student object plus `site`
- **parent** → `{ "parentContacts": [...], "children": [ Student & { parents: [...] } ] }`
- **warden/admin** → `{ "role", "userId", "tenantId", "profile", "assignedSites": [Site] }`

### GET /v1/mobile/app-config

```json
{
  "tenantName": "Iverto College",
  "languages": [{ "code": "en", "label": "English" }],
  "defaultLanguage": "en",
  "support": { "email": "support@iverto.app", "phone": null, "helpUrl": "https://iverto.app/help" },
  "legal": { "termsUrl": "...", "privacyUrl": "..." },
  "deepLinkScheme": "iverto",
  "minimumAppVersion": null
}
```

Backs the Settings tiles (Language, Help & support, Terms & privacy).

---

## 3. Student — outpasses

Role `student`, and the account must be linked to a Student record (else `403`).

### GET /v1/mobile/permissions/summary

One call for the home screen — counters that stay correct past the first page.

```json
{
  "counts": { "pending": 1, "approved": 4, "rejected": 0, "expired": 1, "cancelled": 0, "total": 6 },
  "liveRequest": { Permission },
  "recent": [ Permission, Permission, Permission ]
}
```

### GET /v1/mobile/permissions

Query: `cursor`, `limit`, `status` (see chips), `q` (pass id, reason, destination, type).
→ paginated `data` of Permission.

### GET /v1/mobile/permissions/:id

→ Permission + `timeline` + `decidedBy`, self-scoped (`404` if it isn't yours).

### POST /v1/mobile/permissions/submit

One-step submit — there is no server-side draft.

```json
{
  "type": "outing",
  "reason": "Doctor visit",
  "destination": "City Clinic",
  "startDate": "2026-08-08T10:00:00Z",
  "endDate": "2026-08-08T18:00:00Z",
  "emergencyContact": "+919876543210",
  "supportingDocKeys": ["t_1/permission/u_1/9f2c.pdf"]
}
```

`type` should be a category `id` from `GET /v1/mobile/categories`. `supportingDocKeys` are keys
returned by `POST /v1/mobile/uploads`.

**201** the created Permission in `waiting_parent`. The guardian is notified immediately —
push if they have the app, WhatsApp otherwise.

Errors: `400` invalid range (`endDate` must be after `startDate`) · `401` account not linked.

### POST /v1/mobile/permissions/:id/cancel

No body. **201** the cancelled Permission · `400` if the current state cannot be cancelled ·
`404` not yours.

### GET /v1/mobile/curfew

```json
{
  "currentStatus": "inside",
  "activeCurfew": { "start": "21:00", "end": "06:00" },
  "activePermission": { Permission } ,
  "recentViolations": [ CurfewViolation ]
}
```

`currentStatus` comes from the latest gate scan; `activeCurfew` is the site's policy window
(`null` if none is configured); `recentViolations` is the last 5.

### GET /v1/mobile/categories

```json
[
  { "id": "outing", "label": "Local outing", "description": "...", "requiresSupportingDoc": false, "maxDurationHours": 12 },
  { "id": "medical", "label": "Medical", "description": "...", "requiresSupportingDoc": true, "maxDurationHours": null }
]
```

Tenant-overridable — always render from this call, never hardcode the chips.

---

## 4. Parent — approvals, wards, siblings

> Role `parent`. "Guardian" appears below only as a label for the people on a student's contact
> list; it is not a role. A contact whose relationship is `Local Guardian` has no app account.

Role `parent`, account must be linked to at least one `ParentContact` (else `403`).

### GET /v1/mobile/parent/children

```json
[
  {
    "id": "stu_1", "name": "Asha", "rollNumber": "CS101", "roomNumber": "A-101",
    "department": "CS", "year": "3", "siteId": "s_1",
    "currentStatus": "IN",
    "pendingApprovals": 1,
    "siblings": [ { "id": "stu_2", "name": "Bala", "rollNumber": "CS102" } ]
  }
]
```

`pendingApprovals` per ward drives both the "N requests need your approval" banner and the
cross-ward nudge (sum the other wards).

### GET /v1/mobile/parent/children/:studentId

Ward overview.

```json
{
  "id": "stu_1", "name": "Asha", "rollNumber": "CS101", "roomNumber": "A-101",
  "department": "CS", "year": "3", "enrollmentStatus": "active",
  "currentStatus": "OUT",
  "lastGateScan": { "at": "2026-08-05T18:30:00Z", "direction": "out", "gate": "Main gate", "outcome": "granted" },
  "activePermission": { Permission },
  "passesThisTerm": 4,
  "termStart": "2026-07-01T00:00:00.000Z",
  "openViolations": 1,
  "site": { "id": "s_1", "name": "Boys Hostel", "timezone": "Asia/Kolkata" },
  "hostel": {
    "room": "A-101",
    "group": { "id": "g_1", "name": "Block A" },
    "wardens": [ { "userId": "u_9", "name": "Warden Kumar", "phone": "9000009999", "email": "w@x.io" } ]
  },
  "guardians": [
    { "id": "pc_1", "name": "Mom", "relationship": "Mother", "phone": "9000000001",
      "isApprover": true, "hasAppAccount": true, "isYou": true }
  ],
  "siblings": [ { "id": "stu_2", "name": "Bala" } ]
}
```

`hostel.wardens[].phone` is what the "Call warden" button dials; `guardians[].isApprover`
renders the APPROVER tag.

### GET /v1/mobile/parent/children/:studentId/guardians

Same `guardians` array as above, plus `whatsappOptedOut`.

### GET /v1/mobile/parent/permissions

Query: `cursor`, `limit`, `status`, `childId`, `q`, `decided` (`true` → history: only requests
already decided). Ordering puts everything still `waiting_parent` first, then newest-first.

```json
{ "permissions": [ Permission ], "nextCursor": null, "hasMore": false }
```

`childId` must be one of your wards (`404` otherwise).

### GET /v1/mobile/parent/permissions/:id

→ Permission + `timeline` + `decidedBy`; `404` if it isn't one of your wards'.

### POST /v1/mobile/parent/permissions/:id/decision

```json
{ "response": "approve", "note": "Fine by me" }
```

`response`: `approve` | `reject` | `contact_warden`. `note` is stored as the decision evidence
and shown to the student.

- **200** the updated Permission.
- Repeating the **same** decision (double tap, or the guardian also tapped the WhatsApp button)
  returns **200** with the current state — not an error.
- The **opposite** decision after a decision is already recorded returns **409**
  `PERMISSION_ALREADY_DECIDED`.
- More than one attempt per 5 seconds returns **429**.

`contact_warden` also alerts the warden.

### GET /v1/mobile/parent/children/:studentId/late-entries

Query: `cursor`, `limit`.

```json
{
  "data": [
    {
      "id": "v_1", "permissionId": "ckp1...",
      "date": "2026-08-05T00:00:00.000Z",
      "dueBackAt": "21:00",
      "scannedInAt": "2026-08-05T23:15:00.000Z",
      "delayMinutes": 135,
      "delayLabel": "2h 15m late",
      "severity": "major",
      "reason": "Traffic",
      "resolution": "pending",
      "resolutionNote": null,
      "gate": "Main gate",
      "recordedBy": "u_9",
      "acknowledged": false,
      "acknowledgedAt": null
    }
  ],
  "nextCursor": null,
  "hasMore": false,
  "unacknowledged": 1
}
```

`acknowledged: false` drives the **NEW SINCE YOU LAST CHECKED** flag.

### POST /v1/mobile/parent/late-entries/:id/acknowledge

No body. **200** the violation with `acknowledgedAt` set. Calling it twice is harmless.

### POST /v1/mobile/parent/emergencies

```json
{ "studentId": "stu_1", "category": "medical", "message": "Father hospitalised", "contactPhone": "9000000001" }
```

`category`: `medical` | `family` | `safety` | `other`. **201** the alert
(`{ id, tenantId, siteId, studentId, raisedBy, raisedRole, category, message, contactPhone,
status: "open", createdAt }`). Every warden of the ward's site is pushed immediately.
Throttled to one per 30s.

---

## 5. Admin & warden — campus operations

Role `admin` or `warden`. A warden is automatically scoped to their assigned sites; an admin
sees the whole tenant. Pass `siteId` to narrow further.

### GET /v1/mobile/admin/stats

```json
{
  "pending": 7, "approvedToday": 12, "currentlyOut": 23, "overdue": 2,
  "openEmergencies": 0, "pendingProfileRequests": 3,
  "generatedAt": "2026-08-07T09:00:00.000Z"
}
```

### GET /v1/mobile/admin/activity

Query: `limit` (default 25, max 100), `siteId`.

```json
[
  {
    "id": "a_1", "at": "2026-08-07T08:59:00.000Z",
    "action": "WARDEN_APPROVE", "targetType": "PERMISSION", "targetId": "ckp1...",
    "actorUserId": "u_9", "actorType": "user",
    "summary": "warden approve on permission"
  }
]
```

### GET /v1/mobile/admin/permissions

Query: `cursor`, `limit`, `status`, `q` (roll no., pass id, student name, reason, destination),
`siteId`. → paginated `data` of Permission (with `student`).

### GET /v1/mobile/admin/permissions/:id

→ Permission + `timeline` + `decidedBy`, including `student.parents`.

### POST /v1/mobile/admin/permissions/:id/override

`{ "status": "rejected_warden", "note": "Overridden after gate check" }` → **200** the updated
Permission. This is the "Override & reject" action; it bypasses the state machine deliberately
and is written to the audit log.

### GET /v1/mobile/admin/permissions/export

Same query as the list. Returns `text/csv` (`passId, rollNumber, student, type, status, reason,
destination, startTime, endTime, exitTime, returnTime, parentDecisionAt, wardenDecisionAt,
createdAt`), capped at 5000 rows.

### Announcements

- `GET /v1/mobile/admin/announcements?limit=20` → the sent history.
- `POST /v1/mobile/admin/announcements`

```json
{ "title": "Gate closes at 21:00", "body": "Plan your return", "audience": "student", "siteIds": ["s_1"] }
```

`audience`: `all` | `student` | `parent` | `warden` (default `all`). `siteIds` defaults to the
caller's sites. **201** the announcement with `recipients` = how many inboxes got it. Every
recipient also receives a push.

### GET /v1/mobile/admin/reports?month=2026-08

Monthly report payload (per-student attendance/pass rollup). Defaults to the current month.

### Roles

- `GET /v1/mobile/admin/roles`

```json
{
  "roles": [
    { "role": "warden", "label": "Warden", "capabilities": ["permissions:review", "..."], "members": 4 }
  ],
  "staff": [ { "userId": "u_9", "role": "warden", "displayName": "Warden Kumar", "email": "...", "siteIds": ["s_1"] } ]
}
```

- `PUT /v1/mobile/admin/users/:userId/role` — **admin only** — `{ "role": "warden" }` → updated profile.

### Emergencies

- `GET /v1/mobile/admin/emergencies?status=open` → alerts with the `student` included.
- `POST /v1/mobile/admin/emergencies/:id/resolve` — `{ "status": "resolved", "note": "Called the guardian" }`
  (`status`: `acknowledged` | `resolved`, default `resolved`) → **200** the updated alert.

---

## 6. Profile change requests

Nobody edits their own record: a diff is raised here and an admin applies it. The requester
endpoints are open to any signed-in account; the record they act on is resolved from the
account's linked Student or ParentContact (`404` when there is neither).

### GET /v1/mobile/profile-requests/fields

```json
{
  "subjectType": "student",
  "subjectId": "stu_1",
  "fields": [
    { "field": "phone",      "label": "Mobile number", "type": "tel",   "currentValue": "9000000000" },
    { "field": "email",      "label": "Email",         "type": "email", "currentValue": "asha@example.edu" },
    { "field": "roomNumber", "label": "Hostel room",   "type": "text",  "currentValue": "A-101" },
    { "field": "address",    "label": "Home address",  "type": "text",  "currentValue": null }
  ],
  "pendingRequest": { ProfileChangeRequest }
}
```

Guardian accounts get `name`, `phone`, `alternatePhone`, `email`, `relationship`, `address`.
`pendingRequest` is what the profile screen shows inline so nobody files the same thing twice.

### POST /v1/mobile/profile-requests

```json
{
  "changes": { "roomNumber": "B-204", "phone": "9000000009" },
  "reason": "Moved rooms after re-allocation",
  "attachmentKey": "t_1/profile-request/u_1/2b7f.pdf"
}
```

**201**

```json
{
  "id": "req_1", "tenantId": "t_1", "siteId": "s_1",
  "requesterUserId": "u_1", "requesterRole": "student",
  "subjectType": "student", "subjectId": "stu_1",
  "changes": { "roomNumber": { "old": "A-101", "new": "B-204" } },
  "reason": "Moved rooms after re-allocation",
  "attachmentKey": "t_1/profile-request/u_1/2b7f.pdf",
  "status": "pending",
  "reviewedBy": null, "reviewedAt": null, "reviewNote": null,
  "createdAt": "...", "updatedAt": "..."
}
```

Errors: `400` field not on the whitelist, or nothing actually changed · `409`
`PROFILE_REQUEST_PENDING` (one open request at a time).

### GET /v1/mobile/profile-requests

Query: `status` (`pending` | `approved` | `rejected` | `all`), `cursor`, `limit`
→ paginated `data`.

### GET /v1/mobile/profile-requests/:id

→ the request plus a `subject` summary.

### Admin review

- `GET /v1/mobile/admin/profile-requests?status=pending&q=&cursor=&limit=` — each row carries
  `subject` (`{ id, name, rollNumber, siteId }` for students, `{ id, name, phone, studentId }`
  for guardians) so the queue can render the diff against a person.
- `POST /v1/mobile/admin/profile-requests/:id/approve` — `{ "note": "Verified with the office" }`
  → **200**; the whitelisted fields are written to the record and the requester is notified.
- `POST /v1/mobile/admin/profile-requests/:id/reject` — `{ "note": "Room not allocated yet" }`
  → **200**; the note is shown back to the requester.
- Both return **409** `PROFILE_REQUEST_ALREADY_REVIEWED` on a second review.
- `GET /v1/mobile/admin/profile-requests/export?status=` → `text/csv`.

---

## 7. Groups & per-group app branding

Admin/warden endpoints under `/v1/mobile/admin`, plus one call for the member's device.

### GET /v1/mobile/admin/groups

Query: `branded=true|false` (custom-branding filter).

```json
[
  {
    "id": "g_1", "name": "Block A", "appName": "Block A",
    "iconColors": ["#4F46E5", "#9333EA"], "shape": "squircle", "iconLabel": "BA", "iconKey": null,
    "memberCount": 42, "hasCustomBranding": true, "updatedAt": "..."
  }
]
```

### POST /v1/mobile/admin/groups

`{ "name": "Block A", "appName": "Block A", "iconColors": ["#4F46E5"], "shape": "squircle", "iconLabel": "BA" }`
→ **201** the group.

### GET /v1/mobile/admin/groups/:id

The group plus `members: [{ studentId, name, rollNumber, addedAt }]`.

### POST /v1/mobile/admin/groups/:id/branding

The "Apply to N" action — sets branding and, when `memberStudentIds` is present, **replaces**
the roster with it.

```json
{
  "appName": "Block A",
  "iconColors": ["#4F46E5", "#9333EA"],
  "shape": "squircle",
  "iconLabel": "BA",
  "iconKey": "t_1/group-icon/u_9/icon.png",
  "memberStudentIds": ["stu_1", "stu_2"]
}
```

**200** the group with `memberCount`. Rules: `appName` ≤ 14 chars, `iconLabel` ≤ 2 chars,
`shape` ∈ `squircle | circle | rounded | square`, ids outside the tenant are dropped silently.

### GET /v1/mobile/admin/roster

Query: `q` (roll number or name), `siteId`, `cursor`, `limit` (default 50).

```json
{
  "data": [
    { "id": "stu_1", "name": "Asha", "rollNumber": "CS101", "roomNumber": "A-101",
      "siteId": "s_1", "branded": true, "groupId": "g_1", "groupName": "Block A" }
  ],
  "nextCursor": null, "hasMore": false
}
```

### GET /v1/mobile/me/branding

What this device should render on launch — call it after login and on resume.

```json
{
  "groupId": "g_1", "groupName": "Block A",
  "appName": "Block A",
  "iconColors": ["#4F46E5", "#9333EA"], "shape": "squircle",
  "iconLabel": "BA", "iconKey": null,
  "isDefault": false,
  "version": "2026-08-06T10:00:00.000Z"
}
```

Store `version`; when it changes, call the native alternate-icon setter. Guardians inherit
their ward's branding. `isDefault: true` → the stock icon and the name `Iverto Outpass`.

---

## 8. Notifications

### Device tokens

- `POST /v1/mobile/push/token` — `{ "platform": "android" | "ios", "token": "fcm-token" }` →
  **201** the device row (`{ id, tenantId, userId, platform, token, active, lastSeenAt, createdAt }`).
  Re-registering the same token refreshes it instead of duplicating.
- `DELETE /v1/mobile/push/token` — `{ "token": "fcm-token" }` → `{ "count": 1 }` (soft-disabled).

### Inbox

- `GET /v1/mobile/notifications?cursor=&limit=&unreadOnly=` → paginated `data` of

```json
{
  "id": "n_1", "tenantId": "t_1", "siteId": "s_1", "userId": "u_1",
  "permissionId": "ckp1...",
  "type": "PARENT_APPROVAL_REQUEST",
  "title": "Permission Approval Request",
  "body": "Permission request for Doctor visit requires your approval",
  "data": { "permissionId": "ckp1...", "type": "PARENT_APPROVAL_REQUEST", "uri": "iverto://permissions/ckp1..." },
  "readAt": null,
  "createdAt": "..."
}
```

- `GET /v1/mobile/notifications/unread-count` → `{ "unreadCount": 3 }` — the header badge.
- `PATCH /v1/mobile/notifications/:id/read` → `{ "count": 1 }`
- `PATCH /v1/mobile/notifications/read-all` → `{ "count": 7 }`

### Delivery preferences

- `GET /v1/mobile/notification-preferences` →
  `{ "userId": "u_1", "tenantId": "t_1", "push": true, "email": true, "sms": false, "updatedAt": null }`
- `PUT /v1/mobile/notification-preferences` — `{ "push": false }` → the stored row.
  `push: false` stops server-side push delivery for that account; the inbox still fills.

### Push payloads

FCM data messages always carry a `uri` for deep-linking:

| Situation | `data` |
|---|---|
| Guardian approval needed | `{ permissionId, type: "PARENT_APPROVAL_REQUEST", uri: "iverto://permissions/<id>" }` |
| Status change (student/warden) | `{ permissionId, event, uri: "iverto://permissions/<id>" }` |
| Announcement | `{ announcementId, uri: "iverto://notifications" }` |
| Profile request reviewed | `{ profileRequestId, uri: "iverto://profile-requests" }` |

Deep-link scheme: `iverto://permissions/{id}`, `iverto://notifications`, `iverto://profile-requests`.

### Live updates (Socket.IO)

Push covers a backgrounded app; while it is in the foreground use the socket.

```js
io('https://api.iverto.ai/mobile', {
  path: '/hostel/socket.io',        // handshake path, production
  auth: { token: accessToken },
})
```

The namespace is `/mobile` and the handshake path is `/hostel/socket.io` — two different
things, so keep them as shown. Against a local backend drop the prefix: `path: '/socket.io'`.

The connection joins `user:{userId}` automatically and emits:

| Event | Payload |
|---|---|
| `notification:new` | the AppNotification object above |
| `permission:updated` | the Permission object |

An invalid or missing token is rejected at the handshake.

---

## 9. Uploads

### POST /v1/mobile/uploads

`multipart/form-data` with a `file` part and an optional `purpose` field
(`permission` | `profile-request` | `group-icon`). PDF/JPEG/PNG/HEIC/WEBP, **max 5 MB**.

**201**

```json
{
  "key": "t_1/permission/u_1/9f2c1a....pdf",
  "bucket": "mobile-uploads",
  "filename": "prescription.pdf",
  "contentType": "application/pdf",
  "size": 184320,
  "url": "https://...signed...&token=..."
}
```

Send `key` with the request that needs it (`supportingDocKeys`, `attachmentKey`, `iconKey`).
`url` is short-lived (5 min).

Errors: `400` wrong type, empty, or over 5 MB.

### GET /v1/mobile/uploads/signed-url?key=...

→ `{ "key": "...", "url": "https://...signed..." }` — a fresh 5-minute read URL, for viewing an
attachment from the admin queue.

---

## 10. Endpoint index

| Method | Path | Role |
|---|---|---|
| POST | `/v1/mobile/auth/login` | public |
| POST | `/v1/mobile/auth/forgot-password` | public |
| POST | `/v1/mobile/auth/password` | any |
| POST | `/v1/mobile/auth/logout` | any |
| POST | `/v1/mobile/onboarding/parent-link` | parent |
| POST | `/v1/mobile/onboarding/student-link` | student |
| GET | `/v1/mobile/me` | any |
| GET | `/v1/mobile/app-config` | any |
| GET | `/v1/mobile/categories` | any |
| POST | `/v1/mobile/uploads` | any |
| GET | `/v1/mobile/uploads/signed-url` | any |
| GET | `/v1/mobile/me/branding` | any |
| POST · DELETE | `/v1/mobile/push/token` | any |
| GET | `/v1/mobile/notifications` | any |
| GET | `/v1/mobile/notifications/unread-count` | any |
| PATCH | `/v1/mobile/notifications/read-all` | any |
| PATCH | `/v1/mobile/notifications/:id/read` | any |
| GET · PUT | `/v1/mobile/notification-preferences` | any |
| GET | `/v1/mobile/permissions` | student |
| GET | `/v1/mobile/permissions/summary` | student |
| GET | `/v1/mobile/permissions/:id` | student |
| POST | `/v1/mobile/permissions/submit` | student |
| POST | `/v1/mobile/permissions/:id/cancel` | student |
| GET | `/v1/mobile/curfew` | student |
| GET | `/v1/mobile/parent/children` | parent |
| GET | `/v1/mobile/parent/children/:studentId` | parent |
| GET | `/v1/mobile/parent/children/:studentId/guardians` | parent |
| GET | `/v1/mobile/parent/children/:studentId/late-entries` | parent |
| POST | `/v1/mobile/parent/late-entries/:id/acknowledge` | parent |
| POST | `/v1/mobile/parent/emergencies` | parent |
| GET | `/v1/mobile/parent/permissions` | parent |
| GET | `/v1/mobile/parent/permissions/:id` | parent |
| POST | `/v1/mobile/parent/permissions/:id/decision` | parent |
| GET | `/v1/mobile/warden/permissions` | warden |
| POST | `/v1/mobile/warden/permissions/:id/decision` | warden |
| POST | `/v1/mobile/warden/permissions/:id/activate` | warden |
| POST | `/v1/mobile/warden/permissions/:id/resolve-escalated` | warden |
| GET | `/v1/mobile/warden/dashboard` | warden |
| GET | `/v1/mobile/profile-requests/fields` | any (linked account) |
| GET · POST | `/v1/mobile/profile-requests` | any (linked account) |
| GET | `/v1/mobile/profile-requests/:id` | any (linked account) |
| GET | `/v1/mobile/admin/stats` | admin, warden |
| GET | `/v1/mobile/admin/activity` | admin, warden |
| GET | `/v1/mobile/admin/permissions` | admin, warden |
| GET | `/v1/mobile/admin/permissions/export` | admin, warden |
| GET | `/v1/mobile/admin/permissions/:id` | admin, warden |
| POST | `/v1/mobile/admin/permissions/:id/override` | admin, warden |
| GET | `/v1/mobile/admin/profile-requests` | admin, warden |
| GET | `/v1/mobile/admin/profile-requests/export` | admin, warden |
| POST | `/v1/mobile/admin/profile-requests/:id/approve` | admin, warden |
| POST | `/v1/mobile/admin/profile-requests/:id/reject` | admin, warden |
| GET · POST | `/v1/mobile/admin/announcements` | admin, warden |
| GET | `/v1/mobile/admin/reports` | admin, warden |
| GET | `/v1/mobile/admin/roles` | admin, warden |
| PUT | `/v1/mobile/admin/users/:userId/role` | admin |
| GET | `/v1/mobile/admin/emergencies` | admin, warden |
| POST | `/v1/mobile/admin/emergencies/:id/resolve` | admin, warden |
| GET · POST | `/v1/mobile/admin/groups` | admin, warden |
| GET | `/v1/mobile/admin/groups/:id` | admin, warden |
| POST | `/v1/mobile/admin/groups/:id/branding` | admin, warden |
| GET | `/v1/mobile/admin/roster` | admin, warden |

---

## 11. Warden queue (the app's admin persona also has these)

Kept from the earlier mobile work and still live; `/v1/mobile/admin/*` is the richer surface.

- `GET /v1/mobile/warden/permissions?cursor=&limit=&status=` — site-scoped queue, defaults to
  `pending_warden`, `waiting_parent`, `escalated` → paginated `data`.
- `POST /v1/mobile/warden/permissions/:id/decision` — `{ "response": "approve" | "reject", "note": "" }`
  → **200**; approving kicks off the guardian approval flow. Throttled to 1 per 5s.
- `POST /v1/mobile/warden/permissions/:id/activate` → **201** the activated Permission.
- `POST /v1/mobile/warden/permissions/:id/resolve-escalated` — `{ "response": "approve", "note": "Called the parent" }`
  → logs the out-of-band guardian response.
- `GET /v1/mobile/warden/dashboard` → `{ "pendingPermissions": 5, "activePermissions": 12, "studentsOut": 3 }`

---

## 12. Not implemented

| Feature | Why |
|---|---|
| QR gate pass (`/pass`, `/issue-pass`, `/gate/scan`) | Excluded by request — a verifiable pass token needs its own signing/expiry design |
| Share sheet on the detail screen | Client-side only |
| Call warden / message student | Native dial & SMS intents; the numbers come from the ward overview |

Swagger for everything above is served at `/docs` in non-production builds.

---

## 13. Deploying this API

New tables and columns back these endpoints, so the database has to be migrated before the app
can talk to it:

```bash
cd cloud
npx prisma migrate dev --name mobile-app-features   # or: npx prisma db push
npx prisma generate
```

New tables: `notification_preferences`, `profile_change_requests`, `emergency_alerts`,
`announcements`, `app_groups`, `app_group_members`.
New columns: `students.address`, `parent_contacts.alternate_phone|email|address`,
`curfew_violations.acknowledged_at|acknowledged_by|gate_label|reason`.

Then apply the row-level-security policies for them:

```bash
psql "$DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 \
  -f cloud/prisma/migrations/post-init/004-mobile-rls.sql
psql "$DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 \
  -f cloud/prisma/migrations/post-init/005-mobile-features-rls.sql
```

Environment variables these endpoints rely on:

| Variable | Used for |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | login, password reset/change, logout |
| `SUPABASE_SERVICE_ROLE_KEY` | uploads (storage) |
| `MOBILE_UPLOAD_BUCKET` | storage bucket for attachments (default `mobile-uploads`) |
| `FIREBASE_SERVICE_ACCOUNT` | FCM push; when unset the server logs pushes instead of sending them |
| `DEFAULT_PASSWORD_SUFFIX` | Suffix for provisioned accounts' default password (`<phone>@<suffix>`). Set per deployment; falls back to `iverto` with a warning |
| `API_PREFIX` | Global route prefix. Code default `v1`; production `.env` sets `hostel/v1` |
| `SWAGGER_PREFIX` | Swagger mount point. Code default `docs`; production `.env` sets `hostel/docs` |
| `WS_PATH` | Socket.IO handshake path. Code default `/socket.io`; production `.env` sets `/hostel/socket.io` |

### Where the prefix comes from

The `/hostel` segment is a **deployment** setting, not a code default. `api.iverto.ai` fronts
two services; Caddy sends `/hostel/*` to this one on port 8031 **with the prefix intact**, so
the production `.env` puts it back on via `API_PREFIX` / `WS_PATH` / `SWAGGER_PREFIX`. Run the
backend with none of those set — as you do locally — and it serves plain `/v1/...` and
`/socket.io`. Client code should never hardcode `/hostel` anywhere except the one base URL.
