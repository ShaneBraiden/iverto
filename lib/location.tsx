/**
 * Location sharing, from the student's device.
 *
 * This is the half of the feature that produces the data: the phone takes a
 * fix, decides whether it is inside the campus fence, and posts both to the
 * server, which is what lets a guardian see where their ward is.
 *
 * Three things it is deliberately not:
 *
 *   Not on by default.  Sharing is opt-in, stored on the device, and the
 *                       student can switch it off at any time from their
 *                       profile. Tracking a person is not something an app
 *                       should start doing because it was installed.
 *   Not in the background. Fixes are taken only while the app is open. A
 *                       background location permission is a separate grant, a
 *                       Play Store declaration and a review question, and it
 *                       is not something to slip in — see the privacy notes in
 *                       `mobile-api-additions.md`. The consequence is stated on
 *                       screen rather than hidden: a guardian is told when a
 *                       fix is stale, and why.
 *   Not chatty.         One ping a minute at most, and only when the phone has
 *                       actually moved 50 m or crossed the fence. A pass in
 *                       and out of the gate is worth a ping; sitting in a
 *                       lecture is not.
 */
import React from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { ApiError } from '@/lib/api/client';
import { location as locationApi } from '@/lib/api/endpoints';
import { isInside } from '@/lib/geo';
import { useAuth } from '@/lib/auth';
import type { GeofenceZone } from '@/types';

const CONSENT_KEY = 'iverto.locationSharing.v1';

/** Never more than one ping a minute, however much the phone moves. */
const MIN_PING_INTERVAL_MS = 60_000;
/** …unless the fence was crossed, which is always worth sending immediately. */
const MOVE_THRESHOLD_M = 50;

export type LocationStatus =
  /** The student has not turned sharing on. */
  | 'off'
  /** On, but the OS permission was refused — nothing can be reported. */
  | 'denied'
  /** On and permitted, waiting for the first fix. */
  | 'starting'
  /** On, permitted, reporting. */
  | 'live'
  /** On, but this campus has no fence configured or the server has no route. */
  | 'unavailable';

type LocationContextValue = {
  status: LocationStatus;
  /** True once the student has opted in, whatever the OS then said. */
  sharing: boolean;
  /** The campus fence this device is measured against, once loaded. */
  zone: GeofenceZone | null;
  /** Device's own last verdict. Null before the first fix. */
  inside: boolean | null;
  /** When the last fix was sent, as epoch ms. */
  lastPingAt: number | null;
  /** Turn sharing on or off. Requests the OS permission when turning on. */
  setSharing: (next: boolean) => Promise<void>;
};

const LocationContext = React.createContext<LocationContextValue | null>(null);

/* ------------------------------------------------------------- Consent */

async function readConsent() {
  try {
    return (await SecureStore.getItemAsync(CONSENT_KEY)) === 'true';
  } catch {
    return false;
  }
}

async function writeConsent(value: boolean) {
  try {
    await SecureStore.setItemAsync(CONSENT_KEY, value ? 'true' : 'false');
  } catch {
    /* No keystore. Sharing still works for this launch. */
  }
}

/* ------------------------------------------------------------ Provider */

/**
 * Mounted in the student tab shell, so reporting runs for as long as a student
 * is anywhere in the app and stops the moment they are not.
 */
