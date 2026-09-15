---
name: docs-sync
description: Synchronize project documentation with codebase state
---

## Documentation Sync

### 1. Run Document Drift Check

```bash
node scripts/checkDocDrift.cjs
```

Checks: last-updated timestamps, doc index references, cross-document state consistency.

### 2. Update Status Fields

All governance docs (`docs/governance/*.md`) must have:

```markdown
> **status**: draft|review|approved|archived | **last-reviewed**: YYYY-MM-DD
```

### 3. Sync Checklist

- `AGENTS.md` — test commands match `package.json` scripts
- `AGENTS.md` — architecture section matches actual code structure
- `docs/delivery/roadmapPlan.md` — milestone status current
- `docs/governance/decisionLog.md` — document-level status and review date are present; new decisions include date, rationale, impact, and owner
- `docs/governance/harnessGapChecklist.md` — checked items match reality

### 4. Update Timestamps

Update the edited document's existing last-updated section. Change `last-reviewed` only after reviewing the corresponding content; preserve historical decision dates.
