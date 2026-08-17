# Iverto Outpass — Branding API

Everything the app needs for multi-university branding: the admin's group/branding editor, and
the one call a member's device makes to find out which mark to render.

Companion to [`mobile-api-documentation.md`](./mobile-api-documentation.md) §7 — this document
is the full contract for these endpoints, written against the state of the backend as
implemented. Conventions (base URL, auth header, pagination, error envelope) are the same.

- **Base URL:** `https://api.iverto.ai/hostel`, `http://localhost:3000` in local dev. Every
  path below is written from the version segment on (`/v1/mobile/...`, `/v1/tenants/...`) —
  prepend the base URL.
- **Auth:** `Authorization: Bearer <accessToken>` on all of them.
- **Content type:** `application/json`, except the two image uploads (`multipart/form-data`).

---

## ⚠️ If you have already built against this doc, read this first

Branding used to resolve in two layers — a group's mark, or the stock Iverto lockup. There is
now a third in between: **the organisation's own logo**, set from the web dashboard. Resolution
is **group → organisation → stock**.

One consequence needs a client change:

> **`groupId: null` no longer means "show the stock lockup".**
> It used to be safe to treat a null `groupId` as the default payload, because the only branding
> that existed belonged to a group. Organisation branding arrives with `groupId: null` **and**
> `isDefault: false` — a real logo, not owned by any cohort.
>
> **Branch on `isDefault` only.** If any code keys off `groupId`, `groupName`, or "did I get a
> group back" to decide whether to draw the built-in mark, it will now show the stock lockup to
> organisations that have uploaded a logo.

Two smaller changes:

- **Wardens and admins are no longer always unbranded.** They sit in no cohort, so they never get
  group branding, but they do work for the university and now receive its mark. A screen that
  assumed staff always render the stock lockup will change appearance.
- **`iconUrl` is now safe to cache by URL indefinitely** (§ `iconUrl` vs `iconKey`). Image URLs
  are immutable — a new logo is always a new URL.

Everything else is unchanged: same endpoint, same object shape, same socket event.

---

## The model

- **One university = one tenant.** `AuthUser.tenantId` carries it; the client never sends it and
  is never trusted to.
- **A tenant's `admin`** owns that university's groups and branding.
- **A `warden`** works the pass queue. Wardens cannot read the roster or touch groups
  (§ *Who may call what*).
- **A group's branding reaches its students *and their guardians*.** `AppGroup.members` holds
  student IDs only; a parent has no membership row, so the server resolves theirs through the
  ward (§ `GET /me/branding`).
- **Under the group sits the organisation.** A tenant has one logo and one app name of its own,
  set from the web dashboard (§ *Organisation branding*). A member in no branded group gets that
  instead of the stock lockup, so an organisation can brand its whole campus without creating a
  single group.

### What branding actually changes

The **in-app** mark and app name — the header on every dashboard, for the student and their
guardians.

It does **not** change the home-screen launcher icon, and no endpoint can. iOS alternate icons
and Android activity-aliases must be declared inside the binary at build time; the OS can only
switch between icons that shipped with the app. An admin uploading a PNG can never make it a
launcher icon regardless of what the API returns. Real launcher icons need either every
university's icon shipped in one binary, or a build per university — both are release
decisions, not API ones.

---

## Who may call what

| Route | Who |
|---|---|
| `GET /v1/mobile/admin/groups` | `admin` |
| `POST /v1/mobile/admin/groups` | `admin` |
| `GET /v1/mobile/admin/groups/:id` | `admin` |
| `POST /v1/mobile/admin/groups/:id/branding` | `admin` |
| `GET /v1/mobile/admin/roster` | `admin` |
| `GET /v1/mobile/me/branding` | any signed-in user |

Every `/admin` route here is **admin-only and enforced server-side**. A warden's token — or a
student's, or a parent's, reaching the route by deep link — is rejected:

```json
{
  "statusCode": 403,
  "error": "FORBIDDEN",
  "message": "Only an organisation admin can manage groups."
}
```

`FORBIDDEN` is in the client's `ApiErrorCode` union and `message` is written to be shown to the
user as-is. The app hiding the Groups tab from wardens is presentation on top of this, not a
substitute for it.

