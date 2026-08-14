# Iverto Outpass — server changes for notifications

Written as a contract for the backend, in the same style and against the same base URL
(`https://api.iverto.ai/devhostel` + `/v1/mobile/...`) with the same error envelope. Companion
to `Dev/fcm-integration.md` §9, which specifies the FCM envelope; this specifies what goes
*inside* it.

Two bugs, both only fixable at the sender:

| # | Change | Status |
|---|---|---|
| 1 | `title` / `body` must be prose, never an event code | **Required** — every push currently reads `parent_decided` |
| 2 | `contact_warden` must actually notify the warden | **Required** — documented behaviour that does not happen |
| 3 | Emit the event code in `data.type` as well as `type` | Optional — the app already falls back |

The app ships a client-side mitigation for #1 (below) so installed builds are readable today.
It cannot mitigate #1 for a backgrounded app, and it cannot mitigate #2 at all.

---

## 1. Notification title and body

### The bug

A guardian's lock screen currently reads:

```
parent_decided
```

That is the event code, used as the notification title. It reaches the reader in three
places, and the server is the only common source for all three:

- the FCM tray banner (`message.notification.title` / `.body`)
- the inbox row (`GET /v1/mobile/notifications` → `title` / `body`)
- the socket payload (`notification:new`, the same object)

`mobile-api-documentation.md` §8 already shows the shape being done correctly —
`"title": "Permission Approval Request"`, `"body": "Permission request for Doctor visit
requires your approval"` — so this is some senders bypassing that, not a missing design.

### The rule

**`type` is the code. `title` and `body` are English.** No notification may carry a value in
`title` or `body` that matches `^[A-Za-z0-9]+([_.-][A-Za-z0-9]+)+$` or `^[A-Z0-9_]+$`. If a
sender has no copy for an event, it has no business sending the notification.

`body` should name the student and the reason wherever the record has them — that is what
makes the difference between a notification that can be acted on from the lock screen and one
that has to be opened.

### The copy

Baseline title per event, and the body pattern to fill in. Where the server sends better —
naming the student, the reason, the time — it wins; the app never overrides a real string.

| `type` | Title | Body |
|---|---|---|
| `PARENT_APPROVAL_REQUEST` | Approval needed | `{student} has requested a pass for {reason}. Tap to approve or decline.` |
| `PARENT_DECIDED` | Guardian has responded | `{guardian} has responded to {student}'s request for {reason}.` |
| `PARENT_APPROVED` | Guardian approved the pass | `{guardian} approved {student}'s request for {reason}.` |
| `PARENT_REJECTED` | Guardian turned the pass down | `{guardian} declined {student}'s request — "{note}"` |
| `PARENT_CONTACT_WARDEN` | Guardian wants to speak to the warden | see §2 |
| `PARENT_UNREACHABLE` | Guardian could not be reached | `Nobody has reached {guardian} about {student}'s request.` |
| `WARDEN_APPROVAL_REQUEST` | New pass request | `{student} ({room}) has requested a pass for {reason}.` |
| `WARDEN_APPROVED` | Warden cleared the pass | `The warden cleared {student}'s request. It is now with the guardian.` |
| `WARDEN_REJECTED` | Warden turned the pass down | `The warden declined {student}'s request — "{note}"` |
| `ESCALATED` | Request escalated to the warden | `{guardian} has not responded to {student}'s request. Please call them.` |
| `CONTACT_PARENT` | Guardian is being contacted | `The office is contacting {guardian} about {student}'s request.` |
| `PERMISSION_ACTIVATED` | Pass is active | `{student}'s pass is live until {endTime}.` |
| `STUDENT_EXITED` | Scanned out at the gate | `{student} left campus at {time}.` |
| `COMPLETED` | Back on campus | `{student} scanned back in at {time}.` |
| `EXPIRED` | Pass expired | `{student}'s pass for {reason} was never used.` |
| `CANCELLED` | Pass cancelled | `{student} cancelled the request for {reason}.` |
| `PERMISSION_OVERRIDE` | Pass status overridden | `{admin} set {student}'s pass to {status} — "{note}"` |
| `LATE_ENTRY` | Late return recorded | `{student} returned {delayLabel} at {time}.` |
| `ANNOUNCEMENT` | *the announcement's own title* | *the announcement's own body* |
| `PROFILE_REQUEST_APPROVED` | Profile change approved | `Your change to {field} has been applied.` |
| `PROFILE_REQUEST_REJECTED` | Profile change declined | `Your change to {field} was not applied — "{note}"` |
| `EMERGENCY` | Emergency alert | `{guardian} raised a {category} alert for {student}. Call back on {phone}.` |

