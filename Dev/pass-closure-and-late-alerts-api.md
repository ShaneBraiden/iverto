# Iverto Outpass — Closing a pass, and the late-to-hostel alert

Two halves of one rule:

1. **A warden can close a live pass by hand** — they have seen the student back on campus, so
   the pass stops being open. One new endpoint.
2. **A pass that is still open past its return time raises an alert** to the warden *and* to
   every guardian on the student's record: *your ward is late back to the hostel*. One
   scheduled sweep, plus three read-only fields on the permission object.

Companion to [`mobile-api-documentation.md`](./mobile-api-documentation.md) §3–§6 and
[`mobile-branding-api.md`](./mobile-branding-api.md). Conventions are the same throughout.

- **Base URL:** `https://api.iverto.ai/hostel` (`/devhostel` on the dev deployment),
  `http://localhost:3000` in local dev. Every path below is written from the version segment on
  (`/v1/mobile/...`) — prepend the base URL.
- **Auth:** `Authorization: Bearer <accessToken>` on every route here.
- **Content type:** `application/json` both ways.
- **Times:** every timestamp on the wire is a **full ISO 8601 instant in UTC**
  (`2026-08-31T15:30:00.000Z`), exactly as the rest of the API. There is no wall-clock
  arithmetic anywhere in this document — see § *Timezones, and why there is no timezone code*.

The mobile app is **already written against this contract** and shipped. § *What the app
already does* lists exactly what is live client-side and what each field turns on.

---

## The model

A pass that has been activated is **open**: the student is off campus and a clock is running
against `endTime`. Two things can close it.

```
                          ┌── gate scanner reads them in ──┐
   active / student_exited ┤                                ├──> completed
                          └── warden closes it by hand ─────┘
                                (POST …/end — new)

   still open when endTime passes
        └──> overdue: alert the warden + every guardian (new sweep)
             …and keep it open. Overdue is a state of an open pass,
                not a new status.
```

Three things that are deliberately **not** in this design:

- **Overdue is not a `PermissionStatus`.** The state machine already has fifteen states and
  every client switches on them. A pass past its return time is still `active` — `overdue` is a
  computed boolean beside the status, so nothing that already reads `status` has to change.
- **The sweep does not close, expire, or cancel anything.** It alerts. A student who is late is
  still out on a valid pass; deciding they are not is a human's call, made through
  `POST …/end` or the existing admin override.
- **The sweep does not write a `LateEntry`.** A late entry is the record of a *return*, and
  nobody has returned yet. It is written when the pass closes — see § *Late entries: who writes
  them, and when*.

---

## Who may call what

| Route | Who |
|---|---|
| `POST /v1/mobile/warden/permissions/:id/end` | `warden`, `admin` — scoped to a site they are assigned to |

Enforce server-side. A student's or a guardian's token reaching the route by any means is
rejected:

```json
{ "statusCode": 403, "error": "FORBIDDEN", "message": "Only a warden may close a pass." }
```

A warden whose `assignedSites` does not include the pass's `siteId` gets the same 403. An admin
is tenant-wide, as everywhere else.

---

# 1. `POST /v1/mobile/warden/permissions/:id/end`

Closes a live pass. The warden has seen the student back on campus.

### Request

