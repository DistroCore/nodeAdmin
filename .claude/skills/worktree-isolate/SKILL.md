---
name: worktree-isolate
description: Isolate tasks using git worktrees for parallel agent execution
disable-model-invocation: true
---

## Worktree Isolation

Use git worktrees to isolate parallel task branches in a sibling directory.

### Pre-check

Before creating a worktree, confirm there are no uncommitted changes in the current repo.

### Create Worktree

```bash
git worktree add ../nodeAdmin-task-XXX -b task/XXX develop
```

Rules: always branch from `develop`, never from `master`. The worktree directory must be a sibling of the main repo directory.

### List Worktrees

```bash
git worktree list
```

### Merge Back

Open a PR from `task/XXX` to `develop`, or perform a fast-forward merge into `develop` when appropriate.

### Cleanup After Merge

```bash
git worktree remove ../nodeAdmin-task-XXX
git branch -d task/XXX
```

Remove the worktree only after its branch is fully merged back to `develop`.
