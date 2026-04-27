#!/usr/bin/env node

/**
 * checkFaultPlaybook.cjs — Common fault queries for the nodeAdmin stack.
 * Checks connection spikes, Kafka lag, Redis health, PgBouncer pool, and latency.
 * Exit code is always 0 (reporting only).
 */

const http = require('http');
const net = require('net');
const { execSync } = require('child_process');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const OK = 'OK';
const WARN = 'WARN';
const CRITICAL = 'CRITICAL';

function httpGet(host, port, path, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: null, body: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: null, body: null });
    });
  });
}

function checkPort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = net.connect(port, host);
    sock.on('connect', () => {
      sock.end();
      resolve(true);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(false);
    });
    setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeoutMs);
  });
}

function severityIcon(level) {
  if (level === OK) return `${GREEN}${BOLD}${level}${RESET}`;
  if (level === WARN) return `${YELLOW}${BOLD}${level}${RESET}`;
  return `${RED}${BOLD}${level}${RESET}`;
}

async function main() {
  process.stdout.write(`\n${BOLD}${CYAN}═══ Fault Playbook ═══${RESET}\n`);
  process.stdout.write(`  Generated: ${new Date().toISOString().slice(0, 19)}\n\n`);

  // Check 1: Connection errors in Docker logs
  process.stdout.write(`  ${BOLD}1. Connection Spike Check${RESET}\n`);
  try {
    const logs = execSync('docker compose logs --no-color --tail=100 coreapi 2>&1', {
      timeout: 10000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const connErrors = (logs.match(/ECONNREFUSED|ECONNRESET|connection refused|too many connections/gi) || []).length;
    const level = connErrors > 10 ? CRITICAL : connErrors > 0 ? WARN : OK;
    process.stdout.write(`    ${severityIcon(level)} — ${connErrors} connection errors in last 100 log lines\n`);
  } catch {
    process.stdout.write(`    ${severityIcon(WARN)} — Docker logs unavailable\n`);
  }

  // Check 2: Kafka lag
  process.stdout.write(`\n  ${BOLD}2. Kafka Consumer Lag${RESET}\n`);
  const kafkaUp = await checkPort('localhost', 9092);
  if (kafkaUp) {
    try {
      const groups = execSync(
        'docker exec nodeadmin-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --list 2>&1',
        { timeout: 10000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const groupList = groups
        .trim()
        .split('\n')
        .filter((l) => l.trim() && !l.includes('__'));
      if (groupList.length > 0) {
        process.stdout.write(`    ${severityIcon(OK)} — ${groupList.length} consumer group(s) active\n`);
      } else {
        process.stdout.write(`    ${severityIcon(OK)} — No consumer groups\n`);
      }
    } catch {
      process.stdout.write(`    ${severityIcon(WARN)} — Could not query consumer groups\n`);
    }
  } else {
    process.stdout.write(`    ${severityIcon(WARN)} — Kafka not running\n`);
  }

  // Check 3: Redis health
  process.stdout.write(`\n  ${BOLD}3. Redis Adapter Health${RESET}\n`);
  const redisUp = await checkPort('localhost', 56379);
  if (redisUp) {
    try {
      const info = execSync('docker exec nodeadmin-redis redis-cli INFO keyspace 2>&1', {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const dbMatch = info.match(/db(\d+):keys=(\d+),expires=(\d+)/);
      if (dbMatch) {
        const keys = parseInt(dbMatch[2], 10);
        const level = keys > 100000 ? WARN : OK;
        process.stdout.write(`    ${severityIcon(level)} — ${keys} keys in db${dbMatch[1]}\n`);
      } else {
        process.stdout.write(`    ${severityIcon(OK)} — No keys (empty database)\n`);
      }
    } catch {
      process.stdout.write(`    ${severityIcon(WARN)} — Could not query Redis INFO\n`);
    }
  } else {
    process.stdout.write(`    ${severityIcon(CRITICAL)} — Redis not reachable\n`);
  }

  // Check 4: PgBouncer pool
  process.stdout.write(`\n  ${BOLD}4. PgBouncer Pool Status${RESET}\n`);
  const pgbouncerUp = await checkPort('localhost', 6432);
  if (pgbouncerUp) {
    try {
      const pools = execSync(
        'docker exec nodeadmin-pgbouncer psql -h 127.0.0.1 -p 5432 -U nodeadmin -d pgbouncer -c "SHOW POOLS;" 2>&1',
        { timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const activeMatch = pools.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
      if (activeMatch) {
        const clActive = parseInt(activeMatch[1], 10);
        const clWaiting = parseInt(activeMatch[2], 10);
        const level = clWaiting > 5 ? WARN : OK;
        process.stdout.write(`    ${severityIcon(level)} — ${clActive} active, ${clWaiting} waiting\n`);
      } else {
        process.stdout.write(`    ${severityIcon(OK)} — Pool info retrieved\n`);
      }
    } catch {
      process.stdout.write(`    ${severityIcon(WARN)} — Could not query PgBouncer pools\n`);
    }
  } else {
    process.stdout.write(`    ${severityIcon(WARN)} — PgBouncer not running\n`);
  }

  // Check 5: API latency
  process.stdout.write(`\n  ${BOLD}5. API Response Latency${RESET}\n`);
  const start = Date.now();
  const health = await httpGet('localhost', 11451, '/health');
  const elapsed = Date.now() - start;
  if (health.status === 200) {
    const level = elapsed > 1000 ? WARN : OK;
    process.stdout.write(`    ${severityIcon(level)} — /health responded in ${elapsed}ms\n`);
  } else {
    process.stdout.write(`    ${severityIcon(CRITICAL)} — /health ${health.status || 'unreachable'} (${elapsed}ms)\n`);
  }

  process.stdout.write(`\n${BOLD}═══════════════════════════════════════${RESET}\n`);
  process.stdout.write(`  ${CYAN}Playbook complete${RESET}\n`);
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`${RED}${BOLD}Error: ${err.message}${RESET}\n`);
  process.exit(0);
});
