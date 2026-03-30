const { execSync } = require('child_process');
const { argv } = require('process');

// CI-local: hardcoded npm scripts only — no user input in exec commands

const args = argv.slice(2);
const runFull = args.includes('--full');
const runAcceptance = args.includes('--acceptance');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const results = [];

function runStage(name, command, options = {}) {
  const start = Date.now();
  process.stdout.write(`\n${CYAN}${BOLD}▶ ${name}${RESET}\n`);
  process.stdout.write(`  ${YELLOW}$ ${command}${RESET}\n`);

  try {
    execSync(command, {
      stdio: 'inherit',
      timeout: options.timeout || 300_000,
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    results.push({ name, passed: true, elapsed });
    process.stdout.write(`  ${GREEN}✓ ${name} (${elapsed}s)${RESET}\n`);
    return true;
  } catch (error) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    results.push({ name, passed: false, elapsed });
    process.stdout.write(`  ${RED}✗ ${name} (${elapsed}s)${RESET}\n`);
    return false;
  }
}

function checkPort(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const sock = net.connect(port, 'localhost');
    sock.on('connect', () => {
      sock.end();
      resolve(true);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function waitForService(service, port, maxWait = 30) {
  const start = Date.now();
  process.stdout.write(`  ${YELLOW}Waiting for ${service} (port ${port})...${RESET}\n`);
  for (let i = 0; i < maxWait; i++) {
    if (await checkPort(port)) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stdout.write(`  ${GREEN}✓ ${service} ready (${elapsed}s)${RESET}\n`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write(`  ${RED}✗ ${service} not ready after ${maxWait}s${RESET}\n`);
  return false;
}

function printSummary() {
  const totalElapsed = results.reduce((sum, r) => sum + parseFloat(r.elapsed), 0).toFixed(1);
  const allPassed = results.every((r) => r.passed);

  process.stdout.write(`\n${BOLD}═══════════════════════════════════════${RESET}\n`);
  process.stdout.write(`${BOLD}  CI Local Summary${RESET}\n`);
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  for (const r of results) {
    const icon = r.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    process.stdout.write(`  ${icon} ${r.name} (${r.elapsed}s)\n`);
  }

  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);
  const statusIcon = allPassed ? `${GREEN}${BOLD}PASS${RESET}` : `${RED}${BOLD}FAIL${RESET}`;
  process.stdout.write(`  ${statusIcon} — ${results.length} stages, ${totalElapsed}s total\n`);
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);
}

// ── Stage 1: Static Analysis + Unit Tests + Build ──────────────────────────

async function main() {
  process.stdout.write(
    `\n${BOLD}${CYAN}═══ Stage 1: Static Analysis + Unit Tests + Build ═══${RESET}\n`
  );

  let stage1Pass = true;
  stage1Pass = runStage('Format Check', 'npm run format:check') && stage1Pass;
  stage1Pass = runStage('Lint', 'npm run lint') && stage1Pass;
  stage1Pass = runStage('Unit Tests', 'npm run test:coreApi') && stage1Pass;
  stage1Pass = runStage('Build', 'npm run build') && stage1Pass;

  if (!stage1Pass) {
    process.stdout.write(`\n${RED}${BOLD}Stage 1 FAILED — aborting.${RESET}\n`);
    printSummary();
    process.exit(1);
  }

  if (!runFull && !runAcceptance) {
    printSummary();
    process.exit(0);
  }

  // ── Stage 2: Integration Tests (requires infra) ──────────────────────────

  process.stdout.write(`\n${BOLD}${CYAN}═══ Stage 2: Integration Tests ═══${RESET}\n`);

  let stage2Pass = true;
  stage2Pass = runStage('Start Infra', 'npm run infra:up:kafka') && stage2Pass;

  if (stage2Pass) {
    stage2Pass = (await waitForService('PostgreSQL', 55432)) && stage2Pass;
    stage2Pass = (await waitForService('Redis', 56379)) && stage2Pass;
    stage2Pass = (await waitForService('Kafka', 9092)) && stage2Pass;
  }

  if (stage2Pass) {
    stage2Pass = runStage('DB Migrate', 'npm run db:migrate -w coreApi') && stage2Pass;
  }

  if (stage2Pass) {
    stage2Pass =
      runStage('Integration Tests', 'npm run test:coreApi:integration', { timeout: 120_000 }) &&
      stage2Pass;
  }

  process.stdout.write(`\n${CYAN}Shutting down infra...${RESET}\n`);
  try {
    execSync('npm run infra:down', { stdio: 'pipe', timeout: 30_000 });
  } catch {
    // best effort
  }

  if (!stage2Pass) {
    process.stdout.write(`\n${RED}${BOLD}Stage 2 FAILED.${RESET}\n`);
    printSummary();
    process.exit(1);
  }

  if (!runAcceptance) {
    printSummary();
    process.exit(0);
  }

  // ── Stage 3: Acceptance Tests ────────────────────────────────────────────

  process.stdout.write(`\n${BOLD}${CYAN}═══ Stage 3: Acceptance Tests ═══${RESET}\n`);

  const stage3Pass = runStage('M2 Acceptance', 'npm run m2:acceptance:auto', { timeout: 300_000 });

  if (!stage3Pass) {
    process.stdout.write(`\n${RED}${BOLD}Stage 3 FAILED.${RESET}\n`);
  }

  printSummary();
  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${RED}${BOLD}Unexpected error: ${err.message}${RESET}\n`);
  process.exit(1);
});