export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';

  const [sharing, setSharingState] = React.useState(false);
  const [status, setStatus] = React.useState<LocationStatus>('off');
  const [zone, setZone] = React.useState<GeofenceZone | null>(null);
  const [inside, setInside] = React.useState<boolean | null>(null);
  const [lastPingAt, setLastPingAt] = React.useState<number | null>(null);

  /* Ping bookkeeping, in refs — the watcher callback must not be rebuilt
     every time one of these changes or the subscription would churn. */
  const lastSentAt = React.useRef(0);
  const lastSentInside = React.useRef<boolean | null>(null);
  const lastSentPoint = React.useRef<{ latitude: number; longitude: number } | null>(null);
  const zoneRef = React.useRef<GeofenceZone | null>(null);
  zoneRef.current = zone;

  /* Restore the student's choice. */
  React.useEffect(() => {
    let alive = true;
    void readConsent().then((value) => alive && setSharingState(value));
    return () => {
      alive = false;
    };
  }, []);

  /* The fence. A 404 means this campus has not enabled the feature, which is
     a state to render, not an error to throw. Tracked separately from
     `status`, which the watcher owns — deriving the two together below avoids
     the fetch and the watcher overwriting each other's answer. */
  const [zoneChecked, setZoneChecked] = React.useState(false);

  React.useEffect(() => {
    if (!isStudent) return;
    let alive = true;

    void locationApi
      .zones()
      .then((zones) => {
        if (!alive) return;
        setZone(zones?.[0] ?? null);
      })
      .catch(() => {
        if (alive) setZone(null);
      })
      .finally(() => {
        if (alive) setZoneChecked(true);
      });

    return () => {
      alive = false;
    };
  }, [isStudent]);

  const report = React.useCallback(async (fix: Location.LocationObject) => {
    const currentZone = zoneRef.current;
    const point = {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
    };
    const nowInside = currentZone
      ? isInside(point, currentZone, fix.coords.accuracy)
      : null;

    /* Crossing the fence always goes up straight away. Otherwise hold to one
       a minute, and only when the phone has actually moved. */
    const crossed = nowInside !== null && nowInside !== lastSentInside.current;
    const since = Date.now() - lastSentAt.current;
    const moved =
      !lastSentPoint.current ||
      Math.abs(point.latitude - lastSentPoint.current.latitude) > 0.0004 ||
      Math.abs(point.longitude - lastSentPoint.current.longitude) > 0.0004;

    if (!crossed && (since < MIN_PING_INTERVAL_MS || !moved)) return;

    try {
      await locationApi.ping({
        latitude: point.latitude,
        longitude: point.longitude,
        accuracyMeters: fix.coords.accuracy ?? undefined,
        at: new Date(fix.timestamp).toISOString(),
        inside: nowInside ?? undefined,
        zoneId: currentZone?.id,
      });

      lastSentAt.current = Date.now();
      lastSentInside.current = nowInside;
      lastSentPoint.current = point;
      setInside(nowInside);
      setLastPingAt(Date.now());
      setStatus('live');
    } catch (err) {
      /* The route is not deployed on this server. Stop reporting rather than
         retrying a 404 every minute for the rest of the session. */
      const httpStatus = err instanceof ApiError ? err.status : 0;
      if (httpStatus === 404 || httpStatus === 501) setStatus('unavailable');
      /* Anything else — a dropped connection, a 5xx — is transient. The next
         fix tries again. */
    }
  }, []);

  /* The watcher. Torn down whenever sharing goes off, the student signs out,
     or the app leaves the foreground. */
  React.useEffect(() => {
    if (!isStudent || !sharing) {
      setStatus(sharing ? 'starting' : 'off');
      return;
    }

    let alive = true;
    let subscription: Location.LocationSubscription | null = null;

    const start = async () => {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;

      if (permission !== Location.PermissionStatus.GRANTED) {
        setStatus('denied');
        return;
      }

      setStatus('starting');
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: MIN_PING_INTERVAL_MS,
          distanceInterval: MOVE_THRESHOLD_M,
        },
        (fix) => void report(fix)
      );

      if (!alive) {
        subscription.remove();
        subscription = null;
      }
    };

    void start();

    /* Coming back to the app should refresh the fix rather than wait for the
       phone to move — a guardian checking in wants "now", not "when they last
       walked somewhere". */
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void Location.getLastKnownPositionAsync()
        .then((fix) => fix && report(fix))
        .catch(() => {});
    });

    return () => {
      alive = false;
      subscription?.remove();
      appState.remove();
    };
  }, [isStudent, sharing, report]);

  const setSharing = React.useCallback(async (next: boolean) => {
    setSharingState(next);
    await writeConsent(next);
    if (!next) {
      setStatus('off');
      setInside(null);
      lastSentAt.current = 0;
      lastSentInside.current = null;
      lastSentPoint.current = null;
    }
  }, []);

  /* One derived answer rather than several writers fighting over `status`.
     No fence means there is nothing to report against, whatever the watcher
     thinks it is doing — but a refused OS permission is the more useful thing
     to tell the student, so that wins. */
  const resolvedStatus: LocationStatus =
    !sharing
      ? 'off'
      : status === 'denied'
        ? 'denied'
        : zoneChecked && !zone
          ? 'unavailable'
          : status;

  const value = React.useMemo<LocationContextValue>(
    () => ({ status: resolvedStatus, sharing, zone, inside, lastPingAt, setSharing }),
    [resolvedStatus, sharing, zone, inside, lastPingAt, setSharing]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/**
 * Reads the sharing state. Returns null outside the student shell — the
 * guardian and admin shells have no device to report from, and a screen shared
 * between roles can check for null rather than crash.
 */
export function useLocationSharing() {
  return React.useContext(LocationContext);
}
