# IM Module Alert Response Handbook

## Overview

This handbook provides Standard Operating Procedures (SOP) for responding to Prometheus alerts configured in `infra/prometheus/alerts.yml`. All alerts are monitored via AlertManager at `http://localhost:9093` and visualized in Grafana at `http://localhost:3003`.

**Alert Severity Levels**:
- **P0**: System unavailable - immediate action required
- **P1**: Major degradation - respond within 15 minutes
- **P2**: Service-risk trend - investigate within 1 hour

---

## Alert Group: nodeadmin-coreapi

### 1. CoreApiMetricsMissing (P0)

**Trigger Condition**: `up{job="core-api-otel"} == 0` for 2 minutes

**Severity**: P0 - System unavailable

**Description**: CoreApi OpenTelemetry metrics endpoint is unreachable. This indicates the API server is down or the metrics exporter has failed.

#### Diagnostic Steps

1. **Check CoreApi health**:
   ```bash
   curl http://localhost:3001/health
   ```
   - Expected: `{"status":"ok"}`
   - If fails: CoreApi is down

2. **Check CoreApi logs**:
   ```bash
   docker logs nodeadmin-coreapi --tail 100
   # OR if running locally
   npm run dev:api
   ```
   - Look for startup errors, uncaught exceptions, or port conflicts

3. **Verify OpenTelemetry configuration**:
   ```bash
   # Check if OTEL_ENABLED=true in .env
   grep OTEL_ENABLED .env

   # Check if metrics port 9464 is accessible
   curl http://localhost:9464/metrics
   ```

4. **Check Prometheus scrape status**:
   - Open Prometheus: `http://localhost:9091/targets`
   - Look for `core-api-otel` target status

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| CoreApi crashed | Restart: `npm run dev:api` or `docker restart nodeadmin-coreapi` |
| Port 3001 already in use | Kill conflicting process: `lsof -ti:3001 \| xargs kill -9` |
| OTEL_ENABLED=false | Set `OTEL_ENABLED=true` in .env and restart |
| Metrics port 9464 blocked | Check firewall rules, ensure port is exposed in docker-compose.yml |
| Out of memory | Check `docker stats`, increase memory limit in docker-compose.yml |

#### Resolution Steps

1. Restart CoreApi:
   ```bash
   npm run dev:api
   ```

2. Verify metrics endpoint:
   ```bash
   curl http://localhost:9464/metrics | grep im_messages_appended_total
   ```

3. Wait 2 minutes for Prometheus to scrape and alert to clear

#### Escalation

- If CoreApi fails to start after 3 restart attempts, escalate to **team-lead**
- If database connection errors persist, escalate to **database-engineer**

---

### 2. HighOutboxRetry (P2)

**Trigger Condition**: `increase(im_messages_appended_total[5m]) == 0` for 10 minutes

**Severity**: P2 - Service-risk trend

**Description**: No IM messages have been appended in the last 10 minutes. This could indicate a stalled message pipeline or no active users.

#### Diagnostic Steps

1. **Check if there are active WebSocket connections**:
   - Open Grafana: `http://localhost:3003`
   - Navigate to "NodeAdmin IM Performance" dashboard
   - Check "Active WebSocket Connections" panel
   - If 0 connections: No users connected (expected behavior)

2. **Check message queue status**:
   ```bash
   # Check CoreApi logs for queue warnings
   docker logs nodeadmin-coreapi --tail 100 | grep "queue pressure"
   ```

3. **Verify database connectivity**:
   ```bash
   # Test PostgreSQL connection
   npm run smoke:pgbouncer
   ```

4. **Check for rate limiting**:
   ```bash
   # Look for rate limit errors in logs
   docker logs nodeadmin-coreapi --tail 100 | grep "Rate limit exceeded"
   ```

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| No active users | Expected behavior - no action needed |
| Database connection pool exhausted | Check PgBouncer stats: `docker logs nodeadmin-pgbouncer` |
| Message queue stalled | Restart CoreApi to flush queue |
| Rate limiting too aggressive | Increase `RATE_LIMIT_WS_MESSAGES_PER_SECOND` in .env |

#### Resolution Steps

1. If no active users, acknowledge alert (expected behavior)