```http
POST /v1/mobile/warden/permissions/cmf3k9x0000abcdef/end
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "note": "Back at the gate, train was delayed" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `note` | `string` | no | ≤ 500 characters. When the student is late this is **the reason that shows on the guardian's late-entry log**, so it is not a throwaway comment. Omit it or send `{}` for a routine on-time close. |

The app sends `{}` when the warden left the note blank — accept a body with no keys, and accept
no body at all.

### Accepted states

| Current `status` | Result |
|---|---|
| `active` | closed |
| `student_exited` | closed |
| `completed` | **200**, idempotent no-op — see below |
| anything else | **409** `PERMISSION_NOT_ACTIVE` |

`active` and `student_exited` are the same situation seen from two places: the warden activated
the pass, and the gate scanned them out. A campus whose scanner is down only ever reaches the
first, and it must still be closeable — that is the whole point of this endpoint.

### What it writes

In one transaction:

| Column | Value |
|---|---|
| `status` | `'completed'` |
| `returnTime` | `now()` |
| `closedBy` | the calling user's id |
| `closedNote` | `note`, trimmed, or `null` |
| `durationMinutes` | `returnTime − exitTime` when `exitTime` is set, else `returnTime − startTime` |
| `lateNotifiedAt` | left exactly as it is — it is the record of what was sent, not a flag to clear |

…and, **only when `returnTime > endTime`**, one `LateEntry` row (§ *Late entries*).

### Response — `200 OK`

The full permission object as every other permission route returns it, with one extra key:

```jsonc
{
  "id": "cmf3k9x0000abcdef",
  "tenantId": "…",
  "siteId": "…",
  "studentId": "…",
  "type": "day",
  "status": "completed",
  "reason": "Dentist appointment",
  "destination": "City Dental, MG Road",
  "startTime": "2026-08-31T04:30:00.000Z",
  "endTime": "2026-08-31T15:30:00.000Z",
  "exitTime": "2026-08-31T04:41:00.000Z",
  "returnTime": "2026-08-31T17:45:00.000Z",
  "durationMinutes": 784,

  "closedBy": "usr_warden_42",
  "closedNote": "Back at the gate, train was delayed",
  "overdue": false,
  "overdueMinutes": null,
  "lateNotifiedAt": "2026-08-31T15:31:07.000Z",

  // …every other Permission field, unchanged…

  "lateEntry": {
    "id": "late_9f2c…",
    "permissionId": "cmf3k9x0000abcdef",
    "date": "2026-08-31T17:45:00.000Z",
    "dueBackAt": "09:00 PM",
    "scannedInAt": "2026-08-31T17:45:00.000Z",
    "delayMinutes": 135,
    "delayLabel": "2h 15m late",
    "severity": "major",
    "reason": "Back at the gate, train was delayed",
    "resolution": null,
    "resolutionNote": null,
    "gate": null,
    "recordedBy": "usr_warden_42",
    "source": "warden",
    "acknowledged": false,
    "acknowledgedAt": null
  }
}
```

**`lateEntry` is `null` when the student was back inside the window.** The app branches on it to
decide which confirmation to show the warden — "closed, they are marked back" versus "closed,
the late return is on the record and the guardians have been told" — so it must be present and
explicitly `null` rather than omitted.

The object is returned **flat**, not wrapped in a `data` envelope, matching
`POST …/decision`, `POST …/activate` and everything else in §3–§6.

### Idempotency

Closing an already-`completed` pass is **200 with the current record and `lateEntry: null`** —
not 409, and not a second late entry. Two wardens tapping at once, or one warden on a flaky
connection tapping twice, must not put two rows on a student's file. Guard on
`status = 'completed'` inside the transaction, not before it.

### Errors

| HTTP | `error` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `note` over 500 characters |
| 401 | `UNAUTHORIZED` | no or expired token |
| 403 | `FORBIDDEN` | not a warden/admin, or the pass is at a site they are not assigned to |
| 404 | `NOT_FOUND` | no such pass in the caller's tenant |
| 409 | `PERMISSION_NOT_ACTIVE` | the pass is in a state that cannot be closed |
| 429 | `TOO_MANY_REQUESTS` | more than one close per pass per 5s, matching `…/decision` |

`PERMISSION_NOT_ACTIVE` is a **new code**. Add it to the documented set. The app already lists
it in `ApiErrorCode` and branches on it, and an unrecognised code falls through to the server's
own `message` regardless — so the endpoint can ship before or after any client release. Make
that message readable, because it is what the warden sees:

```json
{
  "statusCode": 409,
  "error": "PERMISSION_NOT_ACTIVE",
  "message": "This pass is not open — it was cancelled on 30 Aug."
}
```

### Who gets told

On a successful close, notify (§ *Notifications* for the payload shape):

| Recipient | Event | Why |
|---|---|---|
| the student | `PASS_CLOSED` | their pass is finished |
| every guardian on the student's record | `PASS_CLOSED` | closes the loop on an alert they may have received |
| every guardian, additionally | `LATE_ENTRY` | **only when a late entry was written** |

The warden who pressed the button is **not** notified — they are looking at the result.

Emit `permission:updated` on the socket with the closed permission (§ *Socket*).

---

# 2. The overdue sweep

A scheduled job. This is the half that answers *"the warden didn't close it, so tell everyone"*.

### What it looks for

Every **60 seconds** (anything up to 5 minutes is fine; the alert carries the real overdue
figure, not the tick it was found on):

```sql
SELECT * FROM "Permission"
WHERE status IN ('active', 'student_exited')
  AND "endTime" IS NOT NULL
  AND "endTime" <= now() - (:graceMinutes || ' minutes')::interval
  AND "lateNotifiedAt" IS NULL
