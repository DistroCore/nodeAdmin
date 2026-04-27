#!/usr/bin/env node

/**
 * checkArchConstraints.cjs — Architecture constraint checker for nodeAdmin.
 *
 * Validates:
 * 1. Outbox pattern: message insert + outbox insert in same transaction
 * 2. No dual-write: no direct Kafka producer.send() outside OutboxPublisherService
 * 3. IM event field completeness: StoredMessage/ImMessage has all required fields
 * 4. Outbox schema present: outboxEvents table defined in schema
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const errors = [];
const warnings = [];

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function readDir(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true });
}

function walkDir(relPath, ext = '.ts') {
  const entries = readDir(relPath);
  const files = [];
  for (const entry of entries) {
    const full = path.join(relPath, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
      files.push(...walkDir(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext) && !entry.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

// ─── Check 1: Outbox Pattern Integrity ──────────────────────────────────
function checkOutboxPattern() {
  process.stdout.write(`\n  ${CYAN}[1/4] Outbox pattern integrity${RESET}\n`);

  const repo = readFile('apps/coreApi/src/infrastructure/database/imMessageRepository.ts');
  if (!repo) {
    errors.push('imMessageRepository.ts not found — cannot verify outbox pattern');
    process.stdout.write(`    ${RED}✗ imMessageRepository.ts not found${RESET}\n`);
    return;
  }

  // Check that outbox insert happens after message insert within same transaction
  const hasOutboxInsert = repo.includes('INSERT INTO outbox_events');
  const hasMessageInsert = repo.includes('INSERT INTO messages');
  const hasTransaction = repo.includes('BEGIN') || repo.includes('runWithTenant');

  if (!hasOutboxInsert) {
    errors.push('imMessageRepository.ts: no outbox_events INSERT found — outbox pattern may be broken');
    process.stdout.write(`    ${RED}✗ No outbox_events INSERT in imMessageRepository.ts${RESET}\n`);
  } else if (!hasMessageInsert) {
    errors.push('imMessageRepository.ts: no messages INSERT found');
    process.stdout.write(`    ${RED}✗ No messages INSERT in imMessageRepository.ts${RESET}\n`);
  } else if (!hasTransaction) {
    errors.push('imMessageRepository.ts: message + outbox inserts not in a transaction');
    process.stdout.write(`    ${RED}✗ No transaction wrapper found${RESET}\n`);
  } else {
    // Verify ordering: message insert should appear before outbox insert
    const msgIdx = repo.indexOf('INSERT INTO messages');
    const outboxIdx = repo.indexOf('INSERT INTO outbox_events');
    if (msgIdx > 0 && outboxIdx > 0 && msgIdx < outboxIdx) {
      process.stdout.write(`    ${GREEN}✓ Message insert + outbox insert in same transaction${RESET}\n`);
    } else {
      errors.push('imMessageRepository.ts: outbox insert appears before message insert — wrong order');
      process.stdout.write(`    ${RED}✗ Outbox insert appears before message insert${RESET}\n`);
    }
  }

  // Check that the event type is defined
  if (repo.includes("'im.message.sent'") || repo.includes('"im.message.sent"')) {
    process.stdout.write(`    ${GREEN}✓ Outbox event type 'im.message.sent' defined${RESET}\n`);
  } else {
    warnings.push('imMessageRepository.ts: no known event type (im.message.sent) found in outbox insert');
    process.stdout.write(`    ${YELLOW}⚠ No standard event type found in outbox insert${RESET}\n`);
  }
}

// ─── Check 2: No Direct Kafka Calls (Dual-Write Prevention) ─────────────
function checkNoDirectKafkaCalls() {
  process.stdout.write(`\n  ${CYAN}[2/4] Dual-write prevention (no direct Kafka calls)${RESET}\n`);

  const ALLOWED_KAFKA_FILES = new Set([
    // These files are allowed to call producer.send()
    'apps/coreApi/src/infrastructure/outbox/outboxPublisherService.ts',
    // Health check uses admin() only
    'apps/coreApi/src/modules/health/healthService.ts',
  ]);

  // Normalize path to forward slashes for cross-platform matching
  function normalizePath(p) {
    return p.replace(/\\/g, '/');
  }

  const srcFiles = walkDir('apps/coreApi/src');
  let violations = 0;

  for (const file of srcFiles) {
    const content = readFile(file);
    if (!content) continue;

    // Look for producer.send() calls (KafkaJS pattern)
    if (content.includes('producer.send(') || content.includes('.send(')) {
      // Check it's actually a Kafka producer, not a Socket.IO or HTTP call
      if (content.includes('Kafka(') || content.includes('kafkajs') || content.includes('Producer')) {
        if (!ALLOWED_KAFKA_FILES.has(normalizePath(file))) {
          errors.push(`${file}: direct Kafka producer.send() found outside allowed files`);
          process.stdout.write(`    ${RED}✗ ${file}: direct Kafka producer call${RESET}\n`);
          violations++;
        }
      }
    }
  }

  if (violations === 0) {
    process.stdout.write(`    ${GREEN}✓ No direct Kafka calls outside OutboxPublisherService${RESET}\n`);
  }
}

// ─── Check 3: IM Event Field Completeness ───────────────────────────────
function checkEventFieldCompleteness() {
  process.stdout.write(`\n  ${CYAN}[3/4] IM event field completeness${RESET}\n`);

  const REQUIRED_FIELDS = [
    'content',
    'conversationId',
    'createdAt',
    'deletedAt',
    'editedAt',
    'messageId',
    'messageType',
    'metadata',
    'sequenceId',
    'tenantId',
    'traceId',
    'userId',
  ];

  // Check shared-types
  const sharedTypes = readFile('packages/shared-types/src/index.ts');
  if (!sharedTypes) {
    warnings.push('packages/shared-types/src/index.ts not found — cannot verify ImMessage fields');
    process.stdout.write(`    ${YELLOW}⚠ shared-types not found, skipping field check${RESET}\n`);
    return;
  }

  const missingInShared = [];
  for (const field of REQUIRED_FIELDS) {
    if (!sharedTypes.includes(field)) {
      missingInShared.push(field);
    }
  }

  if (missingInShared.length === 0) {
    process.stdout.write(
      `    ${GREEN}✓ ImMessage interface has all ${REQUIRED_FIELDS.length} required fields${RESET}\n`,
    );
  } else {
    errors.push(`shared-types: ImMessage missing fields: ${missingInShared.join(', ')}`);
    process.stdout.write(`    ${RED}✗ Missing fields: ${missingInShared.join(', ')}${RESET}\n`);
  }

  // Check repository row mapping includes all fields
  const repo = readFile('apps/coreApi/src/infrastructure/database/imMessageRepository.ts');
  if (repo) {
    const snakeFields = REQUIRED_FIELDS.map((f) => f.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
    const missingInRepo = [];
    for (const field of snakeFields) {
      if (!repo.includes(field)) {
        missingInRepo.push(field);
      }
    }

    if (missingInRepo.length === 0) {
      process.stdout.write(`    ${GREEN}✓ Repository row type covers all required fields${RESET}\n`);
    } else {
      warnings.push(`imMessageRepository.ts: row type may be missing: ${missingInRepo.join(', ')}`);
      process.stdout.write(`    ${YELLOW}⚠ Row type possibly missing: ${missingInRepo.join(', ')}${RESET}\n`);
    }
  }
}

// ─── Check 4: Outbox Schema Present ─────────────────────────────────────
function checkOutboxSchema() {
  process.stdout.write(`\n  ${CYAN}[4/4] Outbox schema definition${RESET}\n`);

  const schema = readFile('apps/coreApi/src/infrastructure/database/schema.ts');
  if (!schema) {
    errors.push('schema.ts not found — cannot verify outbox schema');
    process.stdout.write(`    ${RED}✗ schema.ts not found${RESET}\n`);
    return;
  }

  const REQUIRED_OUTBOX_COLUMNS = [
    'outboxEvents',
    'aggregate_id',
    'event_type',
    'payload',
    'published_at',
    'retry_count',
    'tenant_id',
  ];

  const missing = [];
  for (const col of REQUIRED_OUTBOX_COLUMNS) {
    if (!schema.includes(col)) {
      missing.push(col);
    }
  }

  if (missing.length === 0) {
    process.stdout.write(`    ${GREEN}✓ outboxEvents table has all required columns${RESET}\n`);
  } else {
    errors.push(`schema.ts: outboxEvents missing columns: ${missing.join(', ')}`);
    process.stdout.write(`    ${RED}✗ Missing columns: ${missing.join(', ')}${RESET}\n`);
  }

  // Check that OutboxPublisherService exists
  const publisher = readFile('apps/coreApi/src/infrastructure/outbox/outboxPublisherService.ts');
  if (publisher) {
    process.stdout.write(`    ${GREEN}✓ OutboxPublisherService exists${RESET}\n`);

    // Verify it polls unpublished events
    if (publisher.includes('published_at IS NULL') || publisher.includes('publishedAt IS NULL')) {
      process.stdout.write(`    ${GREEN}✓ Publisher polls unpublished events${RESET}\n`);
    } else {
      warnings.push('OutboxPublisherService: no unpublished event polling query found');
      process.stdout.write(`    ${YELLOW}⚠ No unpublished event polling pattern found${RESET}\n`);
    }
  } else {
    errors.push('outboxPublisherService.ts not found');
    process.stdout.write(`    ${RED}✗ outboxPublisherService.ts not found${RESET}\n`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────
function main() {
  process.stdout.write(`\n${BOLD}${CYAN}═══ Architecture Constraint Checker ═══${RESET}\n`);

  checkOutboxPattern();
  checkNoDirectKafkaCalls();
  checkEventFieldCompleteness();
  checkOutboxSchema();

  // Summary
  process.stdout.write(`\n${BOLD}═══════════════════════════════════════${RESET}\n`);
  const totalIssues = errors.length + warnings.length;
  if (errors.length === 0 && warnings.length === 0) {
    process.stdout.write(`  ${GREEN}${BOLD}PASS${RESET} — All architecture constraints satisfied\n`);
  } else if (errors.length === 0) {
    process.stdout.write(`  ${YELLOW}${BOLD}PASS (with warnings)${RESET} — ${warnings.length} warning(s)\n`);
  } else {
    process.stdout.write(`  ${RED}${BOLD}FAIL${RESET} — ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  }

  if (errors.length > 0) {
    process.stdout.write(`\n  ${RED}Errors:${RESET}\n`);
    for (const err of errors) {
      process.stdout.write(`    ${RED}• ${err}${RESET}\n`);
    }
  }
  if (warnings.length > 0) {
    process.stdout.write(`\n  ${YELLOW}Warnings:${RESET}\n`);
    for (const w of warnings) {
      process.stdout.write(`    ${YELLOW}• ${w}${RESET}\n`);
    }
  }

  process.stdout.write(`\n## CONCLUSION\n`);
  process.stdout.write(`result: ${errors.length === 0 ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`errors: ${errors.length}\n`);
  process.stdout.write(`warnings: ${warnings.length}\n`);
  process.stdout.write(`checks: 4\n`);
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
