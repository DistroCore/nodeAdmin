#!/usr/bin/env node

/**
 * diagnoseRuntime.cjs — Runtime diagnostics for the nodeAdmin stack.
 * Checks service connectivity, Docker health, and reports status.
 * Exit code is always 0 (diagnostics never fail, they just report).
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

const SERVICES = [
  { name: 'PostgreSQL', host: 'localhost', port: 55432 },
  { name: 'Redis', host: 'localhost', port: 56379 },
  { name: 'CoreApi', host: 'localhost', port: 11451 },
  { name: 'PgBouncer', host: 'localhost', port: 6432 },
  { name: 'Kafka', host: 'localhost', port: 9092 },
];

function checkPort(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = net.connect(port, host);
    sock.on('connect', () => {
      const elapsed = Date.now() - start;
      sock.end();
      resolve({ up: true, latencyMs: elapsed });
    });
    sock.on('error', () => {
      sock.destroy();
      resolve({ up: false, latencyMs: null });
    });
    setTimeout(() => {
      sock.destroy();
      resolve({ up: false, latencyMs: null });
    }, timeoutMs);
  });
}

function httpGet(host, port, path, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get({ hostname: host, port, path, timeout: timeoutMs }, (res) => {
      const elapsed = Date.now() - start;
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body, latencyMs: elapsed }));
    });
    req.on('error', () => resolve({ status: null, body: null, latencyMs: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: null, body: null, latencyMs: null });
    });
  });
}

async function main() {
  process.stdout.write(`\n${BOLD}${CYAN}═══ Runtime Diagnostics ═══${RESET}\n`);
  process.stdout.write(`  Generated: ${new Date().toISOString().slice(0, 19)}\n\n`);

  // Check services
  process.stdout.write(`  ${BOLD}Services:${RESET}\n`);
  for (const svc of SERVICES) {
    const result = await checkPort(svc.host, svc.port);
    const status = result.up ? `${GREEN}UP${RESET} (${result.latencyMs}ms)` : `${RED}DOWN${RESET}`;
    process.stdout.write(`    ${svc.name} (${svc.host}:${svc.port}): ${status}\n`);
  }

  // Check CoreApi health endpoint
  process.stdout.write(`\n  ${BOLD}API Health:${RESET}\n`);
  const health = await httpGet('localhost', 11451, '/health');
  if (health.status === 200) {
    process.stdout.write(`    ${GREEN}✓ /health${RESET} — ${health.status} (${health.latencyMs}ms)\n`);
    try {
      const data = JSON.parse(health.body);
      if (data.status) process.stdout.write(`    Status: ${data.status}\n`);
      if (data.info) {
        for (const [key, val] of Object.entries(data.info)) {
          const icon = val.status === 'up' ? GREEN : RED;
          process.stdout.write(`    ${icon}${key}${RESET}: ${val.status || 'unknown'}\n`);
        }
      }
    } catch {
      /* non-JSON health response is fine */
    }
  } else {
    process.stdout.write(`    ${RED}✗ /health${RESET} — ${health.status || 'unreachable'}\n`);
  }

  // Check Docker containers
  process.stdout.write(`\n  ${BOLD}Docker Containers:${RESET}\n`);
  try {
    const output = execSync('docker compose ps --format "{{.Name}}\t{{.Status}}"', {
      timeout: 10000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (output.trim()) {
      for (const line of output.trim().split('\n')) {
        const [name, status] = line.split('\t');
        if (!name) continue;
        const isHealthy = /up|healthy|running/i.test(status);
        const icon = isHealthy ? GREEN : RED;
        process.stdout.write(`    ${icon}${name}${RESET}: ${status}\n`);
      }
    } else {
      process.stdout.write(`    ${YELLOW}No containers running${RESET}\n`);
    }
  } catch {
    process.stdout.write(`    ${YELLOW}Docker not available or no containers${RESET}\n`);
  }

  process.stdout.write(`\n${BOLD}═══════════════════════════════════════${RESET}\n`);
  process.stdout.write(`  ${CYAN}Diagnostics complete${RESET}\n`);
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`${RED}${BOLD}Error: ${err.message}${RESET}\n`);
  process.exit(0);
});
