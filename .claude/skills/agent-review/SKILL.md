---
name: agent-review
description: Structured review flow where a separate review agent validates implementation agent's work
disable-model-invocation: true
---

## Agent Review Flow

### 1. Trigger Review

- Start this review after the implementation agent completes the assigned task.
- The reviewer must be a DIFFERENT agent/session than the implementer.

### 2. Run Static Checks

```bash
npm run lint
npm run format:check
```

### 3. Run Structural Checks

```bash
node scripts/checkNamingConventions.cjs
node scripts/checkLayerDependencies.cjs
node scripts/checkArchConstraints.cjs
```

### 4. Run Tests

```bash
npm run test:coreApi
npm run test:adminPortal
```

### 5. Review Criteria

- No `any` types
- No `console.log`
- No hardcoded tenantId/userId/conversationId
- No API base URLs in code (use env vars)
- If governance docs were modified, they must include status fields

### 6. Review Outcome

- `PASS` — checks are clean and the change can merge
- `NEEDS_CHANGES` — return specific `file:line` issues to the implementer
- `BLOCKED` — escalate when review cannot proceed or ownership is unclear

### 7. Rework Loop

- If outcome is `NEEDS_CHANGES`, send the findings back to the implementation agent.
- Every issue must include concrete `file:line` references and required fixes.
