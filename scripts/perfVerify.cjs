#!/usr/bin/env node

/**
 * perfVerify.cjs — Performance verification pipeline.
 *
 * Fixed entry point: smoke -> load -> report -> conclusion
 * Runs smoke tests first, then if passing, runs a quick load check.
 * Outputs a machine-readable conclusion block.
 */

const http = require('node:http');
const { performance } = require('node:perf_hooks');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const API_PORT = parseInt(process.env.PORT || '11451', 10);
const API_HOST = process.env.API_HOST || 'localhost';
const CONCURRENT = parseInt(process.env.LOAD_CONCURRENCY || '50', 10);
const REQUESTS = parseInt(process.env.LOAD_REQUESTS || '200', 10);

const results = [];

function httpGet(host, port, path) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.get({ hostname: host, port, path, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const elapsed = performance.now() - start;
        resolve({ status: res.statusCode, elapsed });
      });
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function smokePhase() {
  process.stdout.write(`\n  ${CYAN}[Phase 1: Smoke]${RESET}\n`);
  let allPassed = true;

  const endpoints = [
    { name: 'Backend health', path: '/health' },
    { name: 'API v1 health', path: '/api/v1/health' },
  ];

  for (const ep of endpoints) {
    try {
      const res = await httpGet(API_HOST, API_PORT, ep.path);
      if (res.status === 200) {
        process.stdout.write(`    ${GREEN}✓ ${ep.name}${RESET} (${res.elapsed.toFixed(0)}ms)\n`);
        results.push({ phase: 'smoke', name: ep.name, status: 'pass', latency: res.elapsed });
      } else {
        process.stdout.write(`    ${RED}✗ ${ep.name} — HTTP ${res.status}${RESET}\n`);
        results.push({ phase: 'smoke', name: ep.name, status: 'fail', latency: res.elapsed });
        allPassed = false;
      }
    } catch (err) {
      process.stdout.write(`    ${RED}✗ ${ep.name} — ${err.message}${RESET}\n`);
      results.push({ phase: 'smoke', name: ep.name, status: 'fail', latency: -1 });
      allPassed = false;
    }
  }
  return allPassed;
}

async function loadPhase() {
  process.stdout.write(`\n  ${CYAN}[Phase 2: Load]${RESET} — ${REQUESTS} requests, ${CONCURRENT} concurrent\n`);
  const latencies = [];
  let errors = 0;
  let completed = 0;

  async function worker() {
    while (completed < REQUESTS) {
      const idx = completed++;
      try {
        const res = await httpGet(API_HOST, API_PORT, '/health');
        latencies.push(res.elapsed);
        if (res.status !== 200) errors++;
      } catch {
        errors++;
        latencies.push(-1);
      }
    }
  }

  const start = performance.now();
  const workers = Array.from({ length: CONCURRENT }, () => worker());
  await Promise.all(workers);
  const totalTime = performance.now() - start;

  const validLatencies = latencies.filter((l) => l >= 0).sort((a, b) => a - b);
  const p50 = validLatencies[Math.floor(validLatencies.length * 0.5)] || 0;
  const p95 = validLatencies[Math.floor(validLatencies.length * 0.95)] || 0;
  const p99 = validLatencies[Math.floor(validLatencies.length * 0.99)] || 0;
  const avg = validLatencies.length > 0 ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length : 0;
  const rps = (REQUESTS / (totalTime / 1000)).toFixed(1);

  process.stdout.write(`    Requests: ${REQUESTS} | Errors: ${errors} | RPS: ${rps}\n`);
  process.stdout.write(
    `    Latency: avg=${avg.toFixed(0)}ms p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms p99=${p99.toFixed(0)}ms\n`,
  );

  results.push({ phase: 'load', rps: parseFloat(rps), p50, p95, p99, errors, total: REQUESTS });

  return errors === 0;
}

function reportPhase() {
  process.stdout.write(`\n  ${CYAN}[Phase 3: Report]${RESET}\n`);
  const smokePass = results.filter((r) => r.phase === 'smoke' && r.status === 'pass').length;
  const smokeTotal = results.filter((r) => r.phase === 'smoke').length;
  const loadResult = results.find((r) => r.phase === 'load');

  process.stdout.write(`    Smoke: ${smokePass}/${smokeTotal} passed\n`);
  if (loadResult) {
    process.stdout.write(
      `    Load: ${loadResult.total} req, ${loadResult.rps} rps, p95=${loadResult.p95.toFixed(0)}ms, errors=${loadResult.errors}\n`,
    );
  }
}

function conclusionPhase() {
  const smokePass = results.filter((r) => r.phase === 'smoke' && r.status === 'pass').length;
  const smokeTotal = results.filter((r) => r.phase === 'smoke').length;
  const loadResult = results.find((r) => r.phase === 'load');
  const loadOk = loadResult && loadResult.errors === 0;
  const overallPass = smokePass === smokeTotal && (loadOk || !loadResult);

  process.stdout.write(`\n## CONCLUSION\n`);
  process.stdout.write(`result: ${overallPass ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`smoke_passed: ${smokePass}\n`);
  process.stdout.write(`smoke_total: ${smokeTotal}\n`);
  if (loadResult) {
    process.stdout.write(`load_rps: ${loadResult.rps}\n`);
    process.stdout.write(`load_p95_ms: ${loadResult.p95.toFixed(0)}\n`);
    process.stdout.write(`load_errors: ${loadResult.errors}\n`);
  }
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  return overallPass;
}

async function main() {
  const overallStart = Date.now();
  process.stdout.write(`\n${BOLD}${CYAN}═══ Performance Verification Pipeline ═══${RESET}\n`);

  const smokeOk = await smokePhase();

  if (smokeOk) {
    await loadPhase();
  } else {
    process.stdout.write(`\n  ${YELLOW}⚠ Smoke failed — skipping load phase${RESET}\n`);
  }

  reportPhase();
  const pass = conclusionPhase();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${RED}${BOLD}Unexpected error: ${err.message}${RESET}\n`);
  process.exit(1);
});
