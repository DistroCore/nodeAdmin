const cp = require('node:child_process');

function runStep(command, env) {
  const startedAt = Date.now();
  try {
    cp.execSync(command, {
      env,
      stdio: 'inherit',
    });
    return {
      command,
      durationMs: Date.now() - startedAt,
      status: 'pass',
    };
  } catch (error) {
    return {
      command,
      durationMs: Date.now() - startedAt,
      error: String(error),
      status: 'fail',
    };
  }
}

async function run() {
  const env = { ...process.env };
  const steps = [
    runStep('npm run m1:acceptance', env),
    runStep('npm run smoke:im', env),
    runStep('npm run smoke:pgbouncer', env),
    runStep('npm run smoke:outbox', env),
  ];

  if ((env.M2_INCLUDE_TLS_SMOKE || '').trim() === 'true') {
    steps.push(runStep('npm run smoke:tls', env));
  }

  const result = steps.every((step) => step.status === 'pass') ? 'pass' : 'fail';

  console.log(
    JSON.stringify(
      {
        result,
        steps,
      },
      null,
      2
    )
  );

  if (result === 'fail') {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('[m2Acceptance] failed:', error);
  process.exit(1);
});
