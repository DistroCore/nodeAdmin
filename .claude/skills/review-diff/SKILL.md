---
name: review-diff
description: Review code changes against project standards
disable-model-invocation: true
---

## Code Review Checklist

### 1. Run Static Checks

```bash
npm run lint
npm run format:check
```

### 2. Run Structural Checks

```bash
node scripts/checkNamingConventions.cjs
node scripts/checkLayerDependencies.cjs
node scripts/checkArchConstraints.cjs
node scripts/checkDocDrift.cjs
```

### 3. Run Tests

```bash
npm run test:coreApi
npm run test:adminPortal
```

### 4. Review Criteria

- No `any` types (enforced by ESLint `no-explicit-any: error`)
- No `console.log` (enforced by ESLint `no-console: error`)
- Controller -> Service -> Repository layering respected
- All governance docs carry status field (`draft/review/approved/archived`)
- No hardcoded tenantId/userId/conversationId
- No API base URLs in code (use env vars)
- Secrets loaded via `readSecret()` with `_FILE` fallback