2. If database issues detected:
   ```bash
   # Check PgBouncer connection pool
   docker exec -it nodeadmin-pgbouncer psql -h localhost -p 5432 -U nodeadmin -d pgbouncer -c "SHOW POOLS;"
   ```

3. If queue stalled, restart CoreApi:
   ```bash
   npm run dev:api
   ```

#### Escalation

- If database connection pool exhausted, escalate to **database-engineer**
- If issue persists after restart, escalate to **reliability-engineer**

---

## Alert Group: nodeadmin-im-performance

### 3. HighMessageLatency (P1)

**Trigger Condition**: `histogram_quantile(0.95, rate(im_message_append_ms_bucket[5m])) > 500` for 5 minutes

**Severity**: P1 - Major degradation

**Description**: P95 message append latency exceeds 500ms. This indicates the message pipeline is slow, affecting user experience.

#### Diagnostic Steps

1. **Check Grafana dashboard**:
   - Open "NodeAdmin IM Performance" dashboard
   - Check "Message Append Latency (P50/P95/P99)" panel
   - Identify if P50 is also elevated (indicates systemic issue)

2. **Check persist queue wait time**:
   - Check "Persist Queue Wait Time" panel in Grafana
   - If P95 > 1000ms: Queue is backlogged

3. **Check database write latency**:
   - Check "Database Write Latency" panel in Grafana
   - If P95 > 200ms: Database is slow

4. **Check system resources**:
   ```bash
   # Check CPU and memory usage
   docker stats nodeadmin-coreapi nodeadmin-postgres nodeadmin-pgbouncer
   ```

5. **Check for slow queries**:
   ```bash
   # Check PostgreSQL slow query log (if enabled)
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
   ```

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| Persist queue backlog | Queue length > 5000, wait for flush or restart CoreApi |
| Database slow queries | Optimize queries, add indexes (escalate to database-engineer) |
| PgBouncer connection pool exhausted | Increase `default_pool_size` in pgbouncer.ini |
| High CPU usage | Scale horizontally (add more CoreApi instances) |
| Disk I/O bottleneck | Check disk usage: `df -h`, optimize PostgreSQL config |

#### Resolution Steps

1. **If queue backlog detected**:
   ```bash
   # Check queue length in logs
   docker logs nodeadmin-coreapi --tail 100 | grep "queueLength"
   ```
   - If > 10000: Wait for queue to drain (automatic)
   - If > 45000: System is rejecting new messages (expected backpressure)

2. **If database slow**:
   ```bash
   # Check active connections
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
   ```
   - If > 80: Connection pool near limit, consider increasing `max_connections`

3. **If CPU high**:
   ```bash
   # Check top processes
   docker exec -it nodeadmin-coreapi top -bn1 | head -20
   ```

#### Escalation

- If database slow queries persist, escalate to **database-engineer**
- If CPU consistently > 80%, escalate to **performance-engineer** for optimization
- If issue persists after 30 minutes, escalate to **team-lead**

---

### 4. HighE2EMessageLatency (P1)

**Trigger Condition**: `histogram_quantile(0.95, rate(im_e2e_message_latency_ms_bucket[5m])) > 1000` for 5 minutes

**Severity**: P1 - Major degradation

**Description**: P95 end-to-end message latency exceeds 1000ms. This includes client send → server append → broadcast → client receive.

#### Diagnostic Steps

1. **Check Grafana dashboard**:
   - Open "NodeAdmin IM Performance" dashboard
   - Check "End-to-End Message Latency (P50/P95/P99)" panel

2. **Break down latency components**:
   - Check "Message Append Latency" (server-side processing)
   - Check "WebSocket Connection Latency" (network + handshake)
   - Check "Database Write Latency" (persistence)

3. **Check Redis Adapter performance**:
   ```bash
   # Check Redis latency
   docker exec -it nodeadmin-redis redis-cli --latency-history
   ```

4. **Check network issues**:
   ```bash
   # Check for packet loss
   docker exec -it nodeadmin-coreapi ping -c 10 nodeadmin-redis
   ```

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| High append latency | See "HighMessageLatency" alert response |
| Redis slow | Check Redis memory usage, restart if needed |
| Network latency | Check Docker network, restart containers |
| Socket.IO broadcast slow | Check active connections count, may need horizontal scaling |

