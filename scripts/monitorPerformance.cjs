const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

let PgPool = null;
try {
  ({ Pool: PgPool } = require('pg'));
} catch {
  PgPool = null;
}

const execFileAsync = promisify(execFile);

const SAMPLE_INTERVAL_MS = 1000;
const SUMMARY_INTERVAL_MS = 5000;
const HTTP_TIMEOUT_MS = readPositiveIntEnv('MONITOR_HTTP_TIMEOUT_MS', 1500);
const REDIS_TIMEOUT_MS = readPositiveIntEnv('MONITOR_REDIS_TIMEOUT_MS', 1500);

const coreApiBaseUrl = trimTrailingSlash(
  readStringEnv('CORE_API_BASE_URL', 'http://127.0.0.1:3001')
);
const preferredMetricsPath = normalizePath(
  readStringEnv('MONITOR_METRICS_PATH', '/api/v1/metrics')
);
const fallbackMetricsPath = '/api/v1/console/metrics';
const outputPath = path.resolve(
  readStringEnv(
    'MONITOR_OUTPUT_CSV',
    path.resolve(__dirname, '..', 'reports', 'performance-monitor.csv')
  )
);
const pgConnectionString = readStringEnv('MONITOR_DATABASE_URL', process.env.DATABASE_URL || '');
const redisUrl = readStringEnv(
  'MONITOR_REDIS_URL',
  process.env.REDIS_URL || 'redis://127.0.0.1:6379'
);
const redisCliCommand = readStringEnv('MONITOR_REDIS_CLI', 'redis-cli');

const CSV_HEADERS = [
  'timestamp',
  'node_cpu',
  'node_memory_rss',
  'node_memory_heap_used',
  'node_memory_heap_total',
  'node_event_loop_lag',
  'pg_active_connections',
  'pg_idle_connections',
  'pg_waiting_connections',
  'pg_tps',
  'redis_memory_mb',
  'redis_connections',
  'redis_ops_sec',
  'system_cpu',
  'system_memory_mb',
  'system_available_memory_mb',
];

const runtimeState = {
  activeMetricsPath: preferredMetricsPath,
  collecting: false,
  intervalHandle: null,
  isShuttingDown: false,
  lastSummaryAt: Date.now(),
  pgPool: createPgPool(),
  previousNodeCpu: null,
  previousPgTransactions: null,
  previousSystemCpu: snapshotSystemCpu(),
  sampleCount: 0,
  startedAtMs: Date.now(),
};

