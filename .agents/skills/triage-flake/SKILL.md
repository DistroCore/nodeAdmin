---
name: triage-flake
description: Investigate and triage flaky tests
---

## Flake Triage Process

### 1. Identify the Flaky Test

```bash
# Backend unit test
npm run test:coreApi -- <test-file> --retry 5
# Frontend unit test (uses the jsdom configuration)
npm run test:adminPortal -- <test-file> --retry 5
# Integration test (requires infrastructure)
npm run test:coreApi:integration -- <test-file> --retry 5
```

`--retry 5` retries failed tests only; it does not repeat passing tests. Run the selected command a bounded number of times when probing an intermittent failure and record failures as well as recoveries.

### 2. Check Common Causes

**Timeout Issues:**

- Default unit-test timeout: 5000ms; integration config uses 120000ms for tests and hooks
- The shared global setup clears `DATABASE_URL` for unit isolation. Real DB tests use the integration harness and its `RLS_DATABASE_URL`, `OUTBOX_DATABASE_URL`, and `MIGRATION_DATABASE_URL` settings; inspect the selected test before changing timeouts.
- Look for: `Test timed out in 5000ms`

**Path Issues (Windows):**

- Tests using `/workspace/` paths fail on Windows
- Build paths with `path.join()` / `path.resolve()` and compare normalized complete paths. A separator-only regex does not validate the expected path.
- Look for: `AssertionError` with path separator differences

**Race Conditions:**

- `vi.resetModules()` timing
- Async operations not properly awaited
- Look for: intermittent `undefined` results

**Environment Dependencies:**

- Tests needing Docker containers (PG, Redis, Kafka)
- Missing `setupTestEnv()` call
- Look for: `ECONNREFUSED`, `connect failed`

### 3. Document the Finding

Update `docs/governance/harnessGapChecklist.md` or create a decision log entry.
