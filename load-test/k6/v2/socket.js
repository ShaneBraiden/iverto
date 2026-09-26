/**
 * v2 socket capacity — Socket.IO `/mobile` namespace on {API_PREFIX}/socket.io,
 * authenticated with pre-issued pool tokens (no per-VU login).
 * Knobs: -e PEAK=300 -e WS_HOLD_MS=60000
 */
import ws from 'k6/ws';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'https://api.iverto.ai').replace(/\/+$/, '');
const PREFIX = (__ENV.API_PREFIX || '/devhostel').replace(/\/+$/, '');
const WS_URL = `${BASE_URL.replace(/^http/, 'ws')}${PREFIX}/socket.io/?EIO=4&transport=websocket`;
const NS = '/mobile';
const PEAK = Number(__ENV.PEAK || 300);
const HOLD_MS = Number(__ENV.WS_HOLD_MS || 60000);

const tokens = new SharedArray('tokens', () => JSON.parse(open(__ENV.TOKENS_FILE || '../../data/tokens.json')));
const wsConnectFail = new Rate('ws_connect_fail');
const wsConnectTime = new Trend('ws_connect_time', true);
const wsSessions = new Counter('ws_sessions');
const wsConnectErrors = new Counter('ws_connect_error_packets');

export const options = {
  scenarios: {
    sockets: {
      executor: 'ramping-vus',
      startVUs: 0,
      gracefulRampDown: '10s',
      gracefulStop: '10s',
      stages: [
        { target: Math.round(PEAK * 0.3), duration: '1m' },
        { target: PEAK, duration: '1m30s' },
        { target: PEAK, duration: '1m30s' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: { ws_connect_fail: ['rate<0.05'], ws_connect_time: ['p(95)<3000'] },
};

export default function () {
  const token = tokens[(__VU - 1) % tokens.length].accessToken;
  const startedAt = Date.now();
  let connected = false;

  const res = ws.connect(WS_URL, {}, function (socket) {
    socket.on('message', (msg) => {
      if (msg.charAt(0) === '0' && msg.charAt(1) === '{') {
        socket.send(`40${NS},` + JSON.stringify({ token }));
        return;
      }
      if (msg === '2') {
        socket.send('3');
        return;
      }
      if (msg.indexOf(`40${NS}`) === 0) {
        connected = true;
        wsConnectTime.add(Date.now() - startedAt);
        wsSessions.add(1);
        return;
      }
      if (msg.indexOf('44') === 0) {
        wsConnectErrors.add(1);
        if (__ITER === 0 && __VU <= 3) console.warn(`CONNECT_ERROR: ${msg.slice(0, 200)}`);
        socket.close();
      }
    });
    socket.on('error', () => {});
    socket.setTimeout(() => socket.close(), HOLD_MS);
  });

  const ok = res && res.status === 101;
  check(res, { 'ws upgrade -> 101': () => ok });
  wsConnectFail.add(!(ok && connected));
}