```

`graceMinutes` defaults to **0** — the requirement is *on or before the end time of the pass*.
Expose it as `LATE_ALERT_GRACE_MINUTES` (env, or a per-tenant setting) for a campus that wants a
five-minute cushion before it starts calling parents. Leave it at 0 unless asked.

`endTime IS NULL` is skipped rather than guessed at. A pass with no return time has no deadline
to be late against, and inventing one from `startDate` is how you wake a family at 2 a.m. over a
data-entry gap.

### What it does per row

One transaction per permission:

1. Set `lateNotifiedAt = now()`.
2. Send to **the wardens of the pass's site** — every user with role `warden` whose
   `assignedSites` includes `permission.siteId`. Fall back to the tenant's admins when a site
   has no warden assigned, so the alert is never sent into a void.
3. Send to **every `ParentContact` on the student's record**, not only the approver who signed
   off on this pass. Both parents want to know their child is not back.
4. Write an `AppNotification` row for each recipient with an app account, so the alert is in the
   in-app inbox and not only in the push tray.

**Order matters:** write `lateNotifiedAt` first, inside the transaction, and send after it
commits. A crash mid-fan-out then costs one undelivered alert; the other order costs a family a
notification every sixty seconds until someone restarts the worker.

`lateNotifiedAt` is the only thing preventing a repeat. Do not derive "have I sent this" from
the notification table.

### Recipients who have no app

A guardian with `hasAppAccount: false` has no device token. Route them through whatever the
tenant already uses for parent contact — SMS or WhatsApp, the same path
`parent_unreachable` escalation uses. If a tenant has neither configured, log it and move on;
the warden was still told, and the warden is the one who can act.

### Repeat reminders — optional, off by default

Not required for this feature. If a campus asks for it later:

- add `lateAlertCount INT NOT NULL DEFAULT 0`;
- widen the query to `lateNotifiedAt <= now() - (:repeatMinutes)` and
  `lateAlertCount < :maxAlerts`;
- bump both columns in the same transaction.

Suggested when it is turned on: repeat every 60 minutes, at most 3 times. Silence after that —
a fourth push at 3 a.m. teaches people to mute the app, and by then this is a phone call.

### `overdue` and `overdueMinutes` on reads

Computed on every read of a permission, by every route that returns one (`/permissions`,
`/permissions/:id`, `/permissions/summary`, `/parent/permissions`, `/parent/children/:id`,
`/warden/permissions`, `/admin/permissions`, `/admin/permissions/:id`):

```ts
const open = status === 'active' || status === 'student_exited';
const late = open && endTime != null && endTime <= now;

overdue        = late;                                          // boolean, never null
overdueMinutes = late ? Math.floor((now - endTime) / 60_000) : null;
```

They are **derived, not stored** — a stored copy is stale the moment the clock moves. They are
independent of `lateNotifiedAt`: a pass is overdue the second it passes `endTime`, whether or
not the sweep has run yet.

`GET /admin/stats` already returns `overdue`. Make it count exactly the rows the first
predicate above matches, so the tile on the overview and the red rows in the list agree.

---

# 3. Late entries: who writes them, and when

A `LateEntry` records **a return that happened after the due-back time**. It is written by
whoever closes the pass:

| Closed by | `source` | `recordedBy` | `gate` |
|---|---|---|---|
| gate scanner | `"gate"` | the scanner's operator, or null | the gate id |
| `POST …/end` | `"warden"` | the warden's user id | `null` |

`source` is a new optional field on the `LateEntry` object. The app treats it as optional and
does not branch on it today; it exists so the guardian's log can eventually say *"the warden
signed them in"* rather than implying a scan that never happened.

**Nothing writes a late entry for a student who never comes back.** There is no return to
record. That case is covered by the alert, by `overdue` staying true, and by the pass staying
open and visible in the warden's list until a human deals with it. Resist the temptation to open
a `LateEntry` with `scannedInAt: null` — the guardian's screen is built around *expected vs
actual*, and a row with no actual reads as a bug.

### Field rules on a warden-written entry

| Field | Value |
|---|---|
| `date` | the return instant |
| `dueBackAt` | the pass's `endTime`, rendered as the site's local wall clock (`"09:00 PM"`) — the app prints it verbatim |
| `scannedInAt` | the return instant (same as `returnTime`) |
| `delayMinutes` | `returnTime − endTime`, in whole minutes |
| `delayLabel` | server-rendered (`"2h 15m late"`); the app falls back to formatting `delayMinutes` when it is null |
| `severity` | `"minor"` under 60 minutes, `"major"` at or over — or the tenant's own threshold, if one exists |
| `reason` | the warden's `note`, or `null` |
| `resolution` / `resolutionNote` | `null` — the warden closing the gate is not the same as the office deciding what to do about it |
| `acknowledged` | `false`; the existing `POST /parent/late-entries/:id/acknowledge` clears it |

Bump `WardDetail.openViolations` and the `unacknowledged` counter on
`GET /parent/children/:id/late-entries` accordingly — both already exist and both already drive
UI.

---

# 4. Notifications

Three event types. Two are new.

| `type` | To | When |
|---|---|---|
| `PASS_OVERDUE` | wardens of the site + every guardian | the sweep fires |
| `PASS_CLOSED` | the student + every guardian | a warden closes a pass |
| `LATE_ENTRY` | every guardian | *existing type* — a late entry was written |

`LATE_TO_HOSTEL` is accepted by the app as a synonym for `PASS_OVERDUE`, but prefer
`PASS_OVERDUE`; one name is better than two.

### Payload

Both the FCM message and the `AppNotification` row:

```jsonc
{
  "type": "PASS_OVERDUE",
  "title": "Late back to the hostel",
  "body": "Priya Sharma (21CS042) was due back at 09:00 PM and has not been marked in. The pass is still open.",
  "permissionId": "cmf3k9x0000abcdef",
  "data": {
    "type": "PASS_OVERDUE",
    "uri": "iverto://permissions/cmf3k9x0000abcdef",
    "permissionId": "cmf3k9x0000abcdef",
    "studentId": "stu_…",
    "overdueMinutes": "17"
  }
}
```

Four things the client depends on:

- **`uri: iverto://permissions/<id>`** — `lib/push.ts#routeForUri` turns this into the pass
  screen with the reader's own role attached. A warden lands on the screen with the *Close pass*
  button; a guardian lands on the same pass scoped to what they may see. Without the `uri` the
  tap just opens the app.
