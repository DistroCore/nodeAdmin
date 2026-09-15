---
name: investigate-runtime
description: Diagnose runtime issues using built-in diagnostic scripts
---

## Runtime Investigation

Run these scripts to diagnose issues:

### Service Health

```bash
node scripts/diagnoseRuntime.cjs
```

Checks: Docker containers, port availability, and the API health endpoint. It does not check migration status. This diagnostic exits 0 even when services are unavailable; inspect its reported statuses.

### Fault Playbook

```bash
node scripts/checkFaultPlaybook.cjs
```

Reports connection errors in container logs, Kafka consumer group presence, Redis keyspace size, PgBouncer pool activity, and API health latency. It does not measure Kafka lag or message delivery latency and always exits 0; inspect warnings and critical statuses.

### Architecture Constraints

```bash
node scripts/checkArchConstraints.cjs
```

Statically scans for outbox transaction patterns, direct Kafka sends, IM event fields, and schema presence. These source-text checks supplement review; they do not prove runtime behavior.

### MVP Smoke Test

```bash
node scripts/smokeMvpRelease.cjs
```

Tests: backend health, API v1 health, frontend page load, WebSocket handshake, reconnection.

### Document Drift

```bash
node scripts/checkDocDrift.cjs
```

### Naming Conventions

```bash
node scripts/checkNamingConventions.cjs
```

### Layer Dependencies

```bash
node scripts/checkLayerDependencies.cjs
```

### AI Code Residue

```bash
node scripts/cleanupAiResidue.cjs
```
