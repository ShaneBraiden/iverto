> ## ⚠️ Superseded — do not build against this file
>
> This was the *proposed* contract, written before the backend existed. The real one is
> **`mobile-api-documentation.md`**, and the app is now wired to that: different base URL
> (`https://api.iverto.ai/hostel` + `/v1/mobile/...`), different paths (`/permissions`, not
> `/outpasses`), cursor pagination, a fifteen-state status machine, and upload *keys* rather
> than ids.
>
> Kept only as a record of what was originally specified. Everything below is out of date.

# Iverto Outpass — API contract

Every feature in the app and the endpoint it calls. **There is no sample data left in the
app**: every screen reads from the network layer described here, and shows a loading, error
or empty state until the server answers.

## Where the wiring lives

| File | What it holds |
|---|---|
| `lib/api/client.ts` | `fetch` wrapper — base URL, bearer token, JSON, `ApiError`, 401 handling |
| `lib/api/endpoints.ts` | One function per endpoint, grouped as the sections below |
| `lib/api/useQuery.ts` | `useQuery` / `useMutation` — loading, error, refetch, pending |
| `lib/auth.tsx` | `AuthProvider` — session, `GET /me`, sign-in/out; mounted in `app/_layout.tsx` |
| `types/index.ts` | Every response shape the app expects |
| `constants/config.ts` | Labels, icon presets, fallbacks — app configuration, never data |

**Base URL:** `EXPO_PUBLIC_API_URL` (see `.env.example`). Nothing is hardcoded; the same build
points at local, staging or production by env alone. A missing value fails loudly on the first
request rather than silently rendering blanks.

**Auth:** every request carries `Authorization: Bearer <token>`. A `401` from any endpoint drops
the session and returns to the login screen.

**Dates on the wire:** ISO — `2026-08-08` and `18:00`. The display formats
("08 Aug 2026", "06:00 PM") are produced in `lib/datetime.ts` and never sent.

---

## 1. Auth & session

| Feature | Where | Endpoint |
|---|---|---|
| Role-picked login. The picker only chooses the credential format — the app routes on the role the **server** returns | `app/index.tsx` | `POST /auth/login` → `{ token, role }` |
| Forgot password | `app/index.tsx` | `POST /auth/forgot-password` |
| Forced password change — `user.mustChangePassword` routes here ahead of everything else | `app/change-password.tsx` | `POST /auth/password` |
| Who am I | `lib/auth.tsx` | `GET /me` |
| Sign out | `components/ProfileBody.tsx` | `POST /auth/logout` |

`GET /me` is the single source for every profile field the app shows. Role decides which
fields matter: `rollNo` / `hostel` / `guardian` for a student, `relation` for a guardian,
`title` / `campus` for an admin.

## 2. Student — outpasses

| Feature | Where | Endpoint |
|---|---|---|
| Home: latest live request, three counters, three most recent — **all derived from one list call** | `app/student/index.tsx` | `GET /outpasses?me=true` |
| New request | `app/student/request.tsx` | `POST /outpasses`, `GET /categories` |
| Date / time pickers | `components/DateTimeSheet.tsx` | — (values go with the POST) |
| Attach supporting document, PDF or image, max 5 MB | `lib/attachments.ts` | `POST /uploads` → `{ id }`, sent as `attachmentId` |
| History with status filter and search | `app/student/history.tsx` | `GET /outpasses?me=true&status=&q=` |
| Cancel a pending request | `app/outpass/[id].tsx` | `POST /outpasses/:id/cancel` |

## 3. Outpass detail — shared by all three roles

Route: `/outpass/[id]?role=student|parent|admin` — `app/outpass/[id].tsx`

| Feature | Endpoint |
|---|---|
| Everything on the screen — banner, requester, trip, reason, timeline | `GET /outpasses/:id` |
| **QR gate pass**, rendered only when `approved` | `GET /outpasses/:id/pass` → `{ passId, token, expiresAt }` |
| Guardian: approve / reject with reason | `POST /outpasses/:id/approve`, `/reject` `{ reason }` |
| Student: cancel | `POST /outpasses/:id/cancel` |
| Admin: issue gate pass / override & reject | `POST /outpasses/:id/issue-pass`, `/override` `{ reason }` |

> **The QR is real.** It renders the `token` from `/pass` (via `react-native-qrcode-svg`), and
> the gate scanner posts that token to `POST /gate/scan`. The token must be signed and carry
> its own expiry — the app cannot verify anything, it only displays what it is given.

## 4. Guardian — approvals, wards, siblings

Two calls serve the whole guardian shell, both in `components/WardContext.tsx`:

| Feature | Endpoint |
|---|---|
| Wards on the account (siblings included) | `GET /guardians/me/wards` |
| Every request awaiting a decision, across all wards | `GET /outpasses?status=pending` |

The per-ward queue, the "N more waiting under your other wards" nudge, the tab badge and the
counts in the sibling switcher are all derived from that one queue, so they cannot disagree.

| Feature | Where | Endpoint |
|---|---|---|
| Inline approve / reject from the dashboard | `app/parent/index.tsx` | `POST /outpasses/:id/approve`, `/reject` |
| Decision history for the ward in view | `app/parent/history.tsx` | `GET /outpasses?rollNo=&decided=true&status=` |
| Ward overview — whereabouts refetched per ward | `app/parent/ward.tsx` | `GET /wards/:rollNo` |
| Guardians on record, with APPROVER tag | `app/parent/ward.tsx` | `GET /wards/:rollNo/guardians` |
| Call warden / message student | `app/parent/ward.tsx` | native `tel:` / `sms:` intents |
| Report an emergency (confirmed first) | `app/parent/ward.tsx` | `POST /emergencies` |

