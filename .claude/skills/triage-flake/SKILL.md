---
name: triage-flake
description: Investigate and triage flaky tests
disable-model-invocation: true
---

## Flake Triage Process

### 1. Identify the Flaky Test

```bash
# Run the test file multiple times to confirm flakiness
npx vitest run <test-file> --retry 5
```

### 2. Check Common Causes

**Timeout Issues:**

- Default vitest timeout: 5000ms
- DB-dependent tests need `DATABASE_URL` set or increased timeout
- Look for: `Test timed out in 5000ms`

**Path Issues (Windows):**

- Tests using `/workspace/` paths fail on Windows
- Fix: use `path.normalize()` or `expect.stringMatching(/[/\\]/)`
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