- **Every `data` value must be a string.** FCM will not accept anything else, and
  `overdueMinutes: 17` silently drops the whole message.
- **`channel_id: "default"`** on Android. The channel is created by the app before the first
  push; a mismatch delivers silently with no heads-up banner.
- **Write real `title` and `body` prose.** The app has fallback copy for `PASS_OVERDUE` and
  `PASS_CLOSED` in `lib/notificationText.ts` and will rewrite a bare event code into something
  readable — but the fallback cannot name the student or the time, and those are the two things
  that make the alert worth waking up for.

### Suggested copy

Same event, two audiences — write both, they are not interchangeable.

**To the warden** — they need to identify and find the student:

> **Late back to the hostel**
> Priya Sharma (21CS042, Room B-204) was due back at 09:00 PM and has not been marked in. The pass is still open.

**To the guardian** — they need to know what is being done:

> **Late back to the hostel**
> Priya was due back at the hostel by 09:00 PM and has not been marked in yet. The warden has been alerted.

**`PASS_CLOSED`, to the student and guardians:**

> **Back on campus**
> The warden has marked Priya returned at 11:15 PM and closed the pass.

Do not put an overdue figure in a guardian's title. "Late back to the hostel" is the news;
"137 minutes" is detail, and a lock-screen title is not where a parent should read it.

---

# 5. Socket

`permission:updated`, on the existing `/mobile` namespace, carrying the full permission object —
same event the approval chain already uses, so the app needs no new listener and every screen
that calls `useLivePermissions` refreshes on its own.

Emit it:

- when a pass is closed by `POST …/end`;
- when the sweep marks a pass overdue, to the student, their guardians and the site's wardens.

The second one is what turns the warden's list red without them pulling to refresh.

---

# 6. Schema

Prisma; adapt to whatever the migration tooling is.

```prisma
model Permission {
  // …existing fields…

  /// Warden who closed the pass by hand. Null when a gate scan closed it.
  closedBy       String?
  /// What the warden typed on closing. Becomes LateEntry.reason when late.
  closedNote     String?   @db.VarChar(500)
  /// When the overdue alert was sent. The sweep's only guard against repeats.
  lateNotifiedAt DateTime?

  @@index([status, endTime, lateNotifiedAt])   // the sweep's query
}

model LateEntry {
  // …existing fields…

  /// 'gate' | 'warden' | 'system'
  source String @default("gate")
}
```

`overdue` and `overdueMinutes` are **not** columns — they are computed in the serializer.

The composite index is the one thing here worth benchmarking: the sweep runs every minute
against the whole permission table, and without it that is a sequential scan per tick forever.

---

# 7. Timezones, and why there is no timezone code

Every comparison in this document is between two UTC instants — `endTime` and `now()`. Neither
depends on the site's timezone, and no part of the sweep needs to know what "9 p.m." means
locally.

