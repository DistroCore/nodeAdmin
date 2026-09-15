---
name: verify-full
description: Run nodeAdmin local CI including integration tests; use when full verification is requested and a disposable local Docker stack is available.
---

Run commands from the repository root with dependencies installed and Docker available. Configure the Compose secrets referenced in `docker-compose.yml` before running.

```bash
npm run ci:local -- --full
```

This runs format checking, lint, backend unit tests with coverage gates, frontend unit tests, build, and naming/layer/document checks. It then starts the Kafka Compose profile, waits for PostgreSQL/Redis/Kafka, applies migrations, and runs integration tests. The script shuts down the Compose stack with `infra:down` afterward, including services that were already running; use a local stack that can be stopped.

Without `--full`, `ci:local` runs only static checks, unit tests, build, and structural checks. It does not run integration tests.

If the user also requests M2 acceptance, restart the infrastructure after full CI and ensure port 11451 is free for the acceptance runner's API:

```bash
docker compose up -d postgres pgbouncer redis zookeeper kafka
npm run m2:acceptance:auto
```

M2 acceptance uses the API build produced by CI and writes test data. Report failures with the stage and relevant error output, redacting credentials from logs.
