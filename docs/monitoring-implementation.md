# Enhanced Load Testing and Monitoring Implementation

## Overview
This document describes the enhanced monitoring and metrics collection implementation for the nodeAdmin IM module.

## Components Implemented

### 1. Enhanced K6 Load Test Script
**File**: `scripts/k6ImLoadEnhanced.js`

Features:
- End-to-end WebSocket message flow testing
- TraceId propagation tracking across the entire message lifecycle
- Custom Prometheus metrics export
- Message loss detection
- Connection success/failure tracking
- Latency measurement at multiple stages

Custom Metrics:
- `im_e2e_message_latency_ms` - End-to-end message latency histogram
- `im_e2e_message_success_total` - Successful message delivery counter
- `im_e2e_message_failure_total` - Failed message delivery counter
- `im_e2e_message_loss_total` - Message loss counter
- `im_ws_connection_duration_ms` - WebSocket connection latency histogram
- `im_ws_connection_success_total` - Successful connection counter
- `im_ws_connection_failure_total` - Failed connection counter
- `im_active_connections` - Active WebSocket connections gauge
- `im_message_delivery_rate_total` - Message delivery rate counter
- `im_auth_token_latency_ms` - Auth token issuance latency histogram
- `im_trace_id_propagation_total` - TraceId propagation counter
- `im_trace_id_missing_total` - Missing TraceId counter

### 2. Prometheus Configuration
**File**: `infra/prometheus/prometheus.yml`

Added K6 metrics scraping:
- Job: `k6-metrics`
- Target: `host.docker.internal:5665`
- Scrape interval: 5s

### 3. Alert Rules
**File**: `infra/prometheus/alerts.yml`

New alert groups:
- `nodeadmin-im-performance` - Performance and reliability alerts

Alert Rules:
- `HighMessageLatency` - P95 append latency > 500ms
- `HighE2EMessageLatency` - P95 E2E latency > 1000ms
- `MessageLossDetected` - Message loss rate > 0.01/sec
- `HighMessageFailureRate` - Failure rate > 5%
- `WebSocketConnectionFailures` - Connection failures > 1/sec
- `HighPersistQueueWait` - P95 queue wait > 1000ms
- `TraceIdPropagationFailure` - Missing traceId rate > 10%
- `HighDatabaseWriteLatency` - P95 DB write > 200ms

### 4. Grafana Dashboard
**File**: `infra/grafana/dashboards/nodeadmin-im-performance.json`

Dashboard Panels:
1. End-to-End Message Latency (P50/P95/P99)
2. Message Throughput (Append/Success/Failure/Delivery rates)
3. Message Failure Rate (Gauge)
4. Message Loss (5m window, Gauge)
5. Active WebSocket Connections
6. TraceId Missing Rate (Gauge)
7. Message Append Latency (P50/P95/P99)
8. Database Write Latency (P50/P95/P99)
9. Persist Queue Wait Time (P50/P95/P99)
10. WebSocket Connection Latency (P50/P95/P99)
11. WebSocket Connection Success/Failure
12. TraceId Propagation

## TraceId Tracking

The enhanced K6 script implements full end-to-end traceId tracking:

1. **Client generates traceId** - Unique identifier for each message
2. **TraceId sent with message** - Included in `SendMessageDto`
3. **Backend propagates traceId** - Through all layers (Gateway → Service → Repository)
4. **TraceId returned in ACK** - Client verifies traceId in acknowledgment
5. **Metrics tracked** - `im_trace_id_propagation_total` and `im_trace_id_missing_total`

## Usage

### Run Enhanced Load Test

```bash
# Smoke test (5 VUs, 30s)
K6_SCENARIO=smoke npm run load:k6:enhanced

# Load test (50-100 VUs, 2m)
K6_SCENARIO=load npm run load:k6:enhanced

# Stress test (100-500 VUs, 2m)
K6_SCENARIO=stress npm run load:k6:enhanced
```

### View Metrics in Grafana

1. Start monitoring stack: `npm run infra:up:monitoring`
2. Open Grafana: http://localhost:3003
3. Navigate to "NodeAdmin IM Performance" dashboard
4. Observe real-time metrics during load tests

### Check Alerts

1. Open Prometheus: http://localhost:9091
2. Navigate to "Alerts" tab
3. View active alerts and their status

## Integration with Existing Metrics

The enhanced monitoring integrates with existing CoreApi OpenTelemetry metrics:
- `im_messages_appended_total` - Already tracked by `ImMessageService`
- `im_message_append_ms` - Already tracked by `ImMessageService`
- `im_message_db_write_ms` - Already tracked by `ImMessageService`
- `im_message_persist_queue_wait_ms` - Already tracked by `ImMessageService`

## Next Steps

1. Add npm script for enhanced load test to `package.json`
2. Update docker-compose to expose K6 Prometheus exporter port
3. Consider adding distributed tracing with Jaeger/Tempo for full trace visualization
4. Implement automatic alert notifications (Slack/PagerDuty)
