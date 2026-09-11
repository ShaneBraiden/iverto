/**
 * Login storm — hammer POST /auth/login only.
 *
 * Password verification runs a deliberately expensive KDF (bcrypt/argon2) on
 * the server, so a burst of sign-ins is a CPU load pattern the mixed journeys
 * barely touch — e.g. the morning when everyone opens the app for the first
 * time that day, or a deploy that invalidates sessions. Worth isolating.
 *
 *   k6 run -e BASE_URL=... -e API_PREFIX=/hostel \
 *          --summary-export results/login-storm-summary.json k6/login-storm.js
 *
 * NOTE: this reuses the account pool hard. Seed as many distinct accounts as
 * you can, and check whether the API has per-account lockout that would skew
 * the result (the app has no lockout logic; the server might).
 *
 * Knob:  -e PEAK=500   logins/second at the top of the ramp
 */
import http from 'k6/http';
import { check } from 'k6';
import { API } from './lib/config.js';
import { accountForVU } from './lib/accounts.js';
import { loginDuration, loginFailures } from './lib/metrics.js';

const PEAK = Number(__ENV.PEAK || 500);
const frac = (f, duration) => ({ target: Math.round(PEAK * f), duration });

export const options = {
  scenarios: {
    login_storm: {
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 300,
      maxVUs: 3000,
      stages: [frac(0.1, '1m'), frac(0.3, '2m'), frac(0.6, '2m'), frac(1.0, '2m'), frac(0, '30s')],
    },
  },
  thresholds: {
    'http_req_duration{name:POST /auth/login}': ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.02'],
    login_failures: ['count<1'],
  },
};

export default function () {
  const acc = accountForVU();
  const body = { identifier: acc.identifier, password: acc.password };
  if (acc.role) body.role = acc.role;

  const res = http.post(`${API}/auth/login`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /auth/login', kind: 'auth' },
  });
  loginDuration.add(res.timings.duration);

  const ok = check(res, {
    'login -> 2xx': (r) => r.status === 200 || r.status === 201,
    'has accessToken': (r) => {
      try {
        return !!r.json('accessToken');
      } catch (e) {
        return false;
      }
    },
  });
  if (!ok) loginFailures.add(1);
}
