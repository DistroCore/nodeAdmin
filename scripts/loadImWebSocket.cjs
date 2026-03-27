const cluster = require('node:cluster');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { io } = require('socket.io-client');

const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';
const DEFAULT_TENANT_ID = 'tenant-demo';
const DEFAULT_MAX_CONNECTIONS = 5000;
const DEFAULT_RAMP_DURATION_SEC = 30;
const DEFAULT_HOLD_DURATION_SEC = 60;
const DEFAULT_WORKER_COUNT = 10;

const CONNECT_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 5_000;
const MESSAGE_TIMEOUT_MS = 5_000;
const MESSAGE_INTERVAL_MS = 5_000;
const METRIC_FLUSH_INTERVAL_MS = 1_000;
const SHUTDOWN_GRACE_MS = 15_000;
const CONVERSATION_BUCKETS = 200;

const runtimeConfig = {
  baseUrl: readStringEnv('CORE_API_BASE_URL', DEFAULT_BASE_URL),
  socketUrl: readStringEnv('CORE_API_SOCKET_URL', ''),
  tenantId: readStringEnv('SMOKE_TENANT_ID', DEFAULT_TENANT_ID),
  maxConnections: readPositiveIntEnv('MAX_CONNECTIONS', DEFAULT_MAX_CONNECTIONS),
  rampDurationSec: readPositiveIntEnv('RAMP_DURATION', DEFAULT_RAMP_DURATION_SEC),
  holdDurationSec: readPositiveIntEnv('HOLD_DURATION', DEFAULT_HOLD_DURATION_SEC),
};

runtimeConfig.socketUrl =
  runtimeConfig.socketUrl.length > 0 ? runtimeConfig.socketUrl : runtimeConfig.baseUrl;

if (cluster.isPrimary) {
  runMaster(runtimeConfig).catch((error) => {
    console.error('[loadImWebSocket] master failed:', error);
    process.exit(1);
  });
} else {
  runWorker(runtimeConfig).catch((error) => {
    recordWorkerFatal(error);
    process.exit(1);
  });
}

function readStringEnv(name, fallback) {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? fallback : trimmed;
}

