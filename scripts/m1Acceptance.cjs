const defaultBaseUrl = 'http://127.0.0.1:3001';
const baseUrl = (process.env.CORE_API_BASE_URL || defaultBaseUrl).trim();

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }

  return response.json();
}

async function run() {
  const health = await getJson('/api/v1/health');
  const devToken = await postJson('/api/v1/auth/dev-token', {
    roles: ['tenant:admin'],
    tenantId: 'tenant-demo',
    userId: 'm1-acceptance-user',
  });
  const overview = await getJson('/api/v1/console/overview');
  const tenants = await getJson('/api/v1/console/tenants');
  const releaseChecks = await getJson('/api/v1/console/release-checks');

  const summary = {
    checks: {
      authDevToken: typeof devToken.accessToken === 'string' && devToken.accessToken.length > 0,
      consoleOverview: Array.isArray(overview.stats) && Array.isArray(overview.todos),
      health: health.status === 'ok',
      releaseChecks: Array.isArray(releaseChecks.checks),
      tenantList: Array.isArray(tenants.rows),
    },
  };

  const allPassed = Object.values(summary.checks).every(Boolean);

  console.log(
    JSON.stringify(
      {
        ...summary,
        result: allPassed ? 'pass' : 'fail',
      },
      null,
      2
    )
  );

  if (!allPassed) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('[m1Acceptance] failed:', error);
  process.exit(1);
});