async function main() {
  ensureCsvFile(outputPath, CSV_HEADERS);

  process.stdout.write(`[monitor] CSV output: ${outputPath}\n`);
  process.stdout.write(
    `[monitor] Node metrics endpoint: ${coreApiBaseUrl}${runtimeState.activeMetricsPath}\n`
  );
  process.stdout.write('[monitor] Sampling every 1 second. Press Ctrl+C to stop.\n');

  await sampleAndWrite();

  runtimeState.intervalHandle = setInterval(() => {
    void sampleTick();
  }, SAMPLE_INTERVAL_MS);

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

async function sampleTick() {
  if (runtimeState.collecting || runtimeState.isShuttingDown) {
    return;
  }

  runtimeState.collecting = true;
  try {
    await sampleAndWrite();
  } finally {
    runtimeState.collecting = false;
  }
}

async function sampleAndWrite() {
  const timestamp = new Date();
  const [nodeMetrics, pgMetrics, redisMetrics] = await Promise.all([
    collectNodeMetrics(),
    collectPostgresMetrics(),
    collectRedisMetrics(),
  ]);
  const systemMetrics = collectSystemMetrics();

  const record = {
    timestamp: timestamp.toISOString(),
    node_cpu: nodeMetrics.cpuPercent,
    node_memory_rss: nodeMetrics.rssMb,
    node_memory_heap_used: nodeMetrics.heapUsedMb,
    node_memory_heap_total: nodeMetrics.heapTotalMb,
    node_event_loop_lag: nodeMetrics.eventLoopLagMs,
    pg_active_connections: pgMetrics.activeConnections,
    pg_idle_connections: pgMetrics.idleConnections,
    pg_waiting_connections: pgMetrics.waitingConnections,
    pg_tps: pgMetrics.tps,
    redis_memory_mb: redisMetrics.memoryMb,
    redis_connections: redisMetrics.connections,
    redis_ops_sec: redisMetrics.opsPerSec,
    system_cpu: systemMetrics.cpuPercent,
    system_memory_mb: systemMetrics.usedMemoryMb,
    system_available_memory_mb: systemMetrics.availableMemoryMb,
  };

  appendCsvRow(outputPath, CSV_HEADERS, record);

  runtimeState.sampleCount += 1;
  if (Date.now() - runtimeState.lastSummaryAt >= SUMMARY_INTERVAL_MS) {
    runtimeState.lastSummaryAt = Date.now();
    writeSummary(timestamp, record);
  }
}

async function collectNodeMetrics() {
  const payload = await fetchMetricsPayload();
  if (!payload) {
    return {
      cpuPercent: null,
      eventLoopLagMs: null,
      heapTotalMb: null,
      heapUsedMb: null,
      rssMb: null,
    };
  }

  const cpuUsage = payload.cpu && typeof payload.cpu === 'object' ? payload.cpu : null;
  const cpuUser = cpuUsage ? Number(cpuUsage.user) : NaN;
  const cpuSystem = cpuUsage ? Number(cpuUsage.system) : NaN;
  const totalCpuMicros = cpuUser + cpuSystem;
  const nowMs = Date.now();

  let cpuPercent = null;
  if (Number.isFinite(totalCpuMicros) && runtimeState.previousNodeCpu) {
    const elapsedMicros = (nowMs - runtimeState.previousNodeCpu.timestampMs) * 1000;
    const cpuMicrosDelta = totalCpuMicros - runtimeState.previousNodeCpu.totalCpuMicros;
    if (elapsedMicros > 0 && cpuMicrosDelta >= 0) {
      cpuPercent = roundTo((cpuMicrosDelta / elapsedMicros) * 100, 2);
    }
  }

  if (Number.isFinite(totalCpuMicros)) {
    runtimeState.previousNodeCpu = {
      timestampMs: nowMs,
      totalCpuMicros,
    };
  }

  const memory = payload.memory && typeof payload.memory === 'object' ? payload.memory : null;
  const rssMb = memory ? bytesToMb(Number(memory.rss)) : null;
  const heapUsedMb = memory ? bytesToMb(Number(memory.heapUsed)) : null;
  const heapTotalMb = memory ? bytesToMb(Number(memory.heapTotal)) : null;
  const eventLoopLagMs = Number.isFinite(Number(payload.eventLoopLagMs))
    ? roundTo(Number(payload.eventLoopLagMs), 3)
    : null;

  return {
    cpuPercent,
    eventLoopLagMs,
    heapTotalMb,
    heapUsedMb,
    rssMb,
  };
}

async function fetchMetricsPayload() {
  const firstAttempt = await fetchMetricsByPath(runtimeState.activeMetricsPath);
  if (firstAttempt.ok) {
    return firstAttempt.payload;
  }

  if (
    firstAttempt.statusCode === 404 &&
    runtimeState.activeMetricsPath !== fallbackMetricsPath &&
    fallbackMetricsPath !== preferredMetricsPath
  ) {
    const fallbackAttempt = await fetchMetricsByPath(fallbackMetricsPath);
    if (fallbackAttempt.ok) {
      runtimeState.activeMetricsPath = fallbackMetricsPath;
      return fallbackAttempt.payload;
    }
  }

  return null;
}

async function fetchMetricsByPath(metricsPath) {
  if (typeof fetch !== 'function') {
    return { ok: false, payload: null, statusCode: null };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(`${coreApiBaseUrl}${metricsPath}`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, payload: null, statusCode: response.status };
    }

    const payload = await response.json();
    return { ok: true, payload, statusCode: response.status };
  } catch {
    return { ok: false, payload: null, statusCode: null };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function collectPostgresMetrics() {
  if (!runtimeState.pgPool) {
    return {
      activeConnections: null,
      idleConnections: null,
      tps: null,
      waitingConnections: null,
    };
  }

  const sql = `
    WITH activity AS (
      SELECT
        COUNT(*) FILTER (WHERE state = 'active')::int AS active_connections,
        COUNT(*) FILTER (WHERE state = 'idle')::int AS idle_connections,
        COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL)::int AS waiting_connections
      FROM pg_stat_activity
    ),
    tx AS (
      SELECT COALESCE(SUM(xact_commit + xact_rollback), 0)::bigint AS total_transactions
      FROM pg_stat_database
    )
    SELECT
      activity.active_connections,
      activity.idle_connections,
      activity.waiting_connections,
      tx.total_transactions
    FROM activity, tx;
  `;

  try {
    const result = await runtimeState.pgPool.query(sql);
    const row = result.rows[0] || {};
    const nowMs = Date.now();

    const activeConnections = toSafeNumber(row.active_connections);
    const idleConnections = toSafeNumber(row.idle_connections);
    const waitingConnections = toSafeNumber(row.waiting_connections);
    const totalTransactions = toSafeNumber(row.total_transactions);

    let tps = null;
    if (totalTransactions !== null && runtimeState.previousPgTransactions) {
      const elapsedSec = (nowMs - runtimeState.previousPgTransactions.timestampMs) / 1000;
      const deltaTransactions =
        totalTransactions - runtimeState.previousPgTransactions.totalTransactions;
      if (elapsedSec > 0 && deltaTransactions >= 0) {
        tps = roundTo(deltaTransactions / elapsedSec, 2);
      }
    }

    if (totalTransactions !== null) {
      runtimeState.previousPgTransactions = {
        timestampMs: nowMs,
        totalTransactions,
      };
    }

    return {
      activeConnections,
      idleConnections,
      tps,
      waitingConnections,
    };
  } catch {
    return {
      activeConnections: null,
      idleConnections: null,
      tps: null,
      waitingConnections: null,
    };
  }
}

async function collectRedisMetrics() {
  if (redisUrl.length === 0) {
    return {
      connections: null,
      memoryMb: null,
      opsPerSec: null,
    };
  }

  try {
    const { stdout } = await execFileAsync(redisCliCommand, ['-u', redisUrl, '--raw', 'INFO'], {
      maxBuffer: 1024 * 1024,
      timeout: REDIS_TIMEOUT_MS,
      windowsHide: true,
    });
    const info = parseRedisInfo(stdout);

    const usedMemoryBytes = toSafeNumber(info.used_memory);
    const connections = toSafeNumber(info.connected_clients);
    const opsPerSec = toSafeNumber(info.instantaneous_ops_per_sec);

    return {
      connections,
      memoryMb: usedMemoryBytes === null ? null : bytesToMb(usedMemoryBytes),
      opsPerSec,
    };
  } catch {
    return {
      connections: null,
      memoryMb: null,
      opsPerSec: null,
    };
  }
}

function collectSystemMetrics() {
  const currentSnapshot = snapshotSystemCpu();
  let cpuPercent = null;

  if (runtimeState.previousSystemCpu) {
    const idleDelta = currentSnapshot.idle - runtimeState.previousSystemCpu.idle;
    const totalDelta = currentSnapshot.total - runtimeState.previousSystemCpu.total;
    if (totalDelta > 0) {
      cpuPercent = roundTo((1 - idleDelta / totalDelta) * 100, 2);
    }
  }

  runtimeState.previousSystemCpu = currentSnapshot;

  const totalMemoryMb = bytesToMb(os.totalmem());
  const availableMemoryMb = bytesToMb(os.freemem());
  const usedMemoryMb =
    totalMemoryMb !== null && availableMemoryMb !== null
      ? roundTo(totalMemoryMb - availableMemoryMb, 2)
      : null;

  return {
    availableMemoryMb,
    cpuPercent,
    usedMemoryMb,
  };
}

function snapshotSystemCpu() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (let index = 0; index < cpus.length; index += 1) {
    const cpuTimes = cpus[index].times;
    idle += cpuTimes.idle;
    total += cpuTimes.user + cpuTimes.nice + cpuTimes.sys + cpuTimes.idle + cpuTimes.irq;
  }

  return {
    idle,
    total,
  };
}

function parseRedisInfo(rawOutput) {
  const parsed = {};
  const lines = String(rawOutput || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    parsed[key] = value;
  }

  return parsed;
}

function writeSummary(timestamp, record) {
  const timeLabel = formatTimeLabel(timestamp);
  const summary =
    `[${timeLabel}] Node: CPU=${formatPercent(record.node_cpu)} Mem=${formatMegabytes(record.node_memory_rss)} Lag=${formatMilliseconds(record.node_event_loop_lag)}` +
    ` | PG: Active=${formatInteger(record.pg_active_connections)} Idle=${formatInteger(record.pg_idle_connections)} Wait=${formatInteger(record.pg_waiting_connections)} TPS=${formatRate(record.pg_tps)}` +
    ` | Redis: Mem=${formatMegabytes(record.redis_memory_mb)} Conn=${formatInteger(record.redis_connections)} Ops=${formatRate(record.redis_ops_sec)}` +
    ` | System: CPU=${formatPercent(record.system_cpu)} Mem=${formatMegabytes(record.system_memory_mb)} Avail=${formatMegabytes(record.system_available_memory_mb)}\n`;

  process.stdout.write(summary);
}

async function shutdown(signalName) {
  if (runtimeState.isShuttingDown) {
    return;
  }

  runtimeState.isShuttingDown = true;
  process.stdout.write(`[monitor] Received ${signalName}, shutting down...\n`);

  if (runtimeState.intervalHandle) {
    clearInterval(runtimeState.intervalHandle);
    runtimeState.intervalHandle = null;
  }

  while (runtimeState.collecting) {
    await sleep(50);
  }

  if (runtimeState.pgPool) {
    try {
      await runtimeState.pgPool.end();
    } catch {
      // ignore close errors and continue shutdown
    }
  }

  const durationSec = roundTo((Date.now() - runtimeState.startedAtMs) / 1000, 1);
  process.stdout.write(
    `[monitor] Stopped. samples=${runtimeState.sampleCount} duration=${durationSec}s output=${outputPath}\n`
  );
  process.exit(0);
}

function createPgPool() {
  if (!PgPool || pgConnectionString.length === 0) {
    return null;
  }

  return new PgPool({
    connectionString: pgConnectionString,
    connectionTimeoutMillis: 1500,
    idleTimeoutMillis: 5000,
    max: 5,
  });
}

function ensureCsvFile(filePath, headers) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    fs.writeFileSync(filePath, `${headers.join(',')}\n`, 'utf8');
  }
}

