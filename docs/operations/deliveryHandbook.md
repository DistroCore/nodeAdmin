# Delivery Handbook

## Recommended Reading Order

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/governance/decisionLog.md`
4. `docs/delivery/roadmapPlan.md`
5. `docs/platformSpec.md`
6. `docs/architecture/architectureBaseline.md`

## Daily Operations

- Update implementation changes in docs before changing process expectations.
- Keep acceptance checklists current after adding scripts or quality gates.
- Record major architecture or scope decisions in `decisionLog.md`.

## Delivery Command Set

- Quality:
  - `npm run format:check`
  - `npm run lint`
  - `npm run check:naming`
  - `npm run check:layers`
  - `npm run check:docs`
  - `npm run test:coreApi`
  - `npm run test:coreApi:integration`
  - `npm run test:adminPortal`
  - `npm run build`
  - `npm run ci:local`
- Infra:
  - `npm run infra:up`
  - `npm run infra:up:kafka`
  - `npm run infra:up:tls`
  - `npm run infra:up:monitoring`
- Acceptance:
  - `npm run m1:acceptance:auto`
  - `npm run m2:acceptance:auto`
  - `npm run smoke:mvp`
- Reliability:
  - `npm run smoke:outbox`
  - `npm run reliability:regression`
  - `npm run smoke:tls`

## Phase 5 Notes

- D-022 added `0025_booleanize_rbac_flags.sql`; restored or long-lived development databases should run `npm run db:migrate -w coreApi` before acceptance.
- D-023 added outbox retention cleanup and auth repository split; backend delivery should include `npm run test:coreApi`, `npm run check:layers`, and targeted integration checks when touching auth, outbox, or IM persistence.

## LAN Access Notes

- CoreApi listens on `0.0.0.0:11451`
- AdminPortal dev server listens on `0.0.0.0:3000`
- Ensure `FRONTEND_ORIGINS` includes both localhost and LAN origin

Last updated: 2026-07-09（复审并对齐 AGENTS/CLAUDE 首读顺序、结构检查与 Phase 5 验证项）
