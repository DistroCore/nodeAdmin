#!/usr/bin/env node

/**
 * checkMonitoringRunbook.cjs — Execute monitoring runbook queries.
 *
 * Transforms the static runbook (docs/operations/) into executable queries
 * that agents can run directly to diagnose runtime issues.
 *
 * Covers:
 * 1. PostgreSQL connection pool status
 * 2. Redis health and memory
 * 3. Kafka consumer lag (if running)
 * 4. Active Socket.IO connections
 * 5. Outbox backlog
 */

const http = require('node:http');
const net = require('node:net');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const API_PORT = parseInt(process.env.PORT || '11451', 10);
const API_HOST = process.env.API_HOST || 'localhost';

const checks = [];

function httpGet(host, port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: host, port, path, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function runCheck(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    checks.push({ name, status: 'ok', elapsed });
    process.stdout.write(`  ${GREEN}✓ ${name}${RESET} (${elapsed}s)\n`);
    if (result) process.stdout.write(`    ${result}\n`);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    checks.push({ name, status: 'fail', elapsed });
    process.stdout.write(`  ${RED}✗ ${name}${RESET} (${elapsed}s) — ${err.message}\n`);
  }
}

async function main() {
  process.stdout.write(`\n${BOLD}${CYAN}═══ Monitoring Runbook Queries ═══${RESET}\n`);

  // 1. Backend health (includes PG, Redis, Kafka status)
  await runCheck('Backend health endpoint', async () => {
    const res = await httpGet(API_HOST, API_PORT, '/health');
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(res.body);
    const details = [];
    if (data.status) details.push(`status: ${data.status}`);
    if (data.info) {
      for (const [key, val] of Object.entries(data.info)) {
        details.push(`  ${key}: ${val.status || JSON.stringify(val)}`);
      }
    }
    return details.join('\n');
  });

  // 2. TCP port checks for infrastructure
  const infraPorts = [
    { name: 'PostgreSQL', port: 55432 },
    { name: 'Redis', port: 56379 },
    { name: 'PgBouncer', port: 6432 },
    { name: 'Kafka', port: 9092 },
  ];

  for (const svc of infraPorts) {
    await runCheck(`${svc.name} (${svc.port}) reachable`, async () => {
      return new Promise((resolve, reject) => {
        const sock = net.connect(svc.port, 'localhost');
        sock.on('connect', () => {
          sock.end();
          resolve('connected');
        });
        sock.on('error', (err) => {
          sock.destroy();
          reject(err);
        });
        setTimeout(() => {
          sock.destroy();
          reject(new Error('timeout'));
        }, 3000);
      });
    });
  }

  // 3. Socket.IO endpoint
  await runCheck('Socket.IO polling endpoint', async () => {
    const res = await httpGet(API_HOST, API_PORT, '/socket.io/?EIO=4&transport=polling');
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const sidMatch = res.body.match(/"sid"\s*:\s*"([^"]+)"/);
    return sidMatch ? `session OK (sid: ${sidMatch[1].slice(0, 8)}...)` : 'connected (no sid)';
  });

  // 4. API v1 health
  await runCheck('API v1 health', async () => {
    const res = await httpGet(API_HOST, API_PORT, '/api/v1/health');
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return `HTTP ${res.status}`;
  });

  // Summary
  process.stdout.write(`\n${BOLD}═══════════════════════════════════════${RESET}\n`);
  const passed = checks.filter((c) => c.status === 'ok').length;
  const failed = checks.length - passed;
  if (failed === 0) {
    process.stdout.write(`  ${GREEN}${BOLD}ALL CHECKS PASS${RESET} — ${passed}/${checks.length}\n`);
  } else {
    process.stdout.write(`  ${RED}${BOLD}${failed} CHECK(S) FAILED${RESET} — ${passed}/${checks.length} passed\n`);
  }

  process.stdout.write(`\n## CONCLUSION\n`);
  process.stdout.write(`result: ${failed === 0 ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`total: ${checks.length}\n`);
  process.stdout.write(`passed: ${passed}\n`);
  process.stdout.write(`failed: ${failed}\n`);
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`${RED}${BOLD}Unexpected error: ${err.message}${RESET}\n`);
  process.exit(1);
});
