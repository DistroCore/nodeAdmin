#!/usr/bin/env node

/**
 * qualityScorecard.cjs — Repo-level quality scorecard for nodeAdmin.
 *
 * Scores 5 dimensions (each 0-20 pts, total 100):
 * 1. Documentation consistency
 * 2. Test completeness
 * 3. Lint compliance
 * 4. Architecture constraints
 * 5. Tech debt tracking
 *
 * Grade: A (90+), B (80-89), C (70-79), D (60-69), F (<60)
 * Exit 0 if score >= 70, exit 1 if < 70.
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
const DIM = '\x1b[2m';

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

function grade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function pad(label, len = 40) {
  const dots = '.'.repeat(Math.max(1, len - label.length));
  return `${label} ${dots}`;
}

// ─── Check 1: Documentation Consistency (20 pts) ────────────────────────
function checkDocumentation() {
  process.stdout.write(`\n  ${CYAN}[1/5] Documentation consistency${RESET}\n`);
  let score = 0;
  const max = 20;

  // 5 pts: governance docs have status fields
  const govDir = readDir('docs/governance');
  let govWithStatus = 0;
  let govTotal = 0;
  for (const entry of govDir) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      govTotal++;
      const content = readFile(path.join('docs/governance', entry.name));
      if (content && content.includes('**status**:')) {
        govWithStatus++;
      }
    }
  }
  const govRatio = govTotal > 0 ? govWithStatus / govTotal : 0;
  const govPts = Math.round(govRatio * 5);
  score += govPts;
  process.stdout.write(
    `    ${govPts === 5 ? GREEN : YELLOW}${govPts}/5${RESET} — Governance docs with status: ${govWithStatus}/${govTotal}\n`,
  );

  // 5 pts: harnessGapChecklist checked items count
  const checklist = readFile('docs/governance/harnessGapChecklist.md');
  if (checklist) {
    const checked = (checklist.match(/- \[x\]/g) || []).length;
    const unchecked = (checklist.match(/- \[ \]/g) || []).length;
    const total = checked + unchecked;
    const ratio = total > 0 ? checked / total : 0;
    const clPts = Math.round(ratio * 5);
    score += clPts;
    process.stdout.write(
      `    ${clPts >= 4 ? GREEN : YELLOW}${clPts}/5${RESET} — Harness checklist: ${checked}/${total} items done\n`,
    );
  } else {
    process.stdout.write(`    ${RED}0/5${RESET} — harnessGapChecklist.md not found\n`);
  }

  // 5 pts: docIndex references exist
  const docIndex = readFile('docs/docIndex.md');
  if (docIndex) {
    const refs = docIndex.match(/\[.*?\]\((.*?)\)/g) || [];
    let existing = 0;
    for (const ref of refs) {
      const m = ref.match(/\((.*?)\)/);
      if (m && fs.existsSync(path.join(ROOT, m[1]))) {
        existing++;
      }
    }
    const refPts = refs.length > 0 ? Math.round((existing / refs.length) * 5) : 0;
    score += refPts;
    process.stdout.write(
      `    ${refPts >= 4 ? GREEN : YELLOW}${refPts}/5${RESET} — Doc index references: ${existing}/${refs.length} exist\n`,
    );
  } else {
    process.stdout.write(`    ${YELLOW}3/5${RESET} — docIndex.md not found, awarding partial\n`);
    score += 3;
  }

  // 5 pts: decisionLog has status on entries
  const decisions = readFile('docs/governance/decisionLog.md');
  if (decisions) {
    const entries = decisions.match(/### D-\d+/g) || [];
    const approved = (decisions.match(/status:\s*(approved|superseded)/g) || []).length;
    const decPts = entries.length > 0 ? Math.round((approved / entries.length) * 5) : 5;
    score += Math.min(decPts, 5);
    process.stdout.write(
      `    ${decPts >= 4 ? GREEN : YELLOW}${Math.min(decPts, 5)}/5${RESET} — Decision log: ${approved}/${entries.length} have status\n`,
    );
  } else {
    process.stdout.write(`    ${RED}0/5${RESET} — decisionLog.md not found\n`);
  }

  return Math.min(score, max);
}

// ─── Check 2: Test Completeness (20 pts) ────────────────────────────────
function checkTestCompleteness() {
  process.stdout.write(`\n  ${CYAN}[2/5] Test completeness${RESET}\n`);
  let score = 0;

  // Backend: test files vs source files in modules/
  const srcFiles = walkDir('apps/coreApi/src/modules', '.ts').filter(
    (f) => !f.includes('.test.') && !f.includes('.spec.'),
  );
  const testFiles = walkDir('apps/coreApi/src/modules', '.ts').filter(
    (f) => f.includes('.test.') || f.includes('.spec.'),
  );
  const beRatio = srcFiles.length > 0 ? Math.min(testFiles.length / srcFiles.length, 1) : 0;
  const bePts = Math.round(beRatio * 10);
  score += bePts;
  process.stdout.write(
    `    ${bePts >= 7 ? GREEN : YELLOW}${bePts}/10${RESET} — Backend tests: ${testFiles.length} test / ${srcFiles.length} source\n`,
  );

  // Frontend: test files vs source files
  const feSrc = walkDir('apps/adminPortal/src', '.tsx').filter((f) => !f.includes('.test.') && !f.includes('.spec.'));
  const feTest = walkDir('apps/adminPortal/src', '.tsx').filter((f) => f.includes('.test.') || f.includes('.spec.'));
  const feTsSrc = walkDir('apps/adminPortal/src', '.ts').filter((f) => !f.includes('.test.') && !f.includes('.spec.'));
  const feTsTest = walkDir('apps/adminPortal/src', '.ts').filter((f) => f.includes('.test.') || f.includes('.spec.'));
  const feTotalSrc = feSrc.length + feTsSrc.length;
  const feTotalTest = feTest.length + feTsTest.length;
  const feRatio = feTotalSrc > 0 ? Math.min(feTotalTest / feTotalSrc, 1) : 0;
  const fePts = Math.round(feRatio * 10);
  score += fePts;
  process.stdout.write(
    `    ${fePts >= 7 ? GREEN : YELLOW}${fePts}/10${RESET} — Frontend tests: ${feTotalTest} test / ${feTotalSrc} source\n`,
  );

  return Math.min(score, 20);
}

// ─── Check 3: Lint Compliance (20 pts) ──────────────────────────────────
function checkLintCompliance() {
  process.stdout.write(`\n  ${CYAN}[3/5] Lint compliance${RESET}\n`);
  let score = 20; // start full, deduct for violations

  // Count eslint-disable comments in source
  const allSrc = [
    ...walkDir('apps/coreApi/src', '.ts'),
    ...walkDir('apps/adminPortal/src', '.ts'),
    ...walkDir('apps/adminPortal/src', '.tsx'),
  ];
  let disableCount = 0;
  let anyCount = 0;
  let consoleCount = 0;

  for (const file of allSrc) {
    const content = readFile(file);
    if (!content) continue;
    disableCount += (content.match(/eslint-disable/g) || []).length;
    // Look for explicit any in non-comment, non-string contexts
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (trimmed.includes(': any') || trimmed.includes(': any[') || trimmed.includes('<any>')) {
        anyCount++;
      }
      if (trimmed.includes('console.log') && !trimmed.startsWith('//')) {
        consoleCount++;
      }
    }
  }

  score -= Math.min(anyCount * 2, 10);
  score -= Math.min(consoleCount * 2, 5);
  score -= Math.min(disableCount, 5);

  score = Math.max(score, 0);
  process.stdout.write(`    ${anyCount === 0 ? GREEN : RED}any types: ${anyCount}${RESET}\n`);
  process.stdout.write(`    ${consoleCount === 0 ? GREEN : RED}console.log calls: ${consoleCount}${RESET}\n`);
  process.stdout.write(`    ${disableCount === 0 ? GREEN : YELLOW}eslint-disable: ${disableCount}${RESET}\n`);
  process.stdout.write(`    ${score >= 18 ? GREEN : score >= 14 ? YELLOW : RED}${score}/20${RESET}\n`);

  return score;
}

// ─── Check 4: Architecture Constraints (20 pts) ────────────────────────
function checkArchitecture() {
  process.stdout.write(`\n  ${CYAN}[4/5] Architecture constraints${RESET}\n`);
  let score = 0;

  // Outbox pattern: message + outbox in same TX
  const repo = readFile('apps/coreApi/src/infrastructure/database/imMessageRepository.ts');
  const hasOutbox = repo && repo.includes('outbox');
  const hasTx = repo && (repo.includes('BEGIN') || repo.includes('runWithTenant'));
  if (hasOutbox && hasTx) {
    score += 5;
    process.stdout.write(`    ${GREEN}5/5${RESET} — Outbox pattern: message + outbox in same TX\n`);
  } else {
    process.stdout.write(`    ${RED}0/5${RESET} — Outbox pattern not verified\n`);
  }

  // No direct Kafka producer.send() outside allowed files
  const publisher = readFile('apps/coreApi/src/infrastructure/outbox/outboxPublisherService.ts');
  const healthService = readFile('apps/coreApi/src/modules/health/healthService.ts');
  const allowedContent = [publisher, healthService].filter(Boolean).join('\n');
  const srcFiles = walkDir('apps/coreApi/src');
  let kafkaViolations = 0;
  for (const file of srcFiles) {
    const content = readFile(file);
    if (!content) continue;
    const normalized = file.replace(/\\/g, '/');
    if (
      content.includes('producer.send(') &&
      !normalized.includes('outboxPublisherService') &&
      !normalized.includes('healthService')
    ) {
      kafkaViolations++;
    }
  }
  score += kafkaViolations === 0 ? 5 : 0;
  process.stdout.write(
    `    ${kafkaViolations === 0 ? GREEN : RED}${kafkaViolations === 0 ? 5 : 0}/5${RESET} — No dual-write violations\n`,
  );

  // Schema present with outboxEvents
  const schema = readFile('apps/coreApi/src/infrastructure/database/schema.ts');
  const hasOutboxTable = schema && schema.includes('outboxEvents');
  score += hasOutboxTable ? 5 : 0;
  process.stdout.write(
    `    ${hasOutboxTable ? GREEN : RED}${hasOutboxTable ? 5 : 0}/5${RESET} — Outbox schema defined\n`,
  );

  // Controller -> Service -> Repository layering
  const hasLayering = fs.existsSync(path.join(ROOT, 'scripts/checkLayerDependencies.cjs'));
  score += hasLayering ? 5 : 0;
  process.stdout.write(
    `    ${hasLayering ? GREEN : RED}${hasLayering ? 5 : 0}/5${RESET} — Layer dependency checker exists\n`,
  );

  return Math.min(score, 20);
}

// ─── Check 5: Tech Debt Tracking (20 pts) ───────────────────────────────
function checkTechDebt() {
  process.stdout.write(`\n  ${CYAN}[5/5] Tech debt tracking${RESET}\n`);
  let score = 0;

  const roadmap = readFile('docs/delivery/roadmapPlan.md');
  if (!roadmap) {
    process.stdout.write(`    ${RED}0/20${RESET} — roadmapPlan.md not found\n`);
    return 0;
  }

  // 10 pts: tech debt section exists with tracking IDs
  const tdSection = roadmap.match(/tech.?debt|TD-\d/i);
  const tdIds = roadmap.match(/TD-\d+/g) || [];
  const tdPts = tdSection ? Math.min(Math.round(tdIds.length * 2.5), 10) : 0;
  score += tdPts;
  process.stdout.write(
    `    ${tdPts >= 7 ? GREEN : YELLOW}${tdPts}/10${RESET} — Tech debt IDs found: ${tdIds.length}\n`,
  );

  // 10 pts: README known tech debt matches roadmap
  const readme = readFile('README.md');
  if (readme) {
    const readmeTds = readme.match(/TD-\d+/g) || [];
    const readmePts = readmeTds.length > 0 ? Math.min(readmeTds.length * 3, 10) : 0;
    score += readmePts;
    process.stdout.write(
      `    ${readmePts >= 7 ? GREEN : YELLOW}${readmePts}/10${RESET} — README references: ${readmeTds.join(', ') || 'none'}\n`,
    );
  } else {
    process.stdout.write(`    ${RED}0/10${RESET} — README.md not found\n`);
  }

  return Math.min(score, 20);
}

// ─── Main ───────────────────────────────────────────────────────────────
function main() {
  process.stdout.write(`\n${BOLD}${CYAN}═══ Quality Scorecard ═══${RESET}\n`);

  const scores = [
    checkDocumentation(),
    checkTestCompleteness(),
    checkLintCompliance(),
    checkArchitecture(),
    checkTechDebt(),
  ];

  const labels = [
    'Documentation consistency',
    'Test completeness',
    'Lint compliance',
    'Architecture constraints',
    'Tech debt tracking',
  ];

  const total = scores.reduce((a, b) => a + b, 0);
  const g = grade(total);

  process.stdout.write(`\n${BOLD}─────────────────────────────────────────────${RESET}\n`);
  for (let i = 0; i < scores.length; i++) {
    const color = scores[i] >= 18 ? GREEN : scores[i] >= 14 ? YELLOW : RED;
    process.stdout.write(`  ${pad(labels[i])} ${color}${BOLD}${scores[i]}/20${RESET}\n`);
  }
  process.stdout.write(`${BOLD}─────────────────────────────────────────────${RESET}\n`);

  const totalColor = total >= 90 ? GREEN : total >= 70 ? YELLOW : RED;
  process.stdout.write(`  ${BOLD}TOTAL: ${totalColor}${total}/100${RESET}  ${BOLD}Grade: ${totalColor}${g}${RESET}\n`);
  process.stdout.write(`${BOLD}─────────────────────────────────────────────${RESET}\n`);

  process.stdout.write(`\n## CONCLUSION\n`);
  process.stdout.write(`result: ${total >= 70 ? 'PASS' : 'FAIL'}\n`);
  process.stdout.write(`score: ${total}\n`);
  process.stdout.write(`grade: ${g}\n`);
  process.stdout.write(`checks: 5\n`);

  process.exit(total >= 70 ? 0 : 1);
}

main();