#### Resolution Steps

1. **If Redis slow**:
   ```bash
   # Check Redis memory usage
   docker exec -it nodeadmin-redis redis-cli INFO memory

   # Check Redis slow log
   docker exec -it nodeadmin-redis redis-cli SLOWLOG GET 10
   ```

2. **If network issues**:
   ```bash
   # Restart Docker network
   docker-compose down && docker-compose up -d
   ```

3. **If too many connections**:
   - Check "Active WebSocket Connections" in Grafana
   - If > 1000: Consider horizontal scaling (multiple CoreApi instances)

#### Escalation

- If Redis issues persist, escalate to **devops-engineer**
- If network issues persist, escalate to **devops-engineer**
- If horizontal scaling needed, escalate to **team-lead**

---

### 5. MessageLossDetected (P0)

**Trigger Condition**: `rate(im_e2e_message_loss_total[5m]) > 0.01` for 2 minutes

**Severity**: P0 - System unavailable

**Description**: Messages are being lost (sent but not received). This is a critical data integrity issue.

#### Diagnostic Steps

1. **Check Grafana dashboard**:
   - Open "NodeAdmin IM Performance" dashboard
   - Check "Message Loss (5m window)" gauge
   - Check "Message Throughput" panel for failure rate

2. **Check for timeout errors**:
   ```bash
   # Check logs for timeout errors
   docker logs nodeadmin-coreapi --tail 200 | grep -E "timeout|ETIMEDOUT"
   ```

3. **Check Socket.IO configuration**:
   ```bash
   # Verify pingTimeout > pingInterval
   grep -E "SOCKETIO_PING" .env
   ```
   - Expected: `SOCKETIO_PING_TIMEOUT` (60000) > `SOCKETIO_PING_INTERVAL` (25000)

4. **Check database persistence**:
   ```bash
   # Verify messages are being persisted
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "SELECT COUNT(*) FROM im_messages WHERE created_at > NOW() - INTERVAL '5 minutes';"
   ```

5. **Check Redis Adapter**:
   ```bash
   # Check Redis connection
   docker exec -it nodeadmin-redis redis-cli PING
   ```

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| Socket.IO timeout misconfiguration | Fix pingTimeout/pingInterval in .env (see P0 fixes) |
| Redis connection lost | Restart Redis: `docker restart nodeadmin-redis` |
| Database write failures | Check PostgreSQL logs, verify disk space |
| Network partition | Check Docker network, restart containers |
| Queue overflow (> 50000) | System is rejecting messages due to backpressure |

#### Resolution Steps

1. **Verify P0 timeout fixes are applied**:
   ```bash
   # Check if P0 fixes are in place
   grep "SOCKETIO_PING_TIMEOUT=60000" .env
   grep "default_pool_size = 100" infra/docker/pgbouncer/pgbouncer.ini
   ```

2. **If timeout misconfiguration**:
   ```bash
   # Apply P0 fixes
   cp .env.example .env
   # Edit .env with correct values
   npm run infra:down && npm run infra:up
   npm run dev:api
   ```

3. **If Redis connection lost**:
   ```bash
   docker restart nodeadmin-redis
   # Wait 30 seconds
   npm run dev:api
   ```

4. **If database write failures**:
   ```bash
   # Check disk space
   df -h

   # Check PostgreSQL logs
   docker logs nodeadmin-postgres --tail 100
   ```

#### Escalation

- **IMMEDIATE**: Notify **team-lead** of P0 alert
- If P0 fixes not applied, escalate to **devops-engineer** for deployment
- If database issues, escalate to **database-engineer**
- If issue persists after 10 minutes, escalate to **reliability-engineer**

---

### 6. HighMessageFailureRate (P1)

**Trigger Condition**: `rate(im_e2e_message_failure_total[5m]) / rate(im_e2e_message_success_total[5m]) > 0.05` for 5 minutes

**Severity**: P1 - Major degradation

**Description**: More than 5% of messages are failing. This indicates a systemic issue affecting message delivery.

#### Diagnostic Steps

