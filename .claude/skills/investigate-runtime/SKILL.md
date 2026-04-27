---
name: investigate-runtime
description: Diagnose runtime issues using built-in diagnostic scripts
disable-model-invocation: true
---

## Runtime Investigation

Run these scripts to diagnose issues:

### Service Health

```bash
node scripts/diagnoseRuntime.cjs
```

Checks: Docker containers, port availability, health endpoints, migration status.

### Fault Playbook

```bash
node scripts/checkFaultPlaybook.cjs
```

Queries: connection spikes, Kafka lag, Redis adapter errors, PgBouncer pool exhaustion, message delivery latency.

### Architecture Constraints

```bash
node scripts/checkArchConstraints.cjs
```

Validates: outbox pattern integrity, no dual-write, IM event field completeness, schema presence.

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
node scripts/cleanupAiResidue.cjs --check
```