The timezone matters in exactly one place: **rendering** `dueBackAt` on a `LateEntry`, which is
a wall-clock string the app prints verbatim (`"09:00 PM"`). Use `Site.timezone`, which is
already on the site record and already returned by `GET /me`.

This is worth stating because the obvious-looking bug is to compare a stored local time against
`now()` and alert every student on the campus at the wrong hour, twice a year.

---

# 8. What the app already does

Shipped and live against this contract. Nothing below needs a client release.

| Client behaviour | Turned on by |
|---|---|
| **Close pass** button on the pass detail screen, for `warden`/`admin`, on `active` and `student_exited` passes | `POST …/end` existing |
| Confirmation sheet with an optional note — worded as *"reason for the delay"* when the pass is already overdue | — |
| Confirmation naming whether a late return was recorded | `lateEntry` on the response |
| Red "Overdue by 2h 15m" banner on the pass screen, for all three roles | `overdue` / `overdueMinutes`, or fallback |
| Red overdue row on every pass card in the warden's list | same |
| Guardian's ward screen turns the *Out on…* strip red with the overdue figure | same |
| *"Marked returned"* instead of *"Scanned in"* on a hand-closed pass | `closedBy` |
| The warden's note shown on the pass as *"On return: …"* | `closedNote` |
| Readable title and body for `PASS_OVERDUE` / `PASS_CLOSED` pushes that arrive as bare event codes | — |
| Tapping a push opens the pass, scoped to the reader's role | `data.uri` |
| **Overdue** and **Currently out** tiles on the admin overview open the pass list filtered to active | `AdminStats.overdue` existing |

**The app degrades cleanly against a server that has shipped none of this.** `overdue` and
`overdueMinutes` are optional in the client's types: when they are absent it compares `endTime`
against the device clock and marks the same passes. The only thing it genuinely cannot do
without the backend is send the alert — which is the whole point of the sweep.

One consequence worth naming: until the sweep ships, the app's overdue banner says *"the warden
and the guardians have been alerted"* on the strength of a client-side clock comparison. That
sentence becomes true when § 2 lands. It is the one place the client is ahead of the server, and
it is why § 2 is not optional.

---

# 9. Test checklist

**Closing**

- [ ] `active` pass closes → `completed`, `returnTime` set, `closedBy` set.
- [ ] `student_exited` pass closes the same way.
- [ ] Closing before `endTime` → `lateEntry: null`, no row written.
- [ ] Closing after `endTime` → one `LateEntry`, `delayMinutes` correct to the minute,
      `severity` right either side of the 60-minute line, `reason` = the warden's note.
- [ ] Closing twice → second call is 200, `lateEntry: null`, still exactly one late-entry row.
- [ ] Two simultaneous closes → one row. Test it with real concurrency, not two sequential calls.
- [ ] `pending_warden` / `cancelled` / `expired` → 409 `PERMISSION_NOT_ACTIVE` with readable prose.
- [ ] Warden at another site → 403. Guardian's token → 403. Student's token → 403.
- [ ] `note` at 501 characters → 400 `VALIDATION_FAILED`.
- [ ] Student and guardians get `PASS_CLOSED`; the closing warden does not.

**The sweep**

- [ ] Pass one minute past `endTime` → alert to every site warden and every guardian on the
      student's record, not only the approver.
- [ ] Next tick → **nothing**. Then twenty ticks → still nothing. `lateNotifiedAt` holds.
- [ ] `endTime IS NULL` → never alerts.
- [ ] `completed` / `cancelled` / `expired` → never alerts.
- [ ] A pass closed between two ticks → no alert fires afterwards.
- [ ] Worker killed mid-fan-out, restarted → at most one duplicate, never a loop.
- [ ] Site with no warden assigned → the tenant's admins receive it.
- [ ] Guardian with `hasAppAccount: false` → routed to SMS/WhatsApp, not silently dropped.
- [ ] `LATE_ALERT_GRACE_MINUTES=15` → nothing at +1, alert at +16.

**Reads**

- [ ] `overdue: true` and a correct `overdueMinutes` on every route that returns a permission.
- [ ] `overdue: false`, `overdueMinutes: null` on a `completed` pass, however late it closed.
- [ ] `GET /admin/stats.overdue` equals the number of red rows in `GET /admin/permissions`.
- [ ] Every `data` value in the push is a string; `overdueMinutes` included.
- [ ] Tapping the push opens the pass — as a warden, and as a guardian.

**Push, end to end, on a real Android device**

- [ ] Alert arrives with a heads-up banner (`channel_id: "default"`), app backgrounded.
- [ ] Title and body read as prose, and name the student and the time.
- [ ] The in-app inbox shows the same alert with the same wording.