1. **Check Grafana dashboard**:
   - Open "NodeAdmin IM Performance" dashboard
   - Check "Message Failure Rate" gauge
   - Check "Message Throughput" panel for failure count

2. **Check error types in logs**:
   ```bash
   # Check for common error patterns
   docker logs nodeadmin-coreapi --tail 200 | grep -E "WsException|Error|failed"
   ```

3. **Check for validation errors**:
   ```bash
   # Look for DTO validation failures
   docker logs nodeadmin-coreapi --tail 200 | grep "ValidationPipe"
   ```

4. **Check for rate limiting**:
   ```bash
   # Look for rate limit errors
   docker logs nodeadmin-coreapi --tail 200 | grep "Rate limit exceeded"
   ```

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| Client sending invalid payloads | Check client-side validation, review error logs |
| Rate limiting too aggressive | Increase `RATE_LIMIT_WS_MESSAGES_PER_SECOND` |
| Database constraint violations | Check for duplicate messageId, foreign key errors |
| Message size exceeds limit | Check if messages > 1MB, client should validate |
| Tenant/conversation mismatch | Client sending wrong tenantId/conversationId |

#### Resolution Steps

1. **If validation errors**:
   - Review error logs to identify invalid fields
   - Notify client developers to fix payload format

2. **If rate limiting**:
   ```bash
   # Increase rate limit (default: 100 msg/sec)
   # Edit .env
   RATE_LIMIT_WS_MESSAGES_PER_SECOND=200

   # Restart CoreApi
   npm run dev:api
   ```

3. **If database errors**:
   ```bash
   # Check for constraint violations
   docker logs nodeadmin-postgres --tail 100 | grep ERROR
   ```

#### Escalation

- If client-side issues, notify **qa-engineer** for test coverage
- If database constraint issues, escalate to **database-engineer**
- If issue persists after 30 minutes, escalate to **team-lead**

---

### 7. WebSocketConnectionFailures (P1)

**Trigger Condition**: `rate(im_ws_connection_failure_total[5m]) > 1` for 3 minutes

**Severity**: P1 - Major degradation

**Description**: More than 1 WebSocket connection failure per second. This indicates clients cannot establish connections.

#### Diagnostic Steps

1. **Check Grafana dashboard**:
   - Open "NodeAdmin IM Performance" dashboard
   - Check "WebSocket Connection Success/Failure" panel

2. **Check authentication failures**:
   ```bash
   # Look for auth errors
   docker logs nodeadmin-coreapi --tail 200 | grep -E "Unauthorized|JWT|token"
   ```

3. **Check Socket.IO handshake errors**:
   ```bash
   # Look for handshake failures
   docker logs nodeadmin-coreapi --tail 200 | grep "handshake"
   ```

4. **Check connection limit**:
   ```bash
   # Check if connection limit reached (default: 10000)
   docker logs nodeadmin-coreapi --tail 200 | grep "Connection limit"
   ```

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| Invalid JWT tokens | Check token expiration, verify JWT secret |
| Connection limit reached | Increase `MAX_CONNECTIONS` or scale horizontally |
| CORS issues | Verify CORS configuration in main.ts |
| Network issues | Check Docker network, firewall rules |
| Redis Adapter connection lost | Restart Redis |

#### Resolution Steps

1. **If authentication failures**:
   ```bash
   # Verify JWT secret is consistent
   grep JWT_SECRET .env

   # Check token expiration
   docker logs nodeadmin-coreapi --tail 100 | grep "Token expired"
   ```

2. **If connection limit reached**:
   ```bash
   # Increase connection limit (default: 10000)
   # Edit .env
   MAX_CONNECTIONS=20000

   # Restart CoreApi
   npm run dev:api
   ```

3. **If Redis issues**:
   ```bash
   docker restart nodeadmin-redis
   npm run dev:api
   ```

#### Escalation

- If authentication issues persist, escalate to **reliability-engineer**
- If horizontal scaling needed, escalate to **team-lead**
- If Redis issues persist, escalate to **devops-engineer**

---

### 8. HighPersistQueueWait (P2)

**Trigger Condition**: `histogram_quantile(0.95, rate(im_message_persist_queue_wait_ms_bucket[5m])) > 1000` for 5 minutes

