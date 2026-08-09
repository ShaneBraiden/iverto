/**
 * Geofence maths.
 *
 * One rule, in one place, used by both sides of the feature: the student's
 * device decides whether it is on campus with `isInside`, and the guardian's
 * screen works out the same answer from the fix it is shown. The server is
 * expected to apply the identical rule to the pings it stores — so when it
 * sends `inside` we take its word, and when it doesn't we can still answer.
 *
 * A circle, not a polygon. A hostel campus is a compound with a gate, and the
 * question the app actually asks is "how far from it" — a radius answers that
 * and a polygon does not, without needing anyone to draw one.
 */
import type { GeofenceZone } from '@/types';

export type LatLng = { latitude: number; longitude: number };

/** Mean Earth radius, metres. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than the flat-earth approximation: the approximation is
 * fine over a campus, but this same function is what tells a guardian their
 * ward is 40 km away, and there it is not.
 */
export function distanceMeters(a: LatLng, b: LatLng) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial bearing from `a` to `b`, in degrees clockwise from north.
 * This is what places the ward's marker around the radar.
 */
export function bearingDegrees(a: LatLng, b: LatLng) {
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The eight-point compass name for a bearing — "north-east" reads better than 43°. */
export function compassLabel(bearing: number) {
  const points = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return points[Math.round(bearing / 45) % 8];
}

export function zoneCentre(zone: GeofenceZone): LatLng {
  return { latitude: zone.latitude, longitude: zone.longitude };
}

/**
 * Inside the fence?
 *
 * `accuracyMeters` widens the fence rather than the point: a fix good to only
 * ±80 m sitting 30 m outside the wall has not left campus in any sense worth
 * telling a parent about, and calling it "off campus" would fire a false alarm
 * every time the student walked past a window.
 */
export function isInside(point: LatLng, zone: GeofenceZone, accuracyMeters?: number | null) {
  const slack = Math.min(accuracyMeters ?? 0, 150);
  return distanceMeters(point, zoneCentre(zone)) <= zone.radiusMeters + slack;
}

/** Metres from the fence's edge. Negative inside, positive outside. */
export function metersFromEdge(point: LatLng, zone: GeofenceZone) {
  return distanceMeters(point, zoneCentre(zone)) - zone.radiusMeters;
}

/** "85 m", "1.4 km", "23 km" — one significant place, never more. */
export function formatDistance(meters: number) {
  const m = Math.abs(meters);
  if (m < 950) return `${Math.round(m / 5) * 5} m`;
  if (m < 10_000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

/**
 * How stale a fix is, in plain words.
 *
 * Location is the one screen where the age of the data matters as much as the
 * data: a pin from six hours ago is not where the ward is, and saying so is
 * the difference between a useful screen and a misleading one.
 */
export function fixAge(at: string | null | undefined) {
  if (!at) return { minutes: Infinity, label: 'never', stale: true };

  const then = new Date(at).getTime();
  if (Number.isNaN(then)) return { minutes: Infinity, label: 'unknown', stale: true };

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  const stale = minutes > 15;

  if (minutes < 1) return { minutes, label: 'just now', stale };
  if (minutes < 60) return { minutes, label: `${minutes} min ago`, stale };

  const hours = Math.round(minutes / 60);
  if (hours < 24) return { minutes, label: `${hours}h ago`, stale };

  return { minutes, label: `${Math.round(hours / 24)}d ago`, stale };
}

/**
 * Fills in whatever the server left out.
 *
 * `inside` and `distanceMeters` are optional on the wire so a backend can ship
 * the endpoint without doing the geometry. When they arrive we use them —
 * the server sees every ping, this app sees one — and otherwise we derive
 * them, so the guardian screen never has a hole in it.
 */
export function resolveFix(
  fix: {
    latitude: number | null;
    longitude: number | null;
    accuracyMeters?: number | null;
    inside?: boolean | null;
    distanceMeters?: number | null;
  },
  zone: GeofenceZone | null
) {
  if (fix.latitude == null || fix.longitude == null) {
    return { point: null, inside: null, distance: null, bearing: null };
  }

  const point: LatLng = { latitude: fix.latitude, longitude: fix.longitude };
  if (!zone) {
    return { point, inside: fix.inside ?? null, distance: fix.distanceMeters ?? null, bearing: null };
  }

  const centre = zoneCentre(zone);
  return {
    point,
    inside: fix.inside ?? isInside(point, zone, fix.accuracyMeters),
    distance: fix.distanceMeters ?? distanceMeters(point, centre),
    bearing: bearingDegrees(centre, point),
  };
}
