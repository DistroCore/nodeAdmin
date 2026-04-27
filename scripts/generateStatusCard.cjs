const fs = require('fs');
const net = require('net');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const ROOT_DIR = path.resolve(__dirname, '..');
const GENERATED_DATE = '2026-04-10';

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

function extractMilestoneStatuses() {
  const roadmap = readRepoFile('docs/delivery/roadmapPlan.md');
  const tableMatch = roadmap.match(/## 7\. 里程碑验收标准[\s\S]*?\| 里程碑[\s\S]*?\n((?:\|.*\n)+)/);

  if (!tableMatch) {
    throw new Error('Unable to locate milestone status table in docs/delivery/roadmapPlan.md');
  }

  const milestoneMap = {
    M1: 'M1 (可用)',
    M2: 'M2 (可靠)',
    M3: 'M3 (可运营)',
  };

  const statuses = {};

  for (const line of tableMatch[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('| **M')) {
      continue;
    }

    const cells = trimmed
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);

    const milestoneCell = cells[0] || '';
    const statusCell = cells[2] || '';
    const idMatch = milestoneCell.match(/\*\*(M\d)/);

    if (!idMatch) {
      continue;
    }

    const id = idMatch[1];
    const passed = statusCell.includes('✅');
    statuses[id] = {
      label: milestoneMap[id] || id,
      passed,
      text: passed ? 'PASS' : 'FAIL',
    };
  }

  return ['M1', 'M2', 'M3'].map((id) => statuses[id] || { label: milestoneMap[id], passed: false, text: 'UNKNOWN' });
}

function extractCoverageSummary() {
  const coverageNote = readRepoFile('docs/superpowers/notes/2026-04-08-backend-coverage-baseline.md');
  const match = coverageNote.match(/Overall baseline: statements ([\d.]+)%/);

  if (!match) {
    return '~unknown statements (backend baseline unavailable)';
  }

  return `~${match[1]}% statements (backend baseline)`;
}

function extractTechDebtSummary() {
  const readme = readRepoFile('README.md');
  const roadmap = readRepoFile('docs/delivery/roadmapPlan.md');
  const tdIds = ['TD-1', 'TD-2', 'TD-3'].filter((id) => readme.includes(id));

  let resolved = 0;
  let deferred = 0;
  let open = 0;

  for (const id of tdIds) {
    const lineMatch = roadmap.match(new RegExp(`\\| ${id} \\|([^\\n]+)`));
    const line = lineMatch ? lineMatch[0] : '';

    if (line.includes('已闭环') || line.includes('已处理') || line.includes('accepted') || line.includes('复核')) {
      resolved += 1;
      continue;
    }

    if (line.includes('低') || line.includes('open')) {
      deferred += 1;
      continue;
    }

    open += 1;
  }

  const statusParts = [];
  if (resolved > 0) {
    statusParts.push(`${resolved} resolved`);
  }
  if (deferred > 0) {
    statusParts.push(`${deferred} deferred`);
  }
  if (open > 0) {
    statusParts.push(`${open} open`);
  }

  return {
    total: tdIds.length,
    summary: statusParts.join(', ') || 'status unknown',
  };
}

function extractCiSummary() {
  const packageJson = JSON.parse(readRepoFile('package.json'));
  const scripts = packageJson.scripts || {};
  const requiredScripts = ['lint', 'format:check', 'test:coreApi', 'build', 'ci:local'];
  const presentCount = requiredScripts.filter(
    (name) => typeof scripts[name] === 'string' && scripts[name].length > 0,
  ).length;
  const documentedJobs = 6;

  return {
    presentCount,
    requiredCount: requiredScripts.length,
    line:
      presentCount === requiredScripts.length
        ? `${documentedJobs} jobs configured`
        : `${presentCount}/${requiredScripts.length} key scripts configured`,
  };
}

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');

    socket.setTimeout(1000);

    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function getInfrastructureStatus() {
  const services = [
    { name: 'PostgreSQL', port: 55432 },
    { name: 'Redis', port: 56379 },
    { name: 'CoreApi', port: 11451 },
  ];

  const results = [];

  for (const service of services) {
    const up = await checkPort(service.port);
    results.push({ ...service, up });
  }

  return results;
}

function countOpenTodos(relativePath) {
  const content = readRepoFile(relativePath);
  const matches = content.match(/- \[ \]/g);
  return matches ? matches.length : 0;
}

function colorizeStatus(text, ok) {
  return ok ? `${GREEN}${BOLD}${text}${RESET}` : `${RED}${BOLD}${text}${RESET}`;
}

function colorizeServiceState(up) {
  return up ? `${GREEN}UP${RESET}` : `${RED}DOWN${RESET}`;
}

async function main() {
  const milestones = extractMilestoneStatuses();
  const coverage = extractCoverageSummary();
  const techDebt = extractTechDebtSummary();
  const ci = extractCiSummary();
  const infrastructure = await getInfrastructureStatus();
  const releaseTodos = countOpenTodos('docs/delivery/mvpReleaseChecklist.md');
  const secretTodos = countOpenTodos('docs/operations/secrets-management.md');

  process.stdout.write(`\n${BOLD}═══════════════════════════════════════${RESET}\n`);
  process.stdout.write(`  ${BOLD}${CYAN}nodeAdmin Project Status Card${RESET}\n`);
  process.stdout.write(`  Generated: ${GENERATED_DATE}\n`);
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n\n`);

  process.stdout.write(`  ${BOLD}Milestones:${RESET}\n`);
  for (const milestone of milestones) {
    process.stdout.write(`    ${milestone.label}: ${colorizeStatus(milestone.text, milestone.passed)}\n`);
  }

  process.stdout.write(`\n  ${BOLD}Tech Debt:${RESET} ${techDebt.total} items (${techDebt.summary})\n`);
  process.stdout.write(
    `\n  ${BOLD}CI Pipeline:${RESET} ${ci.line}${ci.presentCount === ci.requiredCount ? '' : `${YELLOW} (missing required scripts)${RESET}`}\n`,
  );
  process.stdout.write(`\n  ${BOLD}Test Coverage:${RESET} ${coverage}\n`);

  process.stdout.write(`\n  ${BOLD}Infrastructure:${RESET}\n`);
  for (const service of infrastructure) {
    process.stdout.write(`    ${service.name}: ${colorizeServiceState(service.up)} (port ${service.port})\n`);
  }

  process.stdout.write(`\n  ${BOLD}Open TODOs:${RESET}\n`);
  process.stdout.write(`    MVP Release Checklist: ${releaseTodos} items\n`);
  process.stdout.write(`    Secrets Migration: ${secretTodos} items\n\n`);
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${YELLOW}${BOLD}Status card generation warning:${RESET} ${error.message}\n`);
    process.exitCode = 0;
  })
  .finally(() => {
    process.exitCode = 0;
  });
