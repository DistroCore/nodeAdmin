# M2 Acceptance Checklist

## Preconditions
- `npm run infra:up:kafka`
- `npm run db:migrate -w core-api`

## Validation Commands
1. Auto gate
   - `npm run m2:acceptance:auto`
2. Manual spot checks
   - `npm run smoke:outbox`
   - `npm run reliability:regression`
   - `npm run smoke:tls`

## Pass Criteria
- `m2:acceptance:auto` outputs `"result": "pass"`
- Outbox smoke confirms Kafka publish and `published_at` update
- Reliability regression confirms duplicate-idempotency behavior
- TLS smoke confirms reverse proxy health endpoint is reachable

Last updated: 2026-03-01
