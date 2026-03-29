import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

// Scenarios:
// - api_smoke: 10 VUs for 30s (baseline smoke test)
// - api_stress: 50 → 200 → 0 VUs over 2 minutes (stress test)
// - api_spike: 300 VUs for 30s (spike test)
// - api_5k_load: 1000 → 3000 → 5000 → 0 VUs over 3 minutes (5k concurrent load test)
//
// Usage:
// - Run all: npm run load:k6:smoke
// - Run 5k only: docker compose --profile loadtest run --rm k6 run /scripts/k6ImLoad.js --tag scenario=5k

const DEFAULT_CORE_API_BASE_URL = 'http://127.0.0.1:11451';
const DEFAULT_TENANT_ID = 'tenant-demo';
const TENANT_ADMIN_ROLE = 'tenant:admin';
const TOKEN_REQUEST_HEADERS = {
  'Content-Type': 'application/json',
};
const SMOKE_SLEEP_SECONDS = 0.2;
const STRESS_SLEEP_SECONDS = 0.1;

const coreApiBaseUrl = __ENV.CORE_API_BASE_URL || DEFAULT_CORE_API_BASE_URL;
const tenantId = __ENV.SMOKE_TENANT_ID || DEFAULT_TENANT_ID;
const K6_SCENARIO = __ENV.K6_SCENARIO || 'all';

const apiTokenDuration = new Trend('api_token_duration');
const apiConsoleDuration = new Trend('api_console_duration');
const apiErrors = new Counter('api_errors');

const allScenarios = {
  api_smoke: {
    executor: 'constant-vus',
    vus: 10,
    duration: '30s',
    exec: 'runApiSmoke',
  },
  api_stress: {
    executor: 'ramping-vus',
    stages: [
      { duration: '30s', target: 50 },
      { duration: '60s', target: 200 },
      { duration: '30s', target: 0 },
    ],
    exec: 'runApiStress',
  },
  api_spike: {
    executor: 'ramping-vus',
    stages: [
      { duration: '10s', target: 300 },
      { duration: '20s', target: 300 },
      { duration: '10s', target: 0 },
    ],
    exec: 'runApiSpike',
  },
  api_5k_load: {
    executor: 'ramping-vus',
    stages: [
      { duration: '30s', target: 1000 },
      { duration: '30s', target: 3000 },
      { duration: '30s', target: 5000 },
      { duration: '60s', target: 5000 },
      { duration: '30s', target: 0 },
    ],
    exec: 'runApi5kLoad',
    startTime: '0s',
  },
};

function resolveScenarios() {
  if (K6_SCENARIO === 'smoke') {
    return { api_smoke: allScenarios.api_smoke };
  }
  if (K6_SCENARIO === '5k') {
    return { api_5k_load: allScenarios.api_5k_load };
  }

  return allScenarios;
}

export const options = {
  scenarios: resolveScenarios(),
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<200'],
    http_req_failed: ['rate<0.01'],
    api_token_duration: ['p(95)<300'],
    api_console_duration: ['p(95)<250'],
    api_errors: ['count<100'],
  },
};

function is2xxStatus(statusCode) {
  return statusCode >= 200 && statusCode < 300;
}

function recordApiError(response) {
  if (!is2xxStatus(response.status)) {
    apiErrors.add(1);
  }
}

function requestHealth(baseUrl) {
  const healthResponse = http.get(`${baseUrl}/api/v1/health`);
  recordApiError(healthResponse);
  check(healthResponse, {
    'health status 200': (response) => response.status === 200,
  });

  return healthResponse;
}

export function getAuthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function issueToken(baseUrl, smokeTenantId, vu) {
  const tokenResponse = http.post(
    `${baseUrl}/api/v1/auth/dev-token`,
    JSON.stringify({
      roles: [TENANT_ADMIN_ROLE],
      tenantId: smokeTenantId,
      userId: `k6-user-${vu}`,
    }),
    {
      headers: TOKEN_REQUEST_HEADERS,
    },
  );

  apiTokenDuration.add(tokenResponse.timings.duration);
  recordApiError(tokenResponse);

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

function requestConsoleEndpoint(path, accessToken, successCheckName) {
  const response = http.get(`${coreApiBaseUrl}${path}`, {
    headers: getAuthHeaders(accessToken),
  });
  recordApiError(response);
  check(response, {
    [successCheckName]: (currentResponse) => currentResponse.status === 200,
  });

  return response;
}

export function runApiSmoke() {
  requestHealth(coreApiBaseUrl);

  const accessToken = issueToken(coreApiBaseUrl, tenantId, __VU);
  if (!accessToken) {
    sleep(SMOKE_SLEEP_SECONDS);
    return;
  }

  const permissionsRole = encodeURIComponent(TENANT_ADMIN_ROLE);
  const encodedTenantId = encodeURIComponent(tenantId);

  const overviewResponse = requestConsoleEndpoint(
    '/api/v1/console/overview',
    accessToken,
    'overview status 200',
  );
  const tenantsResponse = requestConsoleEndpoint(
    '/api/v1/console/tenants',
    accessToken,
    'tenants status 200',
  );
  const releaseChecksResponse = requestConsoleEndpoint(
    '/api/v1/console/release-checks',
    accessToken,
    'release checks status 200',
  );
  const conversationsResponse = requestConsoleEndpoint(
    '/api/v1/console/conversations',
    accessToken,
    'conversations status 200',
  );
  const permissionsResponse = requestConsoleEndpoint(
    `/api/v1/console/permissions?roles=${permissionsRole}`,
    accessToken,
    'permissions status 200',
  );
  const auditLogsResponse = requestConsoleEndpoint(
    `/api/v1/console/audit-logs?tenantId=${encodedTenantId}&limit=50`,
    accessToken,
    'audit logs status 200',
  );

  const consoleRequestsAverageDuration =
    (overviewResponse.timings.duration +
      tenantsResponse.timings.duration +
      releaseChecksResponse.timings.duration +
      conversationsResponse.timings.duration +
      permissionsResponse.timings.duration +
      auditLogsResponse.timings.duration) /
    6;
  apiConsoleDuration.add(consoleRequestsAverageDuration);

  sleep(SMOKE_SLEEP_SECONDS);
}

export function runApiStress() {
  requestHealth(coreApiBaseUrl);
  issueToken(coreApiBaseUrl, tenantId, __VU);
  sleep(STRESS_SLEEP_SECONDS);
}

export function runApiSpike() {
  requestHealth(coreApiBaseUrl);
}

export function runApi5kLoad() {
  requestHealth(coreApiBaseUrl);
  const accessToken = issueToken(coreApiBaseUrl, tenantId, __VU);
  if (!accessToken) {
    sleep(0.05);
    return;
  }

  requestConsoleEndpoint('/api/v1/console/overview', accessToken, 'overview status 200');

  sleep(0.05);
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
  <title>k6 Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    pre { background: #1e293b; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>k6 Load Test Summary</h1>
  <pre>${escapedSummary}</pre>
</body>
</html>`;
}

export function handleSummary(data) {
  return {
    '/reports/k6-summary.json': JSON.stringify(data, null, 2),
    '/reports/k6-summary.html': buildHtmlSummary(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
