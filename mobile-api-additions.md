# Iverto Outpass — Mobile API additions

Four routes the app calls that are **not yet in `mobile-api-documentation.md`**. They are
written here as a contract for the backend, in the same style and against the same base URL
(`https://api.iverto.ai/hostel` + `/v1/mobile/...`), with the same error envelope.

The app is already wired to all four and **degrades cleanly while they 404**, so shipping this
document and shipping the endpoints can happen in either order:

| Route | Until it exists |
|---|---|
| `POST /auth/refresh` | The client probes it once per launch. On a 404 it stops asking and ends expired sessions with an on-screen explanation instead of a silent bounce to login. |
| `GET /geofence` | The guardian's location card falls back to gate-scan presence. |
| `POST /location/ping` | The student's device stops reporting after the first 404 and shows "not enabled for your campus". |
| `GET /parent/children/:studentId/location` | Same fallback as `GET /geofence`. |

---

## 1. POST /v1/mobile/auth/refresh

**Public.** Trades a refresh token for a new access token.

`POST /auth/login` already returns `refreshToken` and `expiresIn: 3600`, but there is nothing to
spend the refresh token on — so an access token simply dies after an hour. Before this fix that
meant the app dropped the session mid-task and sent the user back to a blank login screen.

```json
{ "refreshToken": "v1..." }
```

**200**

```json
{ "accessToken": "eyJ...", "refreshToken": "v2...", "expiresIn": 3600, "tokenType": "bearer" }
```

| Field | Required | Notes |
|---|---|---|
| `accessToken` | yes | |
| `refreshToken` | no | Send a new one only if you rotate. Omitted, the client keeps the one it has. |
| `expiresIn` | no | Seconds. The client stores the resulting instant and pre-emptively refreshes on the next launch. |

Errors: `401` refresh token invalid, expired or already rotated — the client treats this as a
finished session and signs out with a message.

**Client behaviour worth knowing.** On a 401 from *any* authenticated call, the client calls
this once, and replays the original request if it gets a token. Concurrent 401s are collapsed
onto a single refresh, so a dashboard firing four calls at once produces one refresh, not four.
A 401 on the *replayed* request ends the session for good. This route is called without an
`Authorization` header.

---

## 2. GET /v1/mobile/geofence

**Any signed-in role.** The campus boundaries for the caller's site(s).

A circle, not a polygon: the question the app asks is "on campus, and if not, how far", which a
centre and a radius answer and a polygon does not without somebody drawing one.

**200**

```json
[
  {
    "id": "gz_1",
    "siteId": "s_1",
    "name": "Main Campus",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "radiusMeters": 400
  }
]
```

Return `[]` when the site has no boundary configured. The app treats an empty array and a `404`
the same way — "not enabled here" — so either is safe.

---

## 3. POST /v1/mobile/location/ping

**Student only.** One position fix from the student's device.

```json
{
  "latitude": 12.9716,
  "longitude": 77.5946,
  "accuracyMeters": 12.5,
  "at": "2026-08-08T12:38:00.000Z",
  "inside": true,
  "zoneId": "gz_1"
}
```

| Field | Required | Notes |
|---|---|---|
| `latitude`, `longitude` | yes | |
| `accuracyMeters` | no | Radius of uncertainty the OS reported. |
| `at` | yes | ISO 8601, when the fix was taken **on the device** — not when it arrived. Pings can be delayed. |
| `inside` | no | The device's own verdict against `zoneId`. Advisory: re-evaluate server-side, it is the authority. |
| `zoneId` | no | Which zone `inside` was computed against. |

**200**

```json
{ "accepted": true, "inside": true }
```

Errors: `401` account not linked · `403` caller is not a student · `429` if you rate-limit.

**Client behaviour worth knowing.** Foreground only, at most one ping a minute, and only when the
device has moved ~50 m — **except** a fence crossing, which is sent immediately regardless. So a
student in a lecture produces nothing and a student walking out of the gate produces a ping at
the moment they cross.

Both `inside` and the device's evaluation use the rule in `lib/geo.ts`: inside when
`haversine(fix, centre) <= radiusMeters + min(accuracyMeters, 150)`. The accuracy slack matters —
without it a ±80 m fix taken 30 m outside the wall reads as "left campus" and alarms a parent.
**Please match this rule server-side** so the two halves cannot disagree.

---

## 4. GET /v1/mobile/parent/children/:studentId/location

**Guardian only, and only for a ward on their own account** (`403` otherwise — this is the route
that most needs it).

**200**

```json
{
  "studentId": "stu_1",
  "latitude": 12.9701,
  "longitude": 77.5980,
  "accuracyMeters": 15,
  "at": "2026-08-08T12:36:11.000Z",
  "inside": false,
  "distanceMeters": 520,
  "zone": {
    "id": "gz_1", "siteId": "s_1", "name": "Main Campus",
    "latitude": 12.9716, "longitude": 77.5946, "radiusMeters": 400
  },
  "sharing": true
}
```

| Field | Notes |
|---|---|
| `sharing` | `false` when the student has location sharing switched off. Send this with `latitude`/`longitude` as `null` — the app tells the guardian it is the ward's own setting rather than showing a stale pin or an error. |
| `latitude`, `longitude`, `at` | `null` when the device has never reported. |
| `inside`, `distanceMeters` | Optional. Omit them and the app derives both from the fix and the zone; send them and the app uses yours, since the server sees every ping and the app sees one. |
| `zone` | The zone the fix was evaluated against. `null` if none is configured. |

Errors: `403` not your ward · `404` route not deployed, or no such student.

---

## Privacy notes

These are properties of the feature, not implementation detail — they should hold server-side too.

- **Sharing is opt-in.** Stored on the student's device and off until they turn it on, from
  Profile → Location sharing. The sheet says who can see it, how often it is sent and how to stop
  before the switch is offered.
- **Only guardians on the record.** Route 4 is the only way to read another person's position, and
  it is scoped to the caller's own wards. No student-to-student, no campus-wide view, and nothing
  on the admin side.
- **Foreground only.** The app takes no background location permission. That is a deliberate
  limit: `ACCESS_BACKGROUND_LOCATION` is a separate grant and a Play Store declaration, and it
  should be a decision somebody makes on purpose rather than something that arrives with a
  feature. The consequence is surfaced rather than hidden — a guardian is told in plain words
  when a fix is more than 15 minutes old and why.
- **Retention is yours to decide.** The app never asks for a location history and shows only the
  latest fix. Storing only the most recent position per student would be enough for everything
  the app does with it.