function readPositiveIntEnv(name, fallback) {
  const rawValue = process.env[name];
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function safeRate(numerator, denominator) {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function buildStages(maxConnections, rampDurationSec, holdDurationSec) {
  const stageOneTarget = Math.min(maxConnections, 1000);
  const stageTwoTarget = Math.min(maxConnections, 3000);
  const stageThreeTarget = maxConnections;

  const stages = [
    { name: 'stage1', from: 0, to: stageOneTarget, durationSec: rampDurationSec },
    { name: 'stage2', from: stageOneTarget, to: stageTwoTarget, durationSec: rampDurationSec },
    { name: 'stage3', from: stageTwoTarget, to: stageThreeTarget, durationSec: rampDurationSec },
    { name: 'stage4', from: stageThreeTarget, to: stageThreeTarget, durationSec: holdDurationSec },
    { name: 'stage5', from: stageThreeTarget, to: 0, durationSec: rampDurationSec },
  ];

  let elapsedSec = 0;
  return stages.map((stage) => {
    const stageWithTimeline = {
      ...stage,
      startSec: elapsedSec,
      endSec: elapsedSec + stage.durationSec,
    };
    elapsedSec += stage.durationSec;
    return stageWithTimeline;
  });
}

function getCurrentStage(stages, elapsedSec) {
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    if (elapsedSec <= stage.endSec) {
      return stage;
    }
  }

  return stages[stages.length - 1];
}

function computeDesiredConnections(stages, elapsedSec) {
  const stage = getCurrentStage(stages, elapsedSec);
  if (!stage) {
    return 0;
  }

  if (stage.durationSec <= 0) {
    return stage.to;
  }

  const stageElapsed = Math.max(0, Math.min(stage.durationSec, elapsedSec - stage.startSec));
  const progress = stageElapsed / stage.durationSec;
  const desired = stage.from + (stage.to - stage.from) * progress;

  return Math.max(0, Math.round(desired));
}

function createWorkerSlots(maxConnections, requestedWorkerCount) {
  const workerCount = Math.max(1, Math.min(requestedWorkerCount, maxConnections));
  const baseCapacity = Math.floor(maxConnections / workerCount);
  const remainder = maxConnections % workerCount;

  return Array.from({ length: workerCount }, (_, workerIndex) => ({
    workerIndex,
    capacity: baseCapacity + (workerIndex < remainder ? 1 : 0),
  }));
}

function computeTargetsForWorkers(slots, desiredConnections) {
  const workerCount = slots.length;
  const baseTarget = Math.floor(desiredConnections / workerCount);
  const remainder = desiredConnections % workerCount;

  return slots.map((slot, slotIndex) => {
    const plannedTarget = baseTarget + (slotIndex < remainder ? 1 : 0);
    return Math.min(slot.capacity, plannedTarget);
  });
}

function summarizeLatencies(latencies) {
  if (latencies.length === 0) {
    return {
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

function percentile(sorted, ratio) {
  const index = Math.ceil(sorted.length * ratio) - 1;
  const boundedIndex = Math.min(sorted.length - 1, Math.max(0, index));
  return sorted[boundedIndex];
}

async function runMaster(config) {
  const stages = buildStages(config.maxConnections, config.rampDurationSec, config.holdDurationSec);
  const totalDurationSec = stages[stages.length - 1].endSec;
  const workerSlots = createWorkerSlots(config.maxConnections, DEFAULT_WORKER_COUNT);
  const metricsEmitter = new EventEmitter();
  const reportPath = path.resolve(__dirname, '..', 'reports', 'websocket-load-report.json');

  const aggregate = {
    connectionAttempts: 0,
    failedConnections: 0,
    successfulConnections: 0,
    totalMessagesSent: 0,
    totalMessagesReceived: 0,
    totalErrors: 0,
    latencies: [],
    errors: new Map(),
  };

  const workerStateByClusterId = new Map();
  let readyWorkers = 0;
  let desiredConnections = 0;
  let tickerHandle = null;
  let shutdownReason = null;
  let shutdownInitiated = false;
  let finalizeResolver = null;

  const finalizedPromise = new Promise((resolve) => {
    finalizeResolver = resolve;
  });

  process.stdout.write('[loadImWebSocket] Starting clustered WebSocket load test.\n');
  process.stdout.write(
    `[loadImWebSocket] Config: maxConnections=${config.maxConnections}, rampDuration=${config.rampDurationSec}s, holdDuration=${config.holdDurationSec}s, workers=${workerSlots.length}\n`
  );

  for (let slotIndex = 0; slotIndex < workerSlots.length; slotIndex += 1) {
    const slot = workerSlots[slotIndex];
    const worker = cluster.fork({
      LOAD_WORKER_CAPACITY: String(slot.capacity),
      LOAD_WORKER_INDEX: String(slot.workerIndex),
    });

    workerStateByClusterId.set(worker.id, {
      capacity: slot.capacity,
      isExited: false,
      worker,
      workerIndex: slot.workerIndex,
    });

    worker.on('message', (message) => {
      metricsEmitter.emit('workerMessage', message);
    });
  }

  cluster.on('exit', (worker) => {
    const state = workerStateByClusterId.get(worker.id);
    if (state) {
      state.isExited = true;
    }

    const aliveWorkers = getAliveWorkers(workerStateByClusterId);
    if (aliveWorkers.length === 0) {
      if (shutdownInitiated) {
        finalizeResolver();
      } else {
        initiateShutdown('workers_exited_unexpectedly');
      }
    }
  });

  metricsEmitter.on('workerMessage', (message) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'ready') {
      readyWorkers += 1;
      if (readyWorkers === workerSlots.length) {
        process.stdout.write('[loadImWebSocket] All workers ready. Starting ramping scenario.\n');
        startTicker();
      }
      return;
    }

    if (message.type === 'metrics') {
      mergeWorkerMetrics(aggregate, message.snapshot);
      return;
    }

    if (message.type === 'workerError') {
      incrementError(aggregate.errors, 'worker_fatal', 1);
      aggregate.totalErrors += 1;
      return;
    }

    if (message.type === 'workerStopped') {
      return;
    }
  });

  function startTicker() {
    const startedAt = Date.now();
    let lastStageName = '';
    let lastPrintedAtMs = 0;

    tickerHandle = setInterval(() => {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const stage = getCurrentStage(stages, elapsedSec);
      const nextDesiredConnections = computeDesiredConnections(stages, elapsedSec);

      if (nextDesiredConnections !== desiredConnections) {
        desiredConnections = nextDesiredConnections;
        broadcastTargets(desiredConnections);
      }

      if (stage && stage.name !== lastStageName) {
        lastStageName = stage.name;
        process.stdout.write(
          `[loadImWebSocket] Enter ${stage.name}: target ${stage.from} -> ${stage.to} in ${stage.durationSec}s\n`
        );
      }

      if (Date.now() - lastPrintedAtMs >= 5000) {
        lastPrintedAtMs = Date.now();
        process.stdout.write(
          `[loadImWebSocket] elapsed=${elapsedSec.toFixed(1)}s desired=${desiredConnections} attempts=${aggregate.connectionAttempts} connected=${aggregate.successfulConnections} sent=${aggregate.totalMessagesSent} recv=${aggregate.totalMessagesReceived}\n`
        );
      }

      if (elapsedSec >= totalDurationSec) {
        initiateShutdown('scenario_completed');
      }
    }, 1000);

    tickerHandle.unref();
  }

  function broadcastTargets(targetConnections) {
    const targets = computeTargetsForWorkers(workerSlots, targetConnections);
    const workerStates = Array.from(workerStateByClusterId.values());

    for (let slotIndex = 0; slotIndex < workerSlots.length; slotIndex += 1) {
      const slot = workerSlots[slotIndex];
      const workerState = workerStates.find(
        (candidateState) => candidateState.workerIndex === slot.workerIndex
      );

      if (!workerState || workerState.isExited) {
        continue;
      }

      workerState.worker.send({
        target: targets[slotIndex],
        type: 'setTarget',
      });
    }
  }

  function initiateShutdown(reason) {
    if (shutdownInitiated) {
      return;
    }

    shutdownInitiated = true;
    shutdownReason = reason;

    if (tickerHandle) {
      clearInterval(tickerHandle);
      tickerHandle = null;
    }

    process.stdout.write(`[loadImWebSocket] Shutdown requested (${reason}). Closing workers...\n`);

    const aliveWorkers = getAliveWorkers(workerStateByClusterId);
    if (aliveWorkers.length === 0) {
      finalizeResolver();
      return;
    }

    for (let index = 0; index < aliveWorkers.length; index += 1) {
      aliveWorkers[index].worker.send({
        reason,
        type: 'shutdown',
      });
    }

    setTimeout(() => {
      const remainingWorkers = getAliveWorkers(workerStateByClusterId);
      for (let index = 0; index < remainingWorkers.length; index += 1) {
        remainingWorkers[index].worker.process.kill('SIGTERM');
      }
    }, SHUTDOWN_GRACE_MS).unref();
  }

  process.on('SIGINT', () => {
    initiateShutdown('sigint');
  });

  process.on('SIGTERM', () => {
    initiateShutdown('sigterm');
  });

  await finalizedPromise;

  const report = buildFinalReport(config, aggregate, shutdownReason || 'unknown');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  printHumanReadableSummary(report, reportPath);
}

function getAliveWorkers(workerStateByClusterId) {
  return Array.from(workerStateByClusterId.values()).filter((workerState) => !workerState.isExited);
}

function mergeWorkerMetrics(aggregate, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return;
  }

  aggregate.connectionAttempts += Number(snapshot.connectionAttempts || 0);
  aggregate.failedConnections += Number(snapshot.failedConnections || 0);
  aggregate.successfulConnections += Number(snapshot.successfulConnections || 0);
  aggregate.totalMessagesSent += Number(snapshot.totalMessagesSent || 0);
  aggregate.totalMessagesReceived += Number(snapshot.totalMessagesReceived || 0);
  aggregate.totalErrors += Number(snapshot.totalErrors || 0);

  if (Array.isArray(snapshot.latencies) && snapshot.latencies.length > 0) {
    for (let index = 0; index < snapshot.latencies.length; index += 1) {
      const latency = Number(snapshot.latencies[index]);
      if (Number.isFinite(latency) && latency >= 0) {
        aggregate.latencies.push(latency);
      }
    }
  }

  const errorEntries =
    snapshot.errors && typeof snapshot.errors === 'object' ? Object.entries(snapshot.errors) : [];
  for (let index = 0; index < errorEntries.length; index += 1) {
    const [type, countValue] = errorEntries[index];
    const count = Number(countValue || 0);
    if (count <= 0) {
      continue;
    }
    incrementError(aggregate.errors, type, count);
  }
}

function incrementError(errorMap, type, amount) {
  const currentCount = errorMap.get(type) || 0;
  errorMap.set(type, currentCount + amount);
}

function buildFinalReport(config, aggregate, shutdownReason) {
  const latencySummary = summarizeLatencies(aggregate.latencies);
  const totalMessagesLost = Math.max(
    aggregate.totalMessagesSent - aggregate.totalMessagesReceived,
    0
  );
  const totalRequests = aggregate.connectionAttempts + aggregate.totalMessagesSent;

  return {
    summary: {
      totalConnections: config.maxConnections,
      totalConnectionAttempts: aggregate.connectionAttempts,
      successfulConnections: aggregate.successfulConnections,
      failedConnections: aggregate.failedConnections,
      connectionSuccessRate: safeRate(
        aggregate.successfulConnections,
        aggregate.connectionAttempts
      ),
      totalMessagesSent: aggregate.totalMessagesSent,
      totalMessagesReceived: aggregate.totalMessagesReceived,
      messageLossRate: safeRate(totalMessagesLost, aggregate.totalMessagesSent),
      errorRate: safeRate(aggregate.totalErrors, totalRequests),
      shutdownReason,
    },
    latency: latencySummary,
    errors: Array.from(aggregate.errors.entries())
      .map(([type, count]) => ({ count, type }))
      .sort((leftItem, rightItem) => rightItem.count - leftItem.count),
  };
}

function printHumanReadableSummary(report, reportPath) {
  const summary = report.summary;
  const latency = report.latency;

  process.stdout.write('\n=== WebSocket Load Test Summary ===\n');
  process.stdout.write(`Total Connections Target : ${summary.totalConnections}\n`);
  process.stdout.write(`Connection Attempts      : ${summary.totalConnectionAttempts}\n`);
  process.stdout.write(`Successful Connections   : ${summary.successfulConnections}\n`);
  process.stdout.write(`Failed Connections       : ${summary.failedConnections}\n`);
  process.stdout.write(
    `Connection Success Rate  : ${(summary.connectionSuccessRate * 100).toFixed(2)}%\n`
  );
  process.stdout.write(`Messages Sent            : ${summary.totalMessagesSent}\n`);
  process.stdout.write(`Messages Received        : ${summary.totalMessagesReceived}\n`);
  process.stdout.write(
    `Message Loss Rate        : ${(summary.messageLossRate * 100).toFixed(2)}%\n`
  );
  process.stdout.write(`Error Rate               : ${(summary.errorRate * 100).toFixed(2)}%\n`);
  process.stdout.write(
    `Latency P50/P95/P99/Max  : ${latency.p50.toFixed(2)} / ${latency.p95.toFixed(2)} / ${latency.p99.toFixed(2)} / ${latency.max.toFixed(2)} ms\n`
  );
  process.stdout.write(`Shutdown Reason          : ${summary.shutdownReason}\n`);
  process.stdout.write(`JSON Report              : ${reportPath}\n`);
}

function createWorkerMetricBuffer() {
  return {
    connectionAttempts: 0,
    failedConnections: 0,
    successfulConnections: 0,
    totalMessagesSent: 0,
    totalMessagesReceived: 0,
    totalErrors: 0,
    latencies: [],
    errors: new Map(),
  };
}

function resetMetricBuffer(metricBuffer) {
  metricBuffer.connectionAttempts = 0;
  metricBuffer.failedConnections = 0;
  metricBuffer.successfulConnections = 0;
  metricBuffer.totalMessagesSent = 0;
  metricBuffer.totalMessagesReceived = 0;
  metricBuffer.totalErrors = 0;
  metricBuffer.latencies = [];
  metricBuffer.errors = new Map();
}

async function runWorker(config) {
  const workerIndex = readPositiveIntEnv('LOAD_WORKER_INDEX', 0);
  const workerCapacity = readPositiveIntEnv('LOAD_WORKER_CAPACITY', 0);

  const metricBuffer = createWorkerMetricBuffer();
  const workerEventEmitter = new EventEmitter();
  const connections = new Map();
  let desiredConnections = 0;
  let accessToken = '';
  let tokenPromise = null;
  let connectionSequence = 0;
  let pendingConnectionCreates = 0;
  let shuttingDown = false;
  let reconcileInProgress = false;
  let reconcilePending = false;

  const metricFlushHandle = setInterval(() => {
    flushMetrics(false);
  }, METRIC_FLUSH_INTERVAL_MS);

  workerEventEmitter.on('metric', (metric) => {
    if (!metric || typeof metric !== 'object') {
      return;
    }

    const metricType = metric.type;
    if (metricType === 'connectionAttempt') {
      metricBuffer.connectionAttempts += 1;
      return;
    }
    if (metricType === 'connectionSuccess') {
      metricBuffer.successfulConnections += 1;
      return;
    }
    if (metricType === 'connectionFail') {
      metricBuffer.failedConnections += 1;
      return;
    }
    if (metricType === 'messageSent') {
      metricBuffer.totalMessagesSent += 1;
      return;
    }
    if (metricType === 'messageReceived') {
      metricBuffer.totalMessagesReceived += 1;
      if (Number.isFinite(metric.latencyMs) && metric.latencyMs >= 0) {
        metricBuffer.latencies.push(metric.latencyMs);
      }
      return;
    }
    if (metricType === 'error') {
      metricBuffer.totalErrors += 1;
      const currentCount = metricBuffer.errors.get(metric.errorType) || 0;
      metricBuffer.errors.set(metric.errorType, currentCount + 1);
    }
  });

  function flushMetrics(force) {
    if (!process.send) {
      resetMetricBuffer(metricBuffer);
      return;
    }

    const hasData =
      force ||
      metricBuffer.connectionAttempts > 0 ||
      metricBuffer.failedConnections > 0 ||
      metricBuffer.successfulConnections > 0 ||
      metricBuffer.totalMessagesSent > 0 ||
      metricBuffer.totalMessagesReceived > 0 ||
      metricBuffer.totalErrors > 0 ||
      metricBuffer.latencies.length > 0 ||
      metricBuffer.errors.size > 0;

    if (!hasData) {
      return;
    }

    process.send({
      snapshot: {
        connectionAttempts: metricBuffer.connectionAttempts,
        errors: Object.fromEntries(metricBuffer.errors.entries()),
        failedConnections: metricBuffer.failedConnections,
        latencies: [...metricBuffer.latencies],
        successfulConnections: metricBuffer.successfulConnections,
        totalErrors: metricBuffer.totalErrors,
        totalMessagesReceived: metricBuffer.totalMessagesReceived,
        totalMessagesSent: metricBuffer.totalMessagesSent,
      },
      type: 'metrics',
    });

    resetMetricBuffer(metricBuffer);
  }

  function reportError(errorType) {
    workerEventEmitter.emit('metric', { errorType, type: 'error' });
  }

  function classifyError(error, defaultType = 'unknown_error') {
    if (!error || typeof error !== 'object') {
      return defaultType;
    }

    if (typeof error.metricType === 'string' && error.metricType.length > 0) {
      return error.metricType;
    }

    if (typeof error.code === 'string') {
      if (error.code === 'ETIMEDOUT') {
        return 'connection_timeout';
      }
      if (error.code === 'ECONNREFUSED') {
        return 'connection_refused';
      }
      if (error.code === 'ECONNRESET') {
        return 'connection_reset';
      }
    }

    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    if (message.includes('timeout')) {
      return 'connection_timeout';
    }
    if (message.includes('refused')) {
      return 'connection_refused';
    }
    if (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('token')
    ) {
      return 'auth_error';
    }

    return defaultType;
  }

  function createTaggedError(metricType, message) {
    const error = new Error(message);
    error.metricType = metricType;
    return error;
  }

  async function issueAccessToken() {
    const response = await fetch(`${config.baseUrl}/api/v1/auth/dev-token`, {
      body: JSON.stringify({
        roles: ['tenant:admin', 'im:operator'],
        tenantId: config.tenantId,
        userId: `load-worker-${workerIndex}`,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw createTaggedError(
        'token_issue_failed',
        `Token issue failed with status ${response.status}`
      );
    }

    const payload = await response.json();
    if (!payload || typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
      throw createTaggedError(
        'token_issue_invalid_response',
        'Token issue response missing accessToken.'
      );
    }

    return payload.accessToken;
  }

  async function getAccessToken() {
    if (accessToken.length > 0) {
      return accessToken;
    }

    if (!tokenPromise) {
      tokenPromise = issueAccessToken()
        .then((token) => {
          accessToken = token;
          return token;
        })
        .finally(() => {
          tokenPromise = null;
        });
    }

    return tokenPromise;
  }

  function createConversationId(connectionIndex) {
    const bucketIndex =
      (workerIndex * CONVERSATION_BUCKETS + connectionIndex) % CONVERSATION_BUCKETS;
    return `conversation-load-${bucketIndex}`;
  }

  function waitForConnect(socket, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timeoutHandle = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(createTaggedError('connection_timeout', 'Socket connection timeout.'));
      }, timeoutMs);

      const handleConnect = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      const handleConnectError = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };

      function cleanup() {
        clearTimeout(timeoutHandle);
        socket.off('connect', handleConnect);
        socket.off('connect_error', handleConnectError);
      }

      socket.on('connect', handleConnect);
      socket.on('connect_error', handleConnectError);
    });
  }

  function emitWithAck(
    socket,
    eventName,
    payload,
    timeoutMs,
    validateAck,
    timeoutType,
    rejectType
  ) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timeoutHandle = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(createTaggedError(timeoutType, `${eventName} timeout`));
      }, timeoutMs);

      try {
        socket.emit(eventName, payload, (ack) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutHandle);

          if (!validateAck(ack)) {
            reject(createTaggedError(rejectType, `${eventName} rejected`));
            return;
          }

          resolve(ack);
        });
      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  function clearPendingMessages(connectionState) {
    const pendingEntries = Array.from(connectionState.pendingMessages.entries());
    for (let index = 0; index < pendingEntries.length; index += 1) {
      const [, pending] = pendingEntries[index];
      clearTimeout(pending.timeoutHandle);
    }
    connectionState.pendingMessages.clear();
  }

  function teardownConnection(connectionId, removeOnly) {
    const connectionState = connections.get(connectionId);
    if (!connectionState) {
      return;
    }

    connectionState.closing = true;
    clearInterval(connectionState.sendHandle);
    clearPendingMessages(connectionState);
    connections.delete(connectionId);

    if (!removeOnly) {
      connectionState.socket.disconnect();
    }
  }

  function attachConnectionEvents(connectionState) {
    connectionState.socket.on('messageReceived', (message) => {
      const messageId = message && typeof message.messageId === 'string' ? message.messageId : '';
      if (messageId.length === 0) {
        return;
      }

      const pending = connectionState.pendingMessages.get(messageId);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeoutHandle);
      connectionState.pendingMessages.delete(messageId);

      workerEventEmitter.emit('metric', {
        latencyMs: Date.now() - pending.sentAt,
        type: 'messageReceived',
      });
    });

    connectionState.socket.on('disconnect', () => {
      if (connectionState.closing) {
        return;
      }

      teardownConnection(connectionState.connectionId, true);
      reportError('socket_disconnect');

      if (!shuttingDown) {
        scheduleReconcile();
      }
    });

    connectionState.socket.on('error', () => {
      reportError('socket_error');
    });
  }

  async function sendMessage(connectionState) {
    if (shuttingDown || connectionState.closing) {
      return;
    }

    if (!connectionState.socket.connected) {
      reportError('socket_not_connected');
      return;
    }

    const messageId = `load-${workerIndex}-${connectionState.connectionId}-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;

    connectionState.pendingMessages.set(messageId, {
      sentAt: Date.now(),
      timeoutHandle: setTimeout(() => {
        if (!connectionState.pendingMessages.has(messageId)) {
          return;
        }
        connectionState.pendingMessages.delete(messageId);
        reportError('message_timeout');
      }, MESSAGE_TIMEOUT_MS),
    });

    workerEventEmitter.emit('metric', { type: 'messageSent' });

    try {
      await emitWithAck(
        connectionState.socket,
        'sendMessage',
        {
          content: `[load] ${new Date().toISOString()}`,
          conversationId: connectionState.conversationId,
          messageId,
          traceId,
        },
        SEND_TIMEOUT_MS,
        (ack) => Boolean(ack && ack.accepted === true),
        'send_timeout',
        'send_rejected'
      );
    } catch (error) {
      const pending = connectionState.pendingMessages.get(messageId);
      if (pending) {
        clearTimeout(pending.timeoutHandle);
        connectionState.pendingMessages.delete(messageId);
      }
      reportError(classifyError(error, 'send_error'));
    }
  }

  async function createConnection() {
    if (shuttingDown || connections.size >= workerCapacity) {
      return;
    }

    const sequenceId = connectionSequence;
    connectionSequence += 1;
    workerEventEmitter.emit('metric', { type: 'connectionAttempt' });
    pendingConnectionCreates += 1;

    let socket = null;
    let shouldDelayRetry = false;

    try {
      const token = await getAccessToken();
      const conversationId = createConversationId(sequenceId);
      socket = io(config.socketUrl, {
        auth: {
          token,
        },
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
      });

      await waitForConnect(socket, CONNECT_TIMEOUT_MS);
      await emitWithAck(
        socket,
        'joinConversation',
        { conversationId },
        CONNECT_TIMEOUT_MS,
        (ack) => Boolean(ack && ack.ok === true),
        'join_timeout',
        'join_rejected'
      );

      const connectionId = `${workerIndex}-${sequenceId}`;
      const connectionState = {
        closing: false,
        connectionId,
        conversationId,
        pendingMessages: new Map(),
        sendHandle: null,
        socket,
      };

      connections.set(connectionId, connectionState);
      attachConnectionEvents(connectionState);

      connectionState.sendHandle = setInterval(() => {
        sendMessage(connectionState).catch(() => {
          reportError('send_error');
        });
      }, MESSAGE_INTERVAL_MS);

      connectionState.sendHandle.unref();

      sendMessage(connectionState).catch(() => {
        reportError('send_error');
      });

      workerEventEmitter.emit('metric', { type: 'connectionSuccess' });
    } catch (error) {
      if (socket) {
        socket.disconnect();
      }

      const errorType = classifyError(error, 'connection_error');
      if (errorType === 'auth_error' || errorType === 'token_issue_failed') {
        accessToken = '';
      }

      workerEventEmitter.emit('metric', { type: 'connectionFail' });
      reportError(errorType);
      shouldDelayRetry = true;
    } finally {
      pendingConnectionCreates = Math.max(0, pendingConnectionCreates - 1);
      if (!shuttingDown) {
        if (shouldDelayRetry) {
          setTimeout(() => {
            if (!shuttingDown) {
              scheduleReconcile();
            }
          }, 500).unref();
        } else {
          scheduleReconcile();
        }
      }
    }
  }

  function closeConnections(count) {
    const connectionIds = Array.from(connections.keys()).slice(0, count);
    for (let index = 0; index < connectionIds.length; index += 1) {
      teardownConnection(connectionIds[index], false);
    }
  }

  async function reconcile() {
    if (reconcileInProgress) {
      reconcilePending = true;
      return;
    }

    reconcileInProgress = true;
    try {
      do {
        reconcilePending = false;

        if (connections.size > desiredConnections) {
          closeConnections(connections.size - desiredConnections);
        }

        const activeTotal = connections.size + pendingConnectionCreates;
        const deficit = Math.min(workerCapacity, desiredConnections) - activeTotal;
        if (deficit > 0) {
          for (let index = 0; index < deficit; index += 1) {
            createConnection().catch(() => {
              reportError('connection_create_error');
            });
          }
        }
      } while (reconcilePending);
    } finally {
      reconcileInProgress = false;
    }
  }

  function scheduleReconcile() {
    reconcile().catch(() => {
      reportError('reconcile_error');
    });
  }

  let shutdownPromise = null;
  async function gracefulShutdown() {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      shuttingDown = true;
      desiredConnections = 0;
      clearInterval(metricFlushHandle);

      const connectionIds = Array.from(connections.keys());
      for (let index = 0; index < connectionIds.length; index += 1) {
        teardownConnection(connectionIds[index], false);
      }

      flushMetrics(true);

      if (process.send) {
        process.send({
          type: 'workerStopped',
          workerIndex,
        });
      }
    })();

    return shutdownPromise;
  }

  process.on('message', (message) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'setTarget') {
      const requestedTarget = Number(message.target || 0);
      desiredConnections = Math.max(0, Math.min(workerCapacity, requestedTarget));
      scheduleReconcile();
      return;
    }

    if (message.type === 'shutdown') {
      gracefulShutdown().finally(() => {
        setTimeout(() => {
          process.exit(0);
        }, 10).unref();
      });
    }
  });

  process.on('SIGINT', () => {
    gracefulShutdown().finally(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    gracefulShutdown().finally(() => {
      process.exit(0);
    });
  });

  if (process.send) {
    process.send({
      type: 'ready',
      workerIndex,
    });
  }
}

function recordWorkerFatal(error) {
  if (process.send) {
    process.send({
      errorMessage: error && error.message ? error.message : 'unknown worker fatal error',
      type: 'workerError',
    });
  }
}
