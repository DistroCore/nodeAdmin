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
- Prometheus scrapes PgBouncer exporter at `pgbouncer-exporter:9127`
- Grafana loads dashboard from:
  - `infra/grafana/dashboards/nodeadmin-api-latency.json`
  - `infra/grafana/dashboards/nodeadmin-im-performance.json`
  - `infra/grafana/dashboards/nodeadmin-overview.json`
  - `infra/grafana/dashboards/pgbouncer-pool.json`

## Alert Severity Convention

- `P0`: system unavailable
- `P1`: major degradation
- `P2`: service-risk trend
- `P3`: informational

Configured rule files:

- `infra/prometheus/alerts.yml`
- `infra/prometheus/alertmanager.yml`

Configured alert groups:

- `nodeadmin-coreapi`
- `nodeadmin-im-performance`
- `nodeadmin-resilience`
- `nodeadmin-pgbouncer`
- `nodeadmin-backup`

Backup alert note:

- `nodeadmin-backup` rules expect `postgres_backup_*` metrics.
- Current `infra/prometheus/prometheus.yml` does not define a Pushgateway scrape job; production deployments must provide that metric target before these alerts can fire.

Last updated: 2026-07-09（复审并补齐当前 dashboard、PgBouncer、backup alert 配置）
