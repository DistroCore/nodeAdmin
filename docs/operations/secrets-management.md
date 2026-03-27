# Secrets Management Implementation

## Overview
This document describes the secrets management strategy for nodeAdmin, replacing plaintext `.env` files with secure secrets storage.

## Current State (Insecure)
- Database passwords stored in `.env` file
- JWT secrets in plaintext
- Redis password (if any) in plaintext
- All secrets committed to version control (via `.env.example`)

## Target State (Secure)
- Secrets stored in Docker Secrets (development) or external secrets manager (production)
- No plaintext secrets in configuration files
- Secrets injected at runtime
- Secrets rotation capability

## Implementation Strategy

### Phase 1: Docker Secrets (Development/Staging)
Use Docker Swarm secrets for local development and staging environments.

**Pros**:
- Built into Docker, no additional dependencies
- Simple to use
- Good for development and small deployments

**Cons**:
- Requires Docker Swarm mode (or docker-compose secrets)
- Not suitable for large-scale production

### Phase 2: External Secrets Manager (Production)
Migrate to HashiCorp Vault or AWS Secrets Manager for production.

**Pros**:
- Enterprise-grade security
- Audit logging
- Automatic rotation
- Fine-grained access control

**Cons**:
- Additional infrastructure
- More complex setup

## Phase 1 Implementation (Docker Secrets)

### 1. Create Secrets Files

```bash
# Create secrets directory (not committed to git)
mkdir -p .secrets

# Generate secrets
echo "nodeadmin" > .secrets/postgres_password
echo "$(openssl rand -base64 32)" > .secrets/jwt_access_secret
echo "$(openssl rand -base64 32)" > .secrets/jwt_refresh_secret

# Set restrictive permissions
chmod 600 .secrets/*
```

### 2. Update docker-compose.yml

```yaml
services:
  postgres:
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password

  core-api:
    environment:
      JWT_ACCESS_SECRET_FILE: /run/secrets/jwt_access_secret
      JWT_REFRESH_SECRET_FILE: /run/secrets/jwt_refresh_secret
      DATABASE_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password
      - jwt_access_secret
      - jwt_refresh_secret

secrets:
  postgres_password:
    file: ./.secrets/postgres_password
  jwt_access_secret:
    file: ./.secrets/jwt_access_secret
  jwt_refresh_secret:
    file: ./.secrets/jwt_refresh_secret
```

### 3. Update Application Code

Modify `runtimeConfig.ts` to read secrets from files:

```typescript
function readSecret(name: string, fallback?: string): string {
  const secretFile = process.env[`${name}_FILE`];
  if (secretFile) {
    try {
      return fs.readFileSync(secretFile, 'utf8').trim();
    } catch (error) {
      console.warn(`Failed to read secret from ${secretFile}:`, error);
    }
  }

  const envValue = process.env[name];
  if (envValue) {
    return envValue;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Secret ${name} not found`);
}

// Usage
const config = {
  auth: {
    accessSecret: readSecret('JWT_ACCESS_SECRET'),
    refreshSecret: readSecret('JWT_REFRESH_SECRET'),
  },
  database: {
    password: readSecret('DATABASE_PASSWORD', 'nodeadmin'),
  },
};
```

## Alternative: Environment Variable Encryption

For simpler deployments without Docker Secrets:

### 1. Install dotenv-vault

```bash
npm install --save-dev dotenv-vault
```

### 2. Encrypt .env file

```bash
npx dotenv-vault encrypt
```

This creates `.env.vault` with encrypted secrets.

### 3. Use in application

```typescript
import { config } from 'dotenv-vault-core';
config();
```

## Security Best Practices

### 1. Never Commit Secrets
Add to `.gitignore`:
```
.env
.env.local
.env.*.local
.secrets/
*.key
*.pem
```

### 2. Rotate Secrets Regularly
- Database passwords: Every 90 days
- JWT secrets: Every 180 days
- API keys: Every 90 days

### 3. Use Strong Secrets
```bash
# Generate strong random secrets
openssl rand -base64 32
```

### 4. Limit Secret Access
- Use principle of least privilege
- Only grant access to services that need it
- Audit secret access regularly

### 5. Monitor Secret Usage
- Log secret access (not the secret itself)
- Alert on unusual access patterns
- Track secret rotation

## Migration Plan

### Step 1: Audit Current Secrets
- [x] Database passwords (PostgreSQL, Redis)
- [x] JWT secrets (access, refresh)
- [ ] API keys (if any)
- [ ] TLS certificates

### Step 2: Create Secrets Infrastructure
- [ ] Set up secrets directory
- [ ] Generate new secrets
- [ ] Configure Docker Secrets

### Step 3: Update Application
- [ ] Modify runtimeConfig.ts
- [ ] Update docker-compose.yml
- [ ] Test secret loading

### Step 4: Verify and Deploy
- [ ] Test in development
- [ ] Verify no plaintext secrets remain
- [ ] Deploy to staging
- [ ] Deploy to production

### Step 5: Cleanup
- [ ] Remove plaintext secrets from .env
- [ ] Update documentation
- [ ] Train team on new process

## Rollback Plan

If secrets management causes issues:

1. Revert docker-compose.yml changes
2. Restore .env file from backup
3. Restart services
4. Investigate and fix issues
5. Retry migration

## Production Considerations

### HashiCorp Vault Integration

```typescript
import * as vault from 'node-vault';

const vaultClient = vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
});

async function getSecret(path: string): Promise<string> {
  const result = await vaultClient.read(path);
  return result.data.value;
}
```

### AWS Secrets Manager Integration

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretName: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString;
}
```

## Monitoring and Alerts

### Prometheus Metrics
- `secrets_load_success_total`: Number of successful secret loads
- `secrets_load_failure_total`: Number of failed secret loads
- `secrets_rotation_timestamp_seconds`: Last secret rotation timestamp

### Alert Rules
```yaml
- alert: SecretLoadFailure
  expr: rate(secrets_load_failure_total[5m]) > 0
  for: 1m
  labels:
    severity: P0
  annotations:
    summary: 'Failed to load secrets'

- alert: SecretRotationOverdue
  expr: time() - secrets_rotation_timestamp_seconds > 86400 * 90
  for: 1h
  labels:
    severity: P1
  annotations:
    summary: 'Secret rotation overdue (>90 days)'
```

## References
- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [HashiCorp Vault](https://www.vaultproject.io/)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
