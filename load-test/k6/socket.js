/**
 * Socket.IO gateway capacity — how many concurrent live connections the server
 * holds before handshakes start failing or slowing.
 *
 * Every foregrounded app keeps exactly one socket (components/AppContext.tsx ->
 * lib/live.ts): namespace `/mobile`, engine.io v4 over websocket, JWT in the
 * CONNECT payload. So concurrent sockets ≈ concurrent active users. This is a
 * separate capacity dimension from request throughput — file descriptors and
 * per-connection memory, not CPU.
 *
 *   k6 run -e BASE_URL=... -e WS_PREFIX=/hostel \
 *          --summary-export results/socket-summary.json k6/socket.js
 *
 * Knobs:  -e PEAK=1000        top of the connection ramp
 *         -e WS_HOLD_MS=180000  how long each socket stays open (3 min default;
 *                               raise to ~600000 when running under soak.js)
 */
import ws from 'k6/ws';
import { check } from 'k6';
import { WS_URL, WS_NAMESPACE } from './lib/config.js';
import { accountForVU } from './lib/accounts.js';
import { login, authToken } from './lib/http.js';
import { wsConnectFail, wsConnectTime, wsSessions, wsSessionTime } from './lib/metrics.js';

const PEAK = Number(__ENV.PEAK || 1000);
const HOLD_MS = Number(__ENV.WS_HOLD_MS || 180000);
const frac = (f, duration) => ({ target: Math.round(PEAK * f), duration });

export const options = {
  scenarios: {
    sockets: {
      executor: 'ramping-vus',
      startVUs: 0,
      gracefulRampDown: '20s',
      gracefulStop: '20s',
      stages: [
        frac(0.2, '2m'),
        frac(0.5, '3m'),
        frac(1.0, '5m'),
        frac(1.0, '10m'), // hold at peak
        frac(0.0, '1m'),
      ],
    },
  },
  thresholds: {
    ws_connect_fail: ['rate<0.05'],
    ws_connect_time: ['p(95)<3000'],
    login_failures: ['count<1'],
  },
};

let token = null;

export default function () {
  if (!token) {
    const acc = accountForVU();
    if (!login(acc)) {
      wsConnectFail.add(true);
      return;
    }
    token = authToken();
  }

  const startedAt = Date.now();
  let connected = false;

  const res = ws.connect(WS_URL, {}, function (socket) {
    socket.on('message', (msg) => {
      // engine.io OPEN packet: 0{"sid":...} -> send Socket.IO CONNECT for /mobile
      if (msg.charAt(0) === '0' && msg.charAt(1) === '{') {
        socket.send(`40${WS_NAMESPACE},` + JSON.stringify({ token }));
        return;
      }
      // engine.io PING (server-initiated in v4) -> PONG
      if (msg === '2') {
        socket.send('3');
        return;
      }
      // Socket.IO CONNECT ack on the namespace: 40/mobile,{"sid":...}
      if (msg.indexOf(`40${WS_NAMESPACE}`) === 0) {
        connected = true;
        wsConnectTime.add(Date.now() - startedAt);
        wsSessions.add(1);
        return;
      }
      // CONNECT_ERROR (bad/expired token): 44/mobile,{...}
      if (msg.indexOf('44') === 0) {
        socket.close();
      }
    });

    socket.on('error', () => {});
    socket.on('close', () => {
      wsSessionTime.add(Date.now() - startedAt);
    });

    // Hold like a foregrounded app, then leave cleanly.
    socket.setTimeout(() => socket.close(), HOLD_MS);
  });

  const handshakeOk = res && res.status === 101;
  check(res, { 'ws upgrade -> 101': () => handshakeOk });
  wsConnectFail.add(!(handshakeOk && connected));
}
