# Monitoring and Alerts Runbook

## Start Monitoring Stack
- `npm run infra:up:monitoring`

Components:
- Prometheus: `http://127.0.0.1:9091`
- Alertmanager: `http://127.0.0.1:9093`
- Grafana: `http://127.0.0.1:3003` (admin/admin)

## Data Pipeline
- CoreApi exports OTel metrics on port `9464` when `OTEL_ENABLED=true`
- Prometheus scrapes `host.docker.internal:9464`
- Grafana loads dashboard from:
  - `infra/grafana/dashboards/nodeadmin-overview.json`

## Alert Severity Convention
- `P0`: system unavailable
- `P1`: major degradation
- `P2`: service-risk trend
- `P3`: informational

Configured rule files:
- `infra/prometheus/alerts.yml`
- `infra/prometheus/alertmanager.yml`

Last updated: 2026-03-01