`GET /admin/roster` is on the list because it returns every student on campus with their group
membership.

The organisation's own logo is edited through four `/v1/tenants/:id/branding` routes that the
**app never calls** — they belong to the web dashboard (§ *Organisation branding*). The app's
entire read path for branding is the single `GET /v1/mobile/me/branding` above.

### Tenant scoping

Load-bearing once several universities share the deployment:

- `GET /admin/groups`, `GET /admin/groups/:id` and `GET /admin/roster` return **only** rows in
  the caller's tenant.
- `POST /admin/groups` creates inside the caller's tenant.
- A group in another tenant **404s**, not 403 — a 403 would confirm it exists.
- `memberStudentIds` containing an ID outside the tenant **400s the whole write**. Nothing is
  applied. See `POST /groups/:id/branding`.

---

## The Branding object

Returned by `GET /me/branding` and pushed by `branding:updated`.

```json
{
  "groupId": "g_1",
  "groupName": "Block A",
  "appName": "Block A",
  "iconColors": ["#4F46E5", "#9333EA"],
  "shape": "squircle",
  "iconLabel": "BA",
  "iconKey": "t_1/group-icon/u_9/icon.png",
  "iconUrl": "https://cdn.iverto.ai/t_1/group-icon/u_9/icon.png",
  "isDefault": false,
  "version": "2026-08-06T10:00:00.000Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `groupId` | `string \| null` | `null` for organisation branding *and* for the default — **not a signal of which** |
| `groupName` | `string \| null` | `null` whenever `groupId` is |
| `appName` | `string` | never null — falls back to `"Iverto Outpass"` |
| `iconColors` | `string[]` | hex, gradient stops in order; `[]` when unset |
| `shape` | `string` | `squircle \| circle \| rounded \| square` |
| `iconLabel` | `string \| null` | ≤ 2-character monogram |
| `iconKey` | `string \| null` | storage object key; opaque — never parse it |
| `iconUrl` | `string \| null` | ready-to-render link for `iconKey` — see below |
| `isDefault` | `boolean` | **the only field that decides stock vs custom.** `true` → stock Iverto lockup |
| `version` | `string` | cache key; changes on every branding write. `"default"` when `isDefault` |

### The three payloads you will actually receive

| | `isDefault` | `groupId` | Render |
|---|---|---|---|
| Group branding | `false` | `"g_1"` | the group's mark |
| Organisation branding | `false` | `null` | the organisation's logo |
| Nothing branded | `true` | `null` | the built-in Iverto lockup |

The first two are **rendered identically** — same fields, same code path. The distinction exists
for the server's benefit, not the client's. Draw whatever you are handed whenever `isDefault` is
false, and only fall back to the bundled asset when it is true.

The default payload, in full:

```json
{
  "groupId": null, "groupName": null, "appName": "Iverto Outpass",
  "iconColors": [], "shape": "squircle", "iconLabel": null,
  "iconKey": null, "iconUrl": null, "isDefault": true, "version": "default"
}
```

An organisation-branded payload, for comparison — note `groupId` is null and `isDefault` is
still false:

```json
{
  "groupId": null, "groupName": null, "appName": "Anna Univ",
  "iconColors": ["#4F46E5", "#9333EA"], "shape": "squircle", "iconLabel": "AU",
  "iconKey": "t_1/org-logo/u_9/8f2c….webp",
  "iconUrl": "https://cdn.iverto.ai/t_1/org-logo/u_9/8f2c….webp",
  "isDefault": false, "version": "2026-08-16T12:00:00.000Z"
}
```

### Rendering an icon with no image

`iconUrl` is null whenever the branding sets colours and a monogram but no image — a perfectly
normal state, and the dashboard editor allows it. Draw `iconLabel` (uppercased, ≤ 2 chars) on a
gradient of `iconColors` in order, clipped to `shape`. With `iconColors` empty too, any brand
placeholder is fine; the reference dashboard uses its own accent gradient.

### `iconUrl` vs `iconKey`

`iconUrl` is a link the app can render directly — no `GET /uploads/signed-url` round trip on
launch, and none per row in the admin's groups list. Prefer it when present; fall back to
resolving `iconKey` when it is `null` (no icon on the group, or storage unconfigured).

Its lifetime is a deployment setting: a permanent CDN link when the storage bucket is served
publicly (`MOBILE_UPLOAD_BUCKET_PUBLIC=true`), otherwise a signed URL good for
`BRANDING_ICON_URL_TTL_SECONDS` — **7 days by default**, deliberately longer than a session so
it cannot expire with the app open.

#### Caching it

**Cache the image bytes by URL as aggressively as you like.** Every object key ends in a UUID
generated at upload time, so a URL's bytes can never change — replacing a logo always produces a
*different* URL. Objects are served with `Cache-Control: max-age=31536000`, so a normal HTTP
image cache (Coil, SDWebImage, `CachedNetworkImage`, `expo-image`) does the right thing with no
extra work, and a member re-downloads the logo only when it actually changes.

**Do not persist the URL string itself across sessions.** On a private bucket it is a signed link
that expires after its TTL; re-read `iconUrl` from the response each launch and let the image
cache deduplicate. On a public bucket the string is stable, but treating it as durable would
break the moment the deployment flips to private.

So: URL from the API every launch, bytes from the disk cache.

### `version`

Treat it as the cache key for **the branding payload**, not the image. Store it alongside the
branding you applied and re-render when it differs.

For group branding it is the group's `updated_at`, which moves on every branding write —
including a write that only changed the roster. For organisation branding it is the time the
organisation was last rebranded. It is `"default"` when `isDefault` is true. Compare it as an
opaque string; do not parse it as a date or assume it increases.

---

## 1. `GET /v1/mobile/admin/groups`

Branding groups in the caller's tenant, with member counts. Not paginated.

**Query**

| Param | Notes |
|---|---|
| `branded` | `true` → custom branding only; `false` → unbranded only; omit for all |

**200**

```json
[
  {
    "id": "g_1",
    "name": "Block A",
    "appName": "Block A",
    "iconColors": ["#4F46E5", "#9333EA"],
    "shape": "squircle",
    "iconLabel": "BA",
    "iconKey": "t_1/group-icon/u_9/icon.png",
    "iconUrl": "https://cdn.iverto.ai/t_1/group-icon/u_9/icon.png",
    "memberCount": 42,
    "hasCustomBranding": true,
    "updatedAt": "2026-08-06T10:00:00.000Z"
  }
]
```

`hasCustomBranding` is true when any of `appName`, `iconColors` or `iconKey` is set — it is
what the `branded` filter matches on.

---

## 2. `POST /v1/mobile/admin/groups`

Create a group in the caller's tenant. Branding fields are optional here; the usual flow is to
create with a name and then `POST /:id/branding`.

**Body**

```json
{
  "name": "Block A",
  "appName": "Block A",
  "iconColors": ["#4F46E5", "#9333EA"],
  "shape": "squircle",
  "iconLabel": "BA",
  "iconKey": "t_1/group-icon/u_9/icon.png"
}
```

| Field | Required | Rules |
|---|---|---|
| `name` | yes | non-empty, ≤ 60 chars, unique within the tenant |
| `appName` | no | ≤ 14 chars |
| `iconColors` | no | array of strings; defaults to `[]` |
| `shape` | no | `squircle \| circle \| rounded \| square`; defaults to `squircle` |
| `iconLabel` | no | ≤ 2 chars |
| `iconKey` | no | key from `POST /v1/mobile/uploads` with `purpose=group-icon` |

**201** the group row plus `iconUrl`:

```json
{
  "id": "g_1", "tenantId": "t_1", "name": "Block A", "appName": "Block A",
  "iconColors": ["#4F46E5", "#9333EA"], "shape": "squircle", "iconLabel": "BA",
  "iconKey": "t_1/group-icon/u_9/icon.png",
  "iconUrl": "https://cdn.iverto.ai/t_1/group-icon/u_9/icon.png",
  "createdBy": "u_9", "createdAt": "...", "updatedAt": "..."
}
```

**400** `A group with this name already exists` — duplicate name in this tenant.

---

## 3. `GET /v1/mobile/admin/groups/:id`

Group detail with its roster. **404** for a group in another tenant.

**200**

```json
{
  "id": "g_1", "tenantId": "t_1", "name": "Block A", "appName": "Block A",
  "iconColors": ["#4F46E5", "#9333EA"], "shape": "squircle", "iconLabel": "BA",
  "iconKey": "t_1/group-icon/u_9/icon.png",
  "iconUrl": "https://cdn.iverto.ai/t_1/group-icon/u_9/icon.png",
  "createdBy": "u_9", "createdAt": "...", "updatedAt": "...",
  "members": [
    { "studentId": "stu_1", "name": "Asha", "rollNumber": "CS101", "addedAt": "..." }
  ]
}
```

---

## 4. `POST /v1/mobile/admin/groups/:id/branding`

The editor's **"Apply to N"**: sets the branding and, when `memberStudentIds` is present,
**replaces** the roster with exactly that list.

**Body** — every field optional; omitted fields keep their current value.

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

> **`memberStudentIds` replaces, it does not add.** Send the group's complete intended roster.
> Sending `[]` empties the group; omitting the field leaves the roster untouched.

**200** the updated group with `memberCount` and `iconUrl`:

```json
{
  "id": "g_1", "tenantId": "t_1", "name": "Block A", "appName": "Block A",
  "iconColors": ["#4F46E5", "#9333EA"], "shape": "squircle", "iconLabel": "BA",
  "iconKey": "t_1/group-icon/u_9/icon.png",
  "iconUrl": "https://cdn.iverto.ai/t_1/group-icon/u_9/icon.png",
  "createdBy": "u_9", "createdAt": "...", "updatedAt": "...",
  "memberCount": 2
}
```

**Errors**

| Status | `error` | `message` |
|---|---|---|
| 400 | `BAD_REQUEST` | `App name must be 14 characters or fewer` |
| 400 | `BAD_REQUEST` | `Icon monogram must be 2 characters or fewer` |
| 400 | `BAD_REQUEST` | `shape must be one of: squircle, circle, rounded, square` |
| 400 | `BAD_REQUEST` | `These students are not in your organisation: stu_x, stu_y` |
| 403 | `FORBIDDEN` | `Only an organisation admin can manage groups.` |
| 404 | `NOT_FOUND` | `Group not found` — unknown id, or a group in another tenant |

A foreign student ID rejects the **whole write** and names the offending IDs; nothing is
applied, and the existing roster and branding survive intact. The field replaces the roster, so
filtering such an ID out silently would either pull a student from another university into this
group or quietly truncate the batch.

On success the server emits `branding:updated` to the affected members and their guardians —
see § *Live updates*.

---

## 5. `GET /v1/mobile/admin/roster`

Every active student in the tenant, tagged with their current branding membership. This is the
group picker's data source. Cursor-paginated.

**Query**

| Param | Notes |
|---|---|
| `q` | roll number or name, case-insensitive substring |
| `siteId` | restrict to one site |
| `cursor` | `nextCursor` from the previous page |
| `limit` | default 50 |

**200**

```json
{
  "data": [
    {
      "id": "stu_1", "name": "Asha", "rollNumber": "CS101", "roomNumber": "A-101",
      "siteId": "s_1", "branded": true, "groupId": "g_1", "groupName": "Block A"
    },
    {
      "id": "stu_2", "name": "Bala", "rollNumber": "CS102", "roomNumber": "A-102",
      "siteId": "s_1", "branded": false, "groupId": null, "groupName": null
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

`branded: true` is the BRANDED tag in the picker. Adding such a student to a different group
moves them — the group they were in loses them on its next `memberStudentIds` write, not on
this one.

---

## 6. `GET /v1/mobile/me/branding`

What this device should render. Call it after login and on resume. No parameters — it answers
for whoever the token belongs to.

**200** — a [Branding object](#the-branding-object).

Resolution by role:

| Caller | Resolves to |
|---|---|
| `student` | their own group's branding |
| `parent` | the branding of the group their ward belongs to |
| `warden`, `admin` | the organisation's branding |

Three layers, most specific first: **group → organisation → stock**. Every row above falls
through to the organisation's branding when no group brands the caller, and to
`isDefault: true` when the organisation has not been branded either.

Organisation branding arrives in the same `Branding` object, with `groupId` and `groupName`
`null`, `iconKey`/`iconUrl` carrying the organisation's logo, `isDefault: false`, and `version`
set to the time the organisation was last rebranded. Nothing on the client needs to tell the
two apart — it renders whichever mark it is handed.

### Reproducing each state

Ask whoever runs the dashboard to set these up; all three are reachable with one test account.

| To get | Do this |
|---|---|
| **Group branding** | Put your test student in a group that has a logo (*Groups → a group → Apply to N*) |
| **Organisation branding** | Remove them from every group, and set a logo on *Organizations → the organisation → Branding* |
| **Stock lockup** | No group, and clear the organisation's logo, name, monogram and colours |

Signing in as a **warden** is the quickest check of the organisation layer — a warden is never in
a group, so they show the organisation's mark whenever one exists and the stock lockup when it
does not. If a warden shows the stock lockup while the dashboard shows a logo, the client is
almost certainly still branching on `groupId`.

### A guardian with several wards

The rule is **all wards agree, or fall through**:

- One ward, or several that all sit in the **same** group → that group's branding.
- Wards in **different** groups → no group agreement, so it falls to the next layer.
- One ward branded and another not → same (an unbranded ward is its own distinct answer, so it
  disagrees).

"Falls to the next layer" means the **organisation's** branding, and `isDefault: true` only if
the organisation has none either. A disagreement among wards therefore no longer implies the
stock lockup — the guardian still sees their university's logo, just not any one cohort's mark.

It is deterministic, needs no parameter, and never shows a guardian the wrong university's
mark. There is no `?studentId=` variant — the endpoint does not follow the ward switcher in the
parent dashboard. If guardians with wards at two universities turn out to be common, that is
the change to ask for.

---

## Organisation branding

> **Reference only — the app calls none of these.** They are the web dashboard's editor,
> documented here so you can see where an organisation-branded `GET /me/branding` payload comes
> from and reproduce one while testing. Skip to § *Live updates* if you only build the app.

The layer under the groups: **one logo and one app name for the whole tenant**, edited from the
web dashboard rather than the app — *Organizations → an organisation → **Branding***. It is what
a member sees when no group brands them, which is most of an organisation on day one.

These four routes live outside `/mobile` because their caller is the dashboard, not a phone.

| Route | Who |
|---|---|
| `GET /v1/tenants/:id/branding` | `superadmin` (any organisation), `admin` (their own) |
| `PUT /v1/tenants/:id/branding` | same |
| `POST /v1/tenants/:id/branding/logo` | same |
| `DELETE /v1/tenants/:id/branding/logo` | same |

An `admin` reaching for an organisation that is not theirs gets **403**:

```json
{ "statusCode": 403, "message": "You can only manage your own organisation." }
```

`RolesGuard` lets an `admin` through to the route; it has no idea which organisation the `:id`
belongs to, so ownership is checked in the controller. Without that check an admin could brand
any tenant whose id they guessed.

### The OrgBranding object

```json
{
  "tenantId": "t_1",
  "appName": "Anna Univ",
  "iconColors": ["#4F46E5", "#9333EA"],
  "shape": "squircle",
  "iconLabel": "AU",
  "logoKey": "t_1/org-logo/u_9/8f2c….png",
  "logoUrl": "https://cdn.iverto.ai/t_1/org-logo/u_9/8f2c….png",
  "isDefault": false,
  "version": "2026-08-16T12:00:00.000Z",
  "updatedAt": "2026-08-16T12:00:00.000Z",
  "updatedBy": "u_9"
}
```

`isDefault: true` means the organisation has never been branded; `appName` then reads
`Iverto Outpass`, `version` reads `default`, and every other field is empty. `logoUrl` follows
the same lifetime rules as `iconUrl` above.

### `PUT /v1/tenants/:id/branding`

Every field optional. **Omitted keeps its current value; `null` clears it.**

```json
{ "appName": "Anna Univ", "iconColors": ["#4F46E5"], "shape": "squircle",
  "iconLabel": "AU", "logoKey": "t_1/org-logo/u_9/8f2c….png" }
```

| Field | Rules |
|---|---|
| `appName` | ≤ 14 chars, or `null` |
| `iconColors` | up to 4 hex strings; gradient stops in order |
| `shape` | `squircle \| circle \| rounded \| square` |
| `iconLabel` | ≤ 2 chars, or `null` |
| `logoKey` | key from the logo upload, or `null` to remove the logo |

**200** the OrgBranding object. Each write moves `version`, which is what tells a cached app the
mark is stale. The write is audited as `UPDATE_BRANDING` on `TENANT`.

`DELETE /v1/tenants/:id/branding/logo` is exactly `PUT { "logoKey": null }`, kept as its own
route because "remove the logo" is a button.

### `POST /v1/tenants/:id/branding/logo`

`multipart/form-data` with a `file` part. PNG/JPEG/WEBP/HEIC, max 5 MB — **no PDF**, unlike the
mobile document upload: a logo is rendered, not downloaded. A square image around 1024×1024
renders best.

**201**

```json
{
  "key": "t_1/org-logo/u_9/8f2c….png",
  "url": "https://cdn.iverto.ai/t_1/org-logo/u_9/8f2c….png",
  "contentType": "image/png",
  "size": 51234
}
```

Uploading **does not apply** the logo — send `key` back as `logoKey` on the `PUT`. An upload the
admin then abandons must not rebrand the organisation. The `url` here is the long-lived one, not
the 5-minute upload link, so the editor's preview does not expire while it sits open.

### Where it is stored

`Tenant.settings.branding`, not columns of its own. The fields are a presentation blob that only
ever moves as a unit — nothing joins on them, nothing filters by them — and `settings` is already
the tenant's catch-all, so a column per field would buy nothing and cost a migration on every
future field. **No schema migration is needed to deploy this.**

A stored blob with every field empty is read back as *no branding*: it would otherwise override
the stock lockup with an identical copy of it and hand members a `version` that changes for no
visible reason.

---

## Live updates

Branding is otherwise fetched once per session, so a rebrand lands on the member's next launch.
The `/mobile` socket namespace carries a third event so an open app picks it up immediately.

Same connection as `notification:new` and `permission:updated` — namespace `/mobile`, handshake
path `/hostel/socket.io`, `auth: { token: accessToken }`. The socket joins `user:{userId}` on
connect.

| Event | Payload |
|---|---|
| `branding:updated` | a [Branding object](#the-branding-object), identical in shape to `GET /me/branding` |

Emitted on a successful `POST /admin/groups/:id/branding`, to:

- **the group's students** — the new branding;
- **students the write removed from the group** — their *fallback* payload, so the app stops
  showing a mark it no longer has. That is the organisation's branding where one is set, and the
  `isDefault: true` payload only otherwise — so do not assume a removal always arrives as the
  default;
- **their guardians** — re-resolved per guardian, not assumed to be this group's, so a parent
  of siblings in different groups correctly receives the fallback rather than one child's mark.

Apply the payload directly; no re-fetch is needed. Delivery is best-effort — a dropped socket
never fails the admin's write, and `GET /me/branding` on next launch is always the source of
truth.

**Organisation branding does not emit this event.** A group write touches a known handful of
members; an organisation write touches everyone in the tenant, and fanning that out over sockets
to brand a header is not worth the burst. A rebrand at the organisation level lands on each
member's next launch, through `GET /me/branding`.

---

## Uploading a group icon

`POST /v1/mobile/uploads` — `multipart/form-data` with a `file` part and `purpose=group-icon`.
PNG/JPEG/HEIC/WEBP, max 5 MB.

**Downscale before you upload — 512 px on the longest edge, WebP where you can encode it.**
The 5 MB ceiling is what the server rejects, not what you should send. This image is stored once
and then fetched by every member of the group on every launch, so its size is paid for in egress
thousands of times over; a 1024 px PNG straight off a phone is roughly a hundred times more
bytes than a 40 px header mark can use, and re-encoding it typically takes ~500 KB under 40 KB
with no visible difference. The web dashboard does exactly this before uploading an organisation
logo. Nothing enforces it, which is precisely why it is worth doing on your side.

**201**

```json
{
  "key": "t_1/group-icon/u_9/8f2c….png",
  "bucket": "mobile-uploads",
  "filename": "icon.png",
  "contentType": "image/png",
  "size": 51234,
  "url": "https://…"
}
```

Send `key` back as `iconKey` on `POST /groups` or `POST /groups/:id/branding`. The `url` on this
response is the short-lived (5-minute) upload URL — fine for the preview in the editor, not for
storage. For rendering, use the `iconUrl` that comes back on the branding responses.

---

## Error envelope

Same as the rest of the mobile API:

```json
{ "statusCode": 403, "error": "FORBIDDEN", "message": "…", "details": { } }
```

`error` is the stable code to branch on; `message` on the 4xx codes above is written to be
shown to the user as-is. `details` appears only on `VALIDATION_FAILED`, keyed by field:

```json
{
  "statusCode": 400,
  "error": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": { "appName": ["appName must be shorter than or equal to 14 characters"] }
}
```

Note the two layers: DTO limits (`appName` ≤ 14, `iconLabel` ≤ 2, `name` ≤ 60) fail as
`VALIDATION_FAILED` with `details`; the same limits re-checked in the service, and every
tenant/shape rule, fail as `BAD_REQUEST` with a plain `message`. Branch on `error` and render
`message`, and both read correctly.

---

## Deployment settings

> **Ops reference — nothing here is an app concern.** It is included so that "the icon URL looks
> different between environments" has an explanation on hand.

### Two buckets

A bucket is public or it is not — Supabase has no per-object setting. Branding images want to be
world-readable and CDN-cached; outpass attachments and profile-change proofs must never be. So
they are separated:

| Bucket | Contents | Access |
|---|---|---|
| `mobile-uploads` | `purpose=permission`, `purpose=profile-request` | **private**, short-lived signed URLs |
| `mobile-branding` | `purpose=group-icon`, `purpose=org-logo` | **public**, permanent CDN links |

Keys are `<tenantId>/<purpose>/<userId>/<uuid>.<ext>` in both, and the bucket is derived from
that `purpose` segment — so a stored key stays self-describing and nothing else has to remember
where a file went. A key whose purpose does not parse resolves to the **private** bucket:
guessing "public" for a key we cannot read is the one mistake here with a blast radius.

| Variable | Effect |
|---|---|
| `MOBILE_UPLOAD_BUCKET` | private document bucket (default `mobile-uploads`) |
| `MOBILE_BRANDING_BUCKET` | public branding bucket (default `mobile-branding`) |
| `MOBILE_BRANDING_BUCKET_PUBLIC` | set to `false` only if that bucket is not public yet — URLs are signed instead |
| `BRANDING_ICON_URL_TTL_SECONDS` | lifetime of a signed `iconUrl` when the branding bucket is not public, default 7 days |

`MOBILE_UPLOAD_BUCKET_PUBLIC` **no longer exists.** It used to make the single shared bucket
public so icons got CDN links, which would have exposed every document in it. Any deployment
still setting it can drop it; it is ignored.

**Migrating an existing deployment:** icons uploaded before the split live in `mobile-uploads`
and will 404 once the branding bucket is in use. Either copy those objects across, or set
`MOBILE_BRANDING_BUCKET=mobile-uploads` until you do — accepting that this reinstates the shared
bucket, so leave it private and take the signed-URL cost while it lasts.

### Egress

A branding image is stored once and fetched by every member on every launch, so its size is
paid for thousands of times over. Three things keep that bill small, and they matter more than
where the file is hosted:

- **A public branding bucket.** A signed URL carries a per-request token in the query string, and
  the server mints a fresh one on every `/me/branding` call — so every device gets a different
  URL and misses the CDN *every single launch*. Public URLs are byte-identical for everyone, so
  one origin fetch serves the whole campus. This is why the split into two buckets is worth the
  trouble rather than a nicety.
- **A one-year `Cache-Control`.** Every object key ends in a fresh UUID, so a given URL's bytes
  can never change and a new upload is a new URL. Uploads are stored with
  `max-age=31536000` rather than Supabase's one-hour default, which otherwise has each CDN edge
  re-fetching from origin all day for a file that cannot have changed.
- **Resizing before upload.** The dashboard re-encodes a logo to at most 512 px on its longest
  edge, as WebP where the browser supports it, before it is stored — typically a ~500 KB PNG
  under 40 KB. HEIC that the browser cannot decode is uploaded untouched; the server accepts it.

The long cache is safe **because** the keys are unique. Any future caller that reuses a key
under `upsert` must pass a short `cacheControlSeconds` instead.
