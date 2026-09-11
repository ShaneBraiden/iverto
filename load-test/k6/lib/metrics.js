/** Custom metrics shared across scripts. Registered on import. */
import { Trend, Counter, Rate } from 'k6/metrics';

/** Time to a usable access token from POST /auth/login. */
export const loginDuration = new Trend('login_duration', true);

/** Count of logins that did not return a token. Threshold: 0. */
export const loginFailures = new Counter('login_failures');

/** Any non-2xx (or missing body) on a journey step. Threshold: 0. */
export const journeyErrors = new Counter('journey_errors');

/** State-changing calls the test actually sent (submit, decision, ping). */
export const writesCreated = new Counter('writes_created');

/* --- Socket.IO gateway --- */

/** true when a namespace CONNECT never acked. Threshold: rate < 0.05. */
export const wsConnectFail = new Rate('ws_connect_fail');

/** ms from ws.connect() to the `40/mobile` CONNECT ack. */
export const wsConnectTime = new Trend('ws_connect_time', true);

/** Sockets that reached CONNECTED. */
export const wsSessions = new Counter('ws_sessions');

/** How long a socket stayed open before we closed it. */
export const wsSessionTime = new Trend('ws_session_time', true);
