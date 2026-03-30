# Phase 2 Horizontal Scaling Baseline

Date: 2026-03-30
Scope: CoreApi horizontal scaling validation for Socket.IO, Redis, Kafka, Nginx, and load tooling.

## Topology

- CoreApi app nodes:
  - `coreapi-node1` on host port `11461`
  - `coreapi-node2` on host port `11462`
  - `coreapi-node3` on host port `11463`
- Redis modes:
  - Single-node adapter baseline via `REDIS_URL=redis://redis:6379`
  - Cluster mode via `REDIS_CLUSTER_NODES=redis://redis-cluster-node-1:7001,...,redis://redis-cluster-node-6:7006`
- Kafka:
  - Broker default partitions raised to `6`
  - Topic bootstrap script supports expansion from `6` up to `12+` via environment override
- Nginx:
  - `nginx-scale` on host port `3444`
  - HTTP upstream uses `least_conn`
  - WebSocket upstream uses consistent hash affinity on `remote_addr + user-agent`

## Files Added Or Updated

- `infra/docker-compose.yml`
- `infra/nginx/nginx.phase2.conf`
- `apps/coreApi/src/app/runtimeConfig.ts`
- `apps/coreApi/src/modules/im/imGateway.ts`
- `apps/coreApi/Dockerfile`
- `scripts/validateSocketIoMultiNode.cjs`
- `scripts/verifyRedisCluster.cjs`
- `scripts/bootstrapKafkaTopics.cjs`
- `scripts/loadImWebSocket.cjs`
- `scripts/smokeOutboxKafka.cjs`

## Verified Results

### 1. Multi-node Socket.IO delivery

Command:

```bash
npm run smoke:im:multinode
```

Observed result:

- `coreapi-node1` sent a message to a shared conversation
- `coreapi-node2` and `coreapi-node3` both received the broadcast
- Sequence IDs matched across receivers

### 2. Redis Cluster

Command:

```bash
npm run smoke:redis:cluster
```

Observed result:

- `cluster_state:ok`
- `cluster_known_nodes:6`
- `cluster_size:3`
- Full slot coverage: `16384`

### 3. Kafka partition baseline

Commands:

```bash
docker compose --profile kafka up -d zookeeper kafka
npm run kafka:topics:bootstrap
```

Observed result:

- `im.events` partitions: `6`
- `im.events.dlq` partitions: `6`

Expansion example:

```bash
OUTBOX_TOPIC_PARTITIONS=12 OUTBOX_DLQ_TOPIC_PARTITIONS=12 npm run kafka:topics:bootstrap
```

### 4. Nginx load balancing

Validation:

```bash
docker compose -f docker-compose.yml -f infra/docker-compose.yml --profile phase2-scale up -d nginx-scale
curl -sk -D - https://127.0.0.1:3444/api/v1/health
```

Observed result:

- TLS ingress returned `200 OK`
- Response included `X-Upstream-Node`
- Upstream routing worked against the 3-node CoreApi pool

### 5. Load script target evaluation

Dry-run command used:

```bash
CORE_API_BASE_URL=http://127.0.0.1:11461 \
CORE_API_SOCKET_URL=ws://127.0.0.1:11461 \
MAX_CONNECTIONS=20 \
RAMP_DURATION=1 \
HOLD_DURATION=1 \
TARGET_MODE=single-node \
node scripts/loadImWebSocket.cjs
```

Observed result:

- Connection success rate: `100%`
- Message loss rate: `0%`
- Error rate: `0%`
- P95 latency: `61ms`
- Validation verdict: `PASS`

## Single-node 5000 Concurrency Gate

The WebSocket load script now emits a `validation` block in `reports/websocket-load-report.json` with these pass/fail checks:

- `connectionSuccessRate`
- `messageLossRate`
- `errorRate`
- `p95Latency`
- `targetConnectionsReached`

Default single-node target thresholds:

- target connections: `5000`
- minimum connection success rate: `99%`
- maximum message loss rate: `1%`
- maximum error rate: `1%`
- maximum P95 latency: `250ms`

Recommended execution:

```bash
CORE_API_BASE_URL=http://127.0.0.1:11451 \
CORE_API_SOCKET_URL=ws://127.0.0.1:11451 \
MAX_CONNECTIONS=5000 \
RAMP_DURATION=30 \
HOLD_DURATION=60 \
TARGET_MODE=single-node \
node scripts/loadImWebSocket.cjs
```

## Operational Notes

- The multi-node smoke path currently validates cross-node broadcast using Redis single-node adapter mode.
- Redis Cluster support is now implemented in `ImGateway`; to exercise it in CoreApi, set `REDIS_CLUSTER_NODES` and clear `REDIS_URL`.
- The runtime Docker image keeps both root and workspace-local `node_modules` because `coreApi` relies on a mix of hoisted and workspace-local runtime packages.
- The full 5000 concurrent single-node run was not executed in this turn; the tooling and pass/fail gates are now in place for that validation.
