# M2 Capacity Baseline

## Load Script
- Script: `scripts/k6ImLoad.js`
- Docker image: `grafana/k6:0.54.0`
- Reports output: `reports/k6/k6-summary.json`

## Commands

| Command | Description |
|---------|-------------|
| `npm run load:k6` | Run all scenarios (smoke + stress + spike) |
| `npm run load:k6:smoke` | API smoke — 10 VUs × 30s, all endpoints |
| `npm run load:k6:stress` | API stress — ramp to 200 VUs × 2min, auth chain |
| `npm run load:k6:spike` | API spike — burst to 300 VUs × 40s, health only |

## Scenarios

### api_smoke (constant-vus)
- VUs: 10
- Duration: 30s
- Coverage: All 8 API endpoints (health, auth, overview, tenants, release-checks, conversations, permissions, audit-logs)
- Purpose: Validate all endpoints work correctly under concurrent load

### api_stress (ramping-vus)
- Stages: 30s → 50 VUs, 60s sustain → 200 VUs, 30s → 0
- Coverage: health + dev-token (core auth chain)
- Purpose: Verify throughput and latency of critical authentication path

### api_spike (ramping-vus)
- Stages: 10s → 300 VUs, 20s sustain → 300 VUs, 10s → 0
- Coverage: health endpoint only
- Purpose: Verify service resilience under sudden traffic burst

## Thresholds

| Metric | Target |
|--------|--------|
| `http_req_duration` | p95 < 500ms, p99 < 1000ms |
| `http_req_failed` | rate < 1% |
| `api_token_duration` | p95 < 300ms |
| `api_console_duration` | p95 < 250ms |
| `api_errors` | count < 10 |

## Custom Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `api_token_duration` | Trend | Dev-token endpoint response time |
| `api_console_duration` | Trend | Console endpoints average response time |
| `api_errors` | Counter | Non-2xx response count |

## Report Output

After running `npm run load:k6`, the JSON summary is saved to:
- `reports/k6/k6-summary.json`

## Prerequisites
- CoreApi running on port 3001
- Docker infrastructure online (`npm run infra:up`)
- For full baseline: also start Kafka (`npm run infra:up:kafka`)

Last updated: 2026-03-01
