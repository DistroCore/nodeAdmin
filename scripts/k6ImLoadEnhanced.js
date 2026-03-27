import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Counter, Gauge } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Enhanced K6 load test with end-to-end traceId tracking and custom Prometheus metrics
// This script tests the full IM message flow: HTTP auth → WebSocket connect → send message → receive broadcast

const DEFAULT_CORE_API_BASE_URL = 'http://127.0.0.1:3001';
const DEFAULT_WS_BASE_URL = 'ws://127.0.0.1:3001';
const DEFAULT_TENANT_ID = 'tenant-demo';
const TENANT_ADMIN_ROLE = 'tenant:admin';

const coreApiBaseUrl = __ENV.CORE_API_BASE_URL || DEFAULT_CORE_API_BASE_URL;
const wsBaseUrl = __ENV.WS_BASE_URL || DEFAULT_WS_BASE_URL;
const tenantId = __ENV.SMOKE_TENANT_ID || DEFAULT_TENANT_ID;
const K6_SCENARIO = __ENV.K6_SCENARIO || 'e2e';

// Custom metrics for Prometheus export
const e2eMessageLatency = new Trend('im_e2e_message_latency_ms', true);
const e2eMessageSuccess = new Counter('im_e2e_message_success_total');
const e2eMessageFailure = new Counter('im_e2e_message_failure_total');
const e2eMessageLoss = new Counter('im_e2e_message_loss_total');
const wsConnectionDuration = new Trend('im_ws_connection_duration_ms', true);
const wsConnectionSuccess = new Counter('im_ws_connection_success_total');
const wsConnectionFailure = new Counter('im_ws_connection_failure_total');
const activeConnections = new Gauge('im_active_connections');
const messageDeliveryRate = new Counter('im_message_delivery_rate_total');
const authTokenLatency = new Trend('im_auth_token_latency_ms', true);
const traceIdPropagation = new Counter('im_trace_id_propagation_total');
const traceIdMissing = new Counter('im_trace_id_missing_total');

const allScenarios = {
  e2e_smoke: {
    executor: 'constant-vus',
    vus: 5,
    duration: '30s',
    exec: 'runE2ESmoke',
  },
  e2e_load: {
    executor: 'ramping-vus',
    stages: [
      { duration: '30s', target: 50 },
      { duration: '60s', target: 100 },
      { duration: '30s', target: 0 },
    ],
    exec: 'runE2ELoad',
  },
  e2e_stress: {
    executor: 'ramping-vus',
    stages: [
      { duration: '30s', target: 100 },
      { duration: '60s', target: 500 },
      { duration: '30s', target: 0 },
    ],
    exec: 'runE2EStress',
  },
};

function resolveScenarios() {
  if (K6_SCENARIO === 'smoke') {
    return { e2e_smoke: allScenarios.e2e_smoke };
  }
  if (K6_SCENARIO === 'load') {
    return { e2e_load: allScenarios.e2e_load };
  }
  if (K6_SCENARIO === 'stress') {
    return { e2e_stress: allScenarios.e2e_stress };
  }
  return allScenarios;
}

export const options = {
  scenarios: resolveScenarios(),
  thresholds: {
    im_e2e_message_latency_ms: ['p(95)<1000', 'p(99)<2000'],
    im_e2e_message_success_total: ['count>0'],
    im_e2e_message_loss_total: ['count<10'],
    im_ws_connection_duration_ms: ['p(95)<500'],
    im_ws_connection_success_total: ['count>0'],
    im_auth_token_latency_ms: ['p(95)<300'],
  },
};

