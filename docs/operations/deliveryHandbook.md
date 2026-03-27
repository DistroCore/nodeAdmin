# Delivery Handbook

## Recommended Reading Order
1. `docs/platformSpec.md`
2. `docs/architecture/architectureBaseline.md`
3. `docs/delivery/roadmapPlan.md`
4. `docs/governance/decisionLog.md`

## Daily Operations
- Update implementation changes in docs before changing process expectations.
- Keep acceptance checklists current after adding scripts or quality gates.
- Record major architecture or scope decisions in `decisionLog.md`.

## Delivery Command Set
- Quality:
  - `npm run format:check`
  - `npm run lint`
  - `npm run test:core-api`
  - `npm run build`
- Infra:
  - `npm run infra:up`
  - `npm run infra:up:kafka`
  - `npm run infra:up:tls`
  - `npm run infra:up:monitoring`
- Acceptance:
  - `npm run m1:acceptance:auto`
  - `npm run m2:acceptance:auto`
- Reliability:
  - `npm run smoke:outbox`
  - `npm run reliability:regression`
  - `npm run smoke:tls`

## LAN Access Notes
- CoreApi listens on `0.0.0.0:3001`
- AdminPortal dev server listens on `0.0.0.0:5173`
- Ensure `FRONTEND_ORIGINS` includes both localhost and LAN origin

Last updated: 2026-03-01