## 5. Late-entry log (guardian)

`app/parent/late-entries.tsx` — reached from the "Late returns" tile on the ward screen.

| Feature | Endpoint |
|---|---|
| Log for the ward in view | `GET /wards/:rollNo/late-entries` |
| Clear the "new" flag — fired once per record, on display, fire-and-forget | `POST /late-entries/:id/acknowledge` |

## 6. Profile change-request workflow

Neither students nor guardians can edit their own record. Corrections are raised as a diff and
applied by the admin.

| Feature | Where | Endpoint |
|---|---|---|
| Read-only profile, all three roles | `components/ProfileBody.tsx` | `GET /me` |
| Status of the last request, shown inline | `components/ProfileBody.tsx` | `GET /profile-requests?mine=true&role=&rollNo=` |
| Request builder | `app/profile-request.tsx` | `POST /profile-requests` |
| Per-role editable field whitelist — **server-driven**, with a local fallback in `constants/config.ts` | `app/profile-request.tsx` | `GET /profile-requests/fields?role=` |
| Attach supporting proof | `lib/attachments.ts` | `POST /uploads` |
| Admin review queue, filtered | `app/admin/profile-requests.tsx` | `GET /profile-requests?status=` |
| View attachment | `app/admin/profile-requests.tsx` | `GET /uploads/:id` → opened with the system handler |
| **Apply changes** | `app/admin/profile-requests.tsx` | `POST /profile-requests/:id/approve` |
| **Decline**, note shown back to the requester | `app/admin/profile-requests.tsx` | `POST /profile-requests/:id/reject` `{ note }` |
| Export | `app/admin/profile-requests.tsx` | `GET /profile-requests/export` → `{ url }` |

## 7. Admin — campus operations

| Feature | Where | Endpoint |
|---|---|---|
| 4 stat tiles — **served, not typed in** | `app/admin/index.tsx` | `GET /admin/stats` → `{ pending, approvedToday, currentlyOut, overdue }` |
| Recent activity feed (`type` picks the row icon) | `app/admin/index.tsx` | `GET /admin/activity` |
| Campus-wide pass list, searchable and filtered (search is debounced 300 ms) | `app/admin/requests.tsx` | `GET /outpasses?q=&status=` |
| Export passes | `app/admin/requests.tsx` | `GET /outpasses/export` → `{ url }` |
| Tab badges — same numbers as the tiles, one call, shared via `components/AdminContext.tsx` | `app/admin/_layout.tsx` | `GET /admin/stats`, `GET /profile-requests?status=pending` |

Defined in `endpoints.ts` and ready, but with no screen behind them yet: `POST /gate/scan`
(the scanner is a separate handheld app), `POST /announcements`, `GET /reports`,
`GET`/`PUT /roles`.

## 8. Groups & per-group app branding

`app/admin/groups.tsx` → `app/icon-editor.tsx`

| Feature | Endpoint |
|---|---|
| Group list with live icon render and branding filter | `GET /groups` |
| Create group — both entry points open the same sheet, then the editor | `POST /groups` |
| Editor state seeded from the group | `GET /groups/:id` |
| Roster picker | `GET /roster` |
| Upload custom icon, PNG 1024×1024 | `POST /uploads` → sent as `iconUploadId` |
| **Apply to N** | `POST /groups/:id/branding` `{ memberRollNos, appName, iconColors, shape, iconLabel, iconUploadId? }` |
| Member device reads its assigned branding on launch | `GET /me/branding` |

Taking effect on device still needs `expo-dynamic-app-icon` or `react-native-change-icon` plus
a dev/EAS build — icon variants must be declared at build time. iOS shows a system alert on
change; Android applies it silently on next launch.

## 9. Notifications

`POST /devices` and `/devices/unregister` are defined in `endpoints.ts`. What is still missing
is the transport: `expo-notifications` is not installed, so nothing calls `register` yet, and
there is no server-side pipeline. The surfaces waiting on it:

- header badge counts (currently derived from the lists themselves)
- "Your guardian is notified about this request immediately" — `app/student/request.tsx`
- "They are notified along with your reason" on reject — `app/outpass/[id].tsx`
- Notifications settings tile — `components/ProfileBody.tsx`

## 10. Settings & static

`components/ProfileBody.tsx` — Notifications, Change password, Language, Help & support,
Terms & privacy. `POST /auth/password` is defined in `endpoints.ts`; the rest have no backend
behind them yet.

---

## Identity note

**No personal names appear anywhere in this app.** People are shown by role — Student, Father,
Mother, Guardian, Warden, Administrator — and identified by roll number or ID where a
distinction is needed. If the API returns names, swap the `label` fields; if it shouldn't,
keep the roll number as the identity everywhere. Guardian-side data is keyed by roll number
specifically so siblings stay separable.

## Session persistence

The token lives in memory only (`lib/api/client.ts`), so closing the app signs the user out.
Add `expo-secure-store` and restore the token in `AuthProvider` to change that — the rest of
the session flow already goes through `signIn` / `signOut`.
