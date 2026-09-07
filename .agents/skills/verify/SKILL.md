---
name: verify
description: Run quick verification (lint + format check + unit tests) to catch issues before committing
---

Run the following checks sequentially from the repo root. Stop on the first failure and report the error.

```bash
npm run lint
npm run format:check
npm run test:coreApi
npm run test:adminPortal
```

If lint or format fails, fix the issues and re-run. For test failures, investigate and report the root cause.