**Severity**: P2 - Service-risk trend

**Description**: P95 persist queue wait time exceeds 1000ms. Messages are waiting too long in the queue before being persisted to the database.

#### Diagnostic Steps

1. **Check Grafana dashboard**:
   - Open "NodeAdmin IM Performance" dashboard
   - Check "Persist Queue Wait Time (P50/P95/P99)" panel

2. **Check queue length**:
   ```bash
   # Look for queue pressure warnings
   docker logs nodeadmin-coreapi --tail 100 | grep "queue pressure"
   ```

3. **Check database write latency**:
   - Check "Database Write Latency" panel in Grafana
   - If P95 > 200ms: Database is the bottleneck

4. **Check persist concurrency**:
   - Current setting: 20 concurrent workers
   - Batch size: 200 messages
   - Flush interval: 50ms

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| High message throughput | Queue is processing normally, wait for drain |
| Database slow | See "HighDatabaseWriteLatency" alert response |
| Persist concurrency too low | Increase concurrency (requires code change) |
| Batch size too small | Increase batch size (requires code change) |

#### Resolution Steps

1. **If queue length < 10000**:
   - Normal operation, queue will drain automatically
   - Monitor for 10 minutes

2. **If queue length > 10000**:
   ```bash
   # Check if database is slow
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
   ```

3. **If database is slow**:
   - See "HighDatabaseWriteLatency" alert response

#### Escalation

- If queue length > 30000 for > 10 minutes, escalate to **performance-engineer**
- If database issues, escalate to **database-engineer**
- If code changes needed, escalate to **team-lead**

---

### 9. TraceIdPropagationFailure (P2)

**Trigger Condition**: `rate(im_trace_id_missing_total[5m]) / rate(im_trace_id_propagation_total[5m]) > 0.1` for 5 minutes

**Severity**: P2 - Service-risk trend

**Description**: More than 10% of messages are missing traceId. This affects distributed tracing and debugging capabilities.

#### Diagnostic Steps

1. **Check Grafana dashboard**:
   - Open "NodeAdmin IM Performance" dashboard
   - Check "TraceId Missing Rate" gauge
   - Check "TraceId Propagation" panel

2. **Check client implementation**:
   - Verify clients are generating traceId
   - Check if traceId is included in SendMessageDto

3. **Check server-side propagation**:
   ```bash
   # Look for traceId in logs
   docker logs nodeadmin-coreapi --tail 100 | grep traceId
   ```

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| Client not generating traceId | Update client to generate UUID for each message |
| Client sending null/undefined traceId | Add client-side validation |
| Server not propagating traceId | Check imMessageService.ts, verify traceId is passed through |

#### Resolution Steps

1. **If client-side issue**:
   - Notify client developers to add traceId generation
   - Example: `traceId: crypto.randomUUID()`

2. **If server-side issue**:
   ```bash
   # Verify traceId is in database
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "SELECT trace_id FROM im_messages WHERE created_at > NOW() - INTERVAL '5 minutes' LIMIT 10;"
   ```

#### Escalation

- If client-side issue, notify **qa-engineer** for test coverage
- If server-side issue, escalate to **reliability-engineer**

---

### 10. HighDatabaseWriteLatency (P1)

**Trigger Condition**: `histogram_quantile(0.95, rate(im_message_db_write_ms_bucket[5m])) > 200` for 5 minutes

**Severity**: P1 - Major degradation

**Description**: P95 database write latency exceeds 200ms. This indicates the database is slow, affecting message persistence.

#### Diagnostic Steps

1. **Check Grafana dashboard**:
   - Open "NodeAdmin IM Performance" dashboard
   - Check "Database Write Latency (P50/P95/P99)" panel

2. **Check PostgreSQL performance**:
   ```bash
   # Check active queries
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "SELECT pid, state, query_start, query FROM pg_stat_activity WHERE state = 'active';"
   ```

3. **Check for slow queries**:
   ```bash
   # Check pg_stat_statements (if enabled)
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
   ```

