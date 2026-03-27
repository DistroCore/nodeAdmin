# M1 Acceptance Checklist

## Preconditions
- `npm run infra:up`
- CoreApi environment configured (`PORT`, `FRONTEND_ORIGINS`, JWT secrets)

## Validation Commands
1. Code quality
   - `npm run format:check`
   - `npm run lint`
   - `npm run test:core-api`
   - `npm run build`
2. Data and infra
   - `npm run db:migrate -w core-api`
   - `npm run smoke:pgbouncer`
3. API acceptance
   - `npm run m1:acceptance`
   - or `npm run m1:acceptance:auto`
4. IM smoke
   - `npm run smoke:im`

## Pass Criteria
- All commands return `0`
- `m1:acceptance` output includes `"result": "pass"`

Last updated: 2026-03-01
