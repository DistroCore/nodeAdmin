# OWASP Top 10 Audit

Date: 2026-03-30
Scope: `apps/coreApi/`

## Summary

The CoreApi backend now has baseline controls for HTTP rate limiting, CSP validation, JWT-based authentication, DTO validation, WebSocket rate limiting, and database row-level security. The main residual risk is tenant authorization consistency on some HTTP endpoints that still accept caller-supplied `tenantId` parameters without role-aware policy enforcement.

## OWASP 2021 Mapping

### A01 Broken Access Control

- Status: Partial
- Existing controls:
  - JWT auth guard on protected HTTP routes
  - WebSocket tenant guard
  - PostgreSQL RLS on tenant-owned tables
- Residual risks:
  - Some HTTP controllers still trust `tenantId` from query/body and do not enforce a role-aware tenant boundary at the controller/service layer

### A02 Cryptographic Failures

- Status: Partial
- Existing controls:
  - Signed JWT access and refresh tokens
  - Password hashing with `bcryptjs`
- Residual risks:
  - Secret rotation and key lifecycle management are still operational concerns, not code-enforced controls

### A03 Injection

- Status: Partial
- Existing controls:
  - Parameterized SQL in `pg`
  - Drizzle ORM query builder usage
  - DTO validation on request payloads
- Residual risks:
  - Legacy raw SQL paths should continue to be reviewed when new queries are added

### A04 Insecure Design

- Status: Partial
- Existing controls:
  - Layered NestJS architecture
  - Dedicated health, auth, IM, and infrastructure boundaries
- Residual risks:
  - Tenant authorization policy is not centralized for all HTTP modules

### A05 Security Misconfiguration

- Status: Improved
- Existing controls:
  - Security headers enabled by default
  - CSP policy validation with safe fallback
  - Docker build context tightened via `.dockerignore`
- Residual risks:
  - Production secrets and CORS policy still depend on deployment configuration quality

### A06 Vulnerable and Outdated Components

- Status: Operational
- Existing controls:
  - Workspace lockfile and deterministic container installs
- Residual risks:
  - `npm audit` findings still need dependency upgrade work outside this patch

### A07 Identification and Authentication Failures

- Status: Partial
- Existing controls:
  - Login, refresh, password change, and token verification flows covered by integration tests
  - Auth endpoint rate limiting
- Residual risks:
  - No account lockout, MFA, or anomaly detection yet

### A08 Software and Data Integrity Failures

- Status: Partial
- Existing controls:
  - Outbox pattern for message publication
  - Audit logging for mutating authenticated requests
- Residual risks:
  - No artifact signing or provenance verification in CI/CD yet

### A09 Security Logging and Monitoring Failures

- Status: Partial
- Existing controls:
  - Audit logs
  - Telemetry bootstrap and Prometheus integration
- Residual risks:
  - No explicit alert thresholds for auth abuse or tenant-boundary violations in application code

### A10 Server-Side Request Forgery

- Status: Partial
- Existing controls:
  - Limited outbound integrations in CoreApi runtime path
- Residual risks:
  - User-provided URLs in IM metadata are stored and should remain treated as untrusted data

## Recommended Next Steps

1. Enforce authenticated tenant scoping centrally for HTTP query/body `tenantId` values.
2. Add account lockout or adaptive throttling for repeated login failures.
3. Add CI security checks for dependency audit and container image scanning.
4. Add explicit monitoring for rate-limit violations and suspicious cross-tenant access attempts.