function appendCsvRow(filePath, headers, values) {
  const row = headers.map((header) => formatCsvValue(values[header])).join(',');
  fs.appendFileSync(filePath, `${row}\n`, 'utf8');
}

function formatCsvValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(value);
}

function formatTimeLabel(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatPercent(value) {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`;
}

function formatMegabytes(value) {
  return value === null ? 'N/A' : `${value.toFixed(0)}MB`;
}

function formatMilliseconds(value) {
  return value === null ? 'N/A' : `${value.toFixed(2)}ms`;
}

function formatInteger(value) {
  return value === null ? 'N/A' : `${Math.round(value)}`;
}

function formatRate(value) {
  return value === null ? 'N/A' : `${value.toFixed(1)}`;
}

function normalizePath(pathValue) {
  if (pathValue.startsWith('/')) {
    return pathValue;
  }
  return `/${pathValue}`;
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function bytesToMb(value) {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return roundTo(value / (1024 * 1024), 2);
}

function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value, digits) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readStringEnv(name, fallback) {
  const rawValue = process.env[name];
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  const trimmed = rawValue.trim();
  return trimmed.length === 0 ? fallback : trimmed;
}

function readPositiveIntEnv(name, fallback) {
  const rawValue = process.env[name];
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  const message =
    error && typeof error === 'object' && typeof error.message === 'string'
      ? error.message
      : 'unknown_error';
  process.stderr.write(`[monitor] fatal error: ${message}\n`);
  process.exit(1);
});
