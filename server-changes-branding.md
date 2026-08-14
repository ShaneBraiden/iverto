# Iverto Outpass — server changes for multi-university branding

Written as a contract for the backend, in the same style and against the same base URL
(`https://api.iverto.ai/devhostel` + `/v1/mobile/...`) with the same error envelope.

The model this assumes, from the product side:

- **One university = one tenant.** `AuthUser.tenantId` already carries it.
- **Each tenant has an admin** (`role: "admin"`) who owns groups and branding for that
  university.
- **Wardens** (`role: "warden"`) are site-scoped and work the pass queue. They **cannot**
  create groups or change branding.
- Branding reaches **students and their guardians** — a parent sees their ward's mark.

The app is already wired for all of this. Items 1–3 are required for it to be correct;
4 and 5 are optimisations it degrades cleanly without.

| # | Change | Status |
|---|---|---|
| 1 | Enforce admin-only on the group/branding/roster routes | **Required** — security |
| 2 | Resolve `GET /me/branding` for parents via their ward | **Required** — feature is dead for parents without it |
| 3 | Scope groups and roster to the caller's tenant | **Required** — multi-tenancy |
| 4 | Send `iconUrl` beside `iconKey` | Optional — removes one call per icon |
| 5 | `branding:updated` socket event | Optional — live update instead of relaunch |

---

## 1. Admin-only enforcement

The app now hides the Groups tab and the branding editor from wardens, and redirects them
if they reach the route by deep link. **That is presentation, not enforcement** — a warden's
token still works against these routes today. The server has to reject them.

| Route | Who may call it |
|---|---|
| `POST /v1/mobile/admin/groups` | `admin` only |
| `POST /v1/mobile/admin/groups/:id/branding` | `admin` only |
| `GET /v1/mobile/admin/groups` | `admin` only |
| `GET /v1/mobile/admin/groups/:id` | `admin` only |
| `GET /v1/mobile/admin/roster` | `admin` only |

**403** with the envelope the app already branches on:

```json
{ "statusCode": 403, "error": "FORBIDDEN", "message": "Only an organisation admin can manage groups." }
```

`FORBIDDEN` is already in the client's `ApiErrorCode` union, so the `message` is shown to the
user as-is. Write something a warden can act on.

`GET /admin/roster` is on the list because it returns every student on campus with their group
membership, and the branding editor is its only caller in this app.

---

## 2. `GET /v1/mobile/me/branding` must answer for parents

This is the one that blocks the feature. Today the endpoint resolves branding from group
membership, and `Group.members` holds **student IDs only** — so a parent has no membership to
match and gets `isDefault: true` forever. The admin brands a group, the students see it, and
the guardians the branding was also meant for see the stock Iverto lockup.

The app cannot fix this: it calls `/me/branding` for whoever is signed in and renders the
answer. The resolution has to happen server-side.

Required behaviour by role:

| Caller | Resolves to |
|---|---|
| `student` | Their own group's branding (already works) |
| `parent` | The branding of the group their ward belongs to |
| `warden`, `admin` | Default (`isDefault: true`) |

**The case that needs a decision: a parent with more than one ward, in different groups.**

Recommended rule — *all wards agree, or default*:

- One ward, or several that all sit in the same group → that group's branding.
- Wards in different groups → `isDefault: true`.

It is deterministic, needs no new parameter, and never shows a guardian the wrong
university's mark. The alternative — following the ward switcher in the parent dashboard —
means adding `GET /me/branding?studentId=...` and re-fetching on every switch; worth doing
later if guardians with wards in two universities turn out to be common, but it is not worth
the churn now.

Response shape is unchanged — the existing `Branding` object, just correctly populated.

---

## 3. Tenant scoping

With several universities on one deployment this is load-bearing, and it is worth stating
explicitly even if it already holds:

- `GET /admin/groups`, `GET /admin/groups/:id`, `GET /admin/roster` return **only** rows
  belonging to the caller's `tenantId`.
- `POST /admin/groups` creates inside the caller's tenant; the client does not send a tenant
  and must not be trusted to.
- `POST /admin/groups/:id/branding` **404s** for a group in another tenant — not 403, which
  would confirm the group exists.
- `memberStudentIds` in the branding payload is rejected if any ID is outside the tenant.
  This one matters: the field **replaces** the roster, so an ID from another university would
  otherwise silently pull a student into a foreign group.

---

## 4. `iconUrl` beside `iconKey` — optional

The uploaded icon comes back as a storage key, and the only way to render it is
`GET /uploads/signed-url?key=...`, which returns a link valid for **five minutes**. That is a
poor fit for an app icon:

- One extra round trip on every launch before the header mark can draw.
- One per row in the admin's groups list — an N+1 the client currently pays.
- Five minutes is shorter than a session, so a link can expire while the app is open.

Adding an optional `iconUrl` beside `iconKey` on these three responses removes all of it:

- `GET /v1/mobile/me/branding`
- `GET /v1/mobile/admin/groups` (per row)
- `GET /v1/mobile/admin/groups/:id`

```json
{
  "iconKey": "grp/9f2c.../icon.png",
  "iconUrl": "https://cdn.iverto.ai/grp/9f2c.../icon.png"
}
```

The client already prefers `iconUrl` when present and falls back to resolving `iconKey`
otherwise (`lib/useSignedUrl.ts`), so this can ship whenever — nothing breaks while it is
absent.

A **long-lived or public** URL is what makes this worth doing. Group icons are not sensitive:
they are a logo the university wants on the screen. A 5-minute signed link here just
reintroduces the expiry problem one layer down.

---

## 5. `branding:updated` socket event — optional

Branding is fetched once per session, so a rebrand lands on the member's next app launch.
The socket already carries `notification:new` and `permission:updated` on the `/mobile`
namespace; a third event would let an open app pick up a rebrand immediately:

```
branding:updated  →  the Branding object, same shape as GET /me/branding
```

Emit to the affected students **and their guardians** when
`POST /admin/groups/:id/branding` succeeds — including the students the write *removed* from
the group, who need the payload with `isDefault: true` to fall back.

Related: `Branding.version` is in the response and nothing reads it today. If you bump it on
every branding write it becomes the cache key that makes this reliable, so it is worth keeping
accurate either way.

---

## Not a server change: the launcher icon

Worth recording, because the branding editor used to claim otherwise and the copy has been
corrected.

**No endpoint can change the app icon on the home screen.** iOS alternate icons and Android
activity-aliases must be declared inside the binary at build time; the OS can only switch
between icons that shipped with the app. An admin uploading a PNG can never have it become a
launcher icon, no matter what the API returns.

What branding changes today is the **in-app** mark and app name — the header on every
dashboard, for the student and their guardians. That works for any number of universities with
no build changes, which is why it is what got built.

Real launcher icons need a build-time decision, not an API:

- **All universities in one binary** — every icon ships in the app, the server assigns one.
  Adding a university means a store release.
- **A build per university** — separate app entries, each with its own icon.

Both are product/release decisions. Neither is blocked by anything in this document.