4. **Check PgBouncer connection pool**:
   ```bash
   # Check pool status
   docker exec -it nodeadmin-pgbouncer psql -h localhost -p 5432 -U nodeadmin -d pgbouncer -c "SHOW POOLS;"
   ```

5. **Check disk I/O**:
   ```bash
   # Check disk usage
   df -h

   # Check I/O wait
   docker stats nodeadmin-postgres
   ```

#### Common Root Causes

| Root Cause | Solution |
|------------|----------|
| Missing indexes | Add indexes on frequently queried columns |
| Connection pool exhausted | Increase PgBouncer `default_pool_size` |
| Disk I/O bottleneck | Optimize PostgreSQL config, consider SSD |
| Long-running transactions | Identify and kill blocking queries |
| Table bloat | Run VACUUM ANALYZE |

#### Resolution Steps

1. **If connection pool exhausted**:
   ```bash
   # Check pool status
   docker exec -it nodeadmin-pgbouncer psql -h localhost -p 5432 -U nodeadmin -d pgbouncer -c "SHOW POOLS;"

   # If cl_waiting > 0, increase pool size
   # Edit infra/docker/pgbouncer/pgbouncer.ini
   # default_pool_size = 150

   # Restart PgBouncer
   docker restart nodeadmin-pgbouncer
   ```

2. **If slow queries detected**:
   ```bash
   # Analyze query plan
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "EXPLAIN ANALYZE <slow_query>;"
   ```

3. **If table bloat**:
   ```bash
   # Run VACUUM ANALYZE
   docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin -c "VACUUM ANALYZE im_messages;"
   ```

#### Escalation

- **IMMEDIATE**: Escalate to **database-engineer** for investigation
- If connection pool issues, escalate to **devops-engineer**
- If disk I/O issues, escalate to **devops-engineer** for infrastructure upgrade

---

## Quick Reference

### Alert Severity Matrix

| Alert | Severity | Response Time | First Responder |
|-------|----------|---------------|-----------------|
| CoreApiMetricsMissing | P0 | Immediate | devops-engineer |
| MessageLossDetected | P0 | Immediate | reliability-engineer |
| HighMessageLatency | P1 | 15 minutes | performance-engineer |
| HighE2EMessageLatency | P1 | 15 minutes | performance-engineer |
| HighMessageFailureRate | P1 | 15 minutes | reliability-engineer |
| WebSocketConnectionFailures | P1 | 15 minutes | reliability-engineer |
| HighDatabaseWriteLatency | P1 | 15 minutes | database-engineer |
| HighOutboxRetry | P2 | 1 hour | reliability-engineer |
| HighPersistQueueWait | P2 | 1 hour | performance-engineer |
| TraceIdPropagationFailure | P2 | 1 hour | qa-engineer |

### Common Commands

```bash
# Check all services status
docker ps

# Check CoreApi health
curl http://localhost:3001/health

# Check metrics endpoint
curl http://localhost:9464/metrics

# Restart CoreApi
npm run dev:api

# Restart infrastructure
npm run infra:down && npm run infra:up

# Check logs
docker logs nodeadmin-coreapi --tail 100
docker logs nodeadmin-postgres --tail 100
docker logs nodeadmin-pgbouncer --tail 100
docker logs nodeadmin-redis --tail 100

# Check database
docker exec -it nodeadmin-postgres psql -U nodeadmin -d nodeadmin

# Check PgBouncer pool
docker exec -it nodeadmin-pgbouncer psql -h localhost -p 5432 -U nodeadmin -d pgbouncer -c "SHOW POOLS;"

# Check Redis
docker exec -it nodeadmin-redis redis-cli PING
```

### Monitoring URLs

- **Prometheus**: http://localhost:9091
- **AlertManager**: http://localhost:9093
- **Grafana**: http://localhost:3003 (admin/admin)
- **CoreApi Health**: http://localhost:3001/health
- **CoreApi Metrics**: http://localhost:9464/metrics

---

## Escalation Path

1. **First Responder** (based on alert type) - 15 minutes
2. **team-lead** - If issue persists after 30 minutes
3. **On-call Engineer** - If P0 alert persists after 1 hour

---

**Last Updated**: 2026-03-02
**Maintained By**: documentation-engineer
**Review Frequency**: Monthly or after major incidents