function issueToken(baseUrl, smokeTenantId, vu) {
  const tokenStartAt = Date.now();
  const tokenResponse = http.post(
    `${baseUrl}/api/v1/auth/dev-token`,
    JSON.stringify({
      roles: [TENANT_ADMIN_ROLE],
      tenantId: smokeTenantId,
      userId: `k6-user-${vu}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

  authTokenLatency.add(Date.now() - tokenStartAt);

  let tokenPayload = null;
  try {
    tokenPayload = tokenResponse.json();
  } catch {
    tokenPayload = null;
  }

  const accessToken = typeof tokenPayload?.accessToken === 'string' ? tokenPayload.accessToken : '';

  check(tokenResponse, {
    'token status 201': (response) => response.status === 201,
    'token has accessToken': () => accessToken.length > 0,
  });

  return accessToken;
}

function generateTraceId() {
  return `trace-${Date.now()}-${randomString(16)}`;
}

function generateMessageId() {
  return `msg-${Date.now()}-${randomString(16)}`;
}

function generateConversationId() {
  return `conv-${Date.now()}-${randomString(8)}`;
}

export function runE2ESmoke() {
  const accessToken = issueToken(coreApiBaseUrl, tenantId, __VU);
  if (!accessToken) {
    e2eMessageFailure.add(1);
    sleep(0.5);
    return;
  }

  const conversationId = generateConversationId();
  const wsUrl = `${wsBaseUrl}/socket.io/?EIO=4&transport=websocket&token=${accessToken}`;
  const wsConnectStartAt = Date.now();

  let messageReceived = false;
  let messageSentAt = 0;
  let traceIdSent = '';

  const wsResult = ws.connect(wsUrl, {}, function (socket) {
    activeConnections.add(1);
    wsConnectionDuration.add(Date.now() - wsConnectStartAt);
    wsConnectionSuccess.add(1);

    socket.on('open', () => {
      // Join conversation room
      socket.send(
        JSON.stringify({
          type: '42',
          nsp: '/',
          data: [
            'im:join',
            {
              conversationId,
              tenantId,
            },
          ],
        }),
      );

      // Send message with traceId
      traceIdSent = generateTraceId();
      const messageId = generateMessageId();
      messageSentAt = Date.now();

      socket.send(
        JSON.stringify({
          type: '42',
          nsp: '/',
          data: [
            'im:send',
            {
              conversationId,
              messageId,
              traceId: traceIdSent,
              content: `E2E test message from VU ${__VU} at ${new Date().toISOString()}`,
              messageType: 'text',
            },
          ],
        }),
      );

      traceIdPropagation.add(1);
    });

    socket.on('message', (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === '42' && Array.isArray(parsed.data)) {
          const [event, payload] = parsed.data;

          // Check for message acknowledgment
          if (event === 'im:message:ack' && payload?.traceId === traceIdSent) {
            const latency = Date.now() - messageSentAt;
            e2eMessageLatency.add(latency);
            e2eMessageSuccess.add(1);
            messageDeliveryRate.add(1);
            messageReceived = true;

            if (payload.traceId) {
              traceIdPropagation.add(1);
            } else {
              traceIdMissing.add(1);
            }
          }

          // Check for broadcast message
          if (event === 'im:message:new' && payload?.traceId === traceIdSent) {
            messageDeliveryRate.add(1);
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    });

    socket.on('error', (error) => {
      wsConnectionFailure.add(1);
      e2eMessageFailure.add(1);
    });

    socket.setTimeout(() => {
      if (!messageReceived) {
        e2eMessageLoss.add(1);
        e2eMessageFailure.add(1);
      }
      socket.close();
    }, 5000);
  });

  check(wsResult, {
    'ws connection established': (result) => result.status === 101,
  });

  activeConnections.add(-1);
  sleep(0.5);
}

export function runE2ELoad() {
  runE2ESmoke();
  sleep(0.2);
}

export function runE2EStress() {
  runE2ESmoke();
  sleep(0.1);
}

function buildHtmlSummary(data) {
  const escapedSummary = textSummary(data, { indent: ' ', enableColors: false })
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>k6 Enhanced IM Load Test Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    pre { background: #1e293b; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>k6 Enhanced IM Load Test Summary</h1>
  <pre>${escapedSummary}</pre>
</body>
</html>`;
}

export function handleSummary(data) {
  return {
    '/reports/k6-enhanced-summary.json': JSON.stringify(data, null, 2),
    '/reports/k6-enhanced-summary.html': buildHtmlSummary(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