Codes are matched case- and separator-insensitively by the client, so `parent_decided`,
`PARENT_DECIDED` and `parent.decided` are one event as far as the app is concerned. Pick one
and stay with it; `SCREAMING_SNAKE` is what the documented examples use.

### The FCM envelope

Unchanged from `Dev/fcm-integration.md` §9, restated because it is the same send:

```jsonc
{
  "message": {
    "token": "<device token>",
    "notification": { "title": "Guardian has responded", "body": "Asha's father approved …" },
    "data": {
      "permissionId": "ckp1...",
      "type": "PARENT_DECIDED",
      "uri": "iverto://permissions/ckp1..."
    },
    "android": { "priority": "high", "notification": { "channel_id": "default" } }
  }
}
```

The `notification` block and the inbox row must carry **the same** `title` and `body`. They
are two views of one event and a reader sees both.

### What the app does until this lands

`lib/notificationText.ts` recognises a code in `title` and swaps in the copy above:

- **Inbox rows** — fixed, `app/notifications.tsx` renders through `notificationCopy()`.
- **Foreground pushes** — fixed, `foregroundBehaviour()` in `lib/push.ts` suppresses the
  banner and re-posts it with readable copy and the original `data` intact.
- **Backgrounded or killed** — **not fixable.** Android draws that notification itself, from
  the `notification` block, before any JS runs. This is the majority case and the reason
  this document exists.

The mitigation is deliberately conservative: anything with a space in it is treated as real
copy and passed through untouched. Fixing the sender costs the app nothing.

---

## 2. `contact_warden` must notify the warden

### The bug

`mobile-api-documentation.md` §"POST /v1/mobile/parent/permissions/:id/decision" states:

> `contact_warden` also alerts the warden.

It does not. A guardian taps **Talk to the warden first**, the app reports "The warden has
been alerted and will call you", and nothing reaches any warden — not a push, not an inbox
row, not a badge. The request sits in `waiting_parent` and the guardian waits for a call that
was never requested of anybody.

This is the one decision of the three that exists *because* the guardian does not want to
decide alone, so silence here is worse than silence on the other two.

### Required behaviour

On `POST /v1/mobile/parent/permissions/:id/decision` with `{ "response": "contact_warden" }`:

1. **Create a notification row** for every warden assigned to the ward's site — the same set
   `POST /parent/emergencies` already pushes to, so the recipient query exists.
2. **Push it**, same envelope as §1, `priority: "high"`.
3. **Write the audit entry** as `PARENT_CONTACT_WARDEN`. `constants/config.ts` already maps
   that action to an icon, so it will draw correctly in the admin activity feed the moment it
   starts arriving.

```jsonc
{
  "type": "PARENT_CONTACT_WARDEN",
  "permissionId": "ckp1...",
  "title": "Guardian wants to speak to the warden",
  "body": "Asha Verma's guardian (father, +91 90000 00000) has asked to talk before deciding on the request for Doctor visit.",
  "data": {
    "permissionId": "ckp1...",
    "type": "PARENT_CONTACT_WARDEN",
    "uri": "iverto://permissions/ckp1..."
  }
}
```

The guardian's **callback number** in the body is the point of the whole notification — a
warden who has to go and look it up will not make the call. Use the `ParentContact.phone` of
the guardian who took the action.

### The `note`

The app now always sends one:

> The guardian has asked to speak to the warden before deciding on this request.

(`CONTACT_WARDEN_NOTE` in `constants/config.ts`.) Store it as the decision evidence like any
other note, so it appears on the timeline and on the student's copy of the request. If a
future build lets the guardian type their own reason, it arrives in the same field — do not
special-case the fixed string.

### What the status must not do

`contact_warden` is **not a decision**. The request stays `waiting_parent` and the guardian
keeps both buttons: they asked to talk, not to hand the decision over. Repeating it must stay
a 200 (the existing idempotency rule), and it must not trip
`PERMISSION_ALREADY_DECIDED` for a subsequent `approve` or `reject` from the same guardian.

If the current implementation moves the row into `contact_parent` or `escalated`, that is a
second bug — both of those mean "the guardian is not responding", which is the opposite of
what happened here.

---

## 3. `data.type` beside `type` — optional

The inbox row carries `type` at the top level and the push carries it in `data`. Senders that
populate only one of them force the client to guess from the title, which is exactly the
guessing this document is trying to remove. Emitting it in both costs one line and makes the
event unambiguous in every transport.

The app reads, in order: `type`, `data.type`, `data.event`, then the title if — and only if —
the title is a code. Any one of them is enough.
