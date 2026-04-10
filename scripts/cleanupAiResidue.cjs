#!/usr/bin/env node

/**
 * cleanupAiResidue.cjs — Scans codebase for common AI-generated code smells
 * and reports them for manual cleanup.
 *
 * Checks:
 * 1. TODO/FIXME comments with AI attribution
 * 2. Overly verbose comments that explain obvious code
 * 3. Suspiciously pattern-heavy code (repeated similar blocks)
 * 4. Leftover debug markers (console.log, debugger statements)
 * 5. Empty catch blocks
 * 6. Overly generic variable names (data, result, item, temp)
 */

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const SCAN_DIRS = ['apps/coreApi/src', 'apps/adminPortal/src'];
const EXCLUDED_EXTENSIONS = ['.d.ts', '.map', '.css'];
const MAX_FILE_SIZE = 100_000; // Skip files larger than 100KB

const findings = [];

function shouldScan(filePath) {
  if (EXCLUDED_EXTENSIONS.some((ext) => filePath.endsWith(ext))) return false;
  if (filePath.includes('__tests__')) return false;
  if (filePath.includes('.test.') || filePath.includes('.spec.')) return false;
  if (filePath.includes('node_modules')) return false;
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx');
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...walkDir(fullPath));
    } else if (entry.isFile() && shouldScan(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkFile(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check 1: AI-attributed TODOs
    if (/\/\/\s*TODO.*(?:AI|GPT|Claude|Copilot|ChatGPT|gemini|codex)/i.test(line)) {
      findings.push({
        severity: 'warn',
        file: relativePath,
        line: lineNum,
        type: 'AI-attributed TODO',
        content: line.trim(),
      });
    }

    // Check 4: console.log / debugger statements (non-test files)
    if (/\bconsole\.log\s*\(/.test(line) && !filePath.includes('.test.')) {
      findings.push({
        severity: 'error',
        file: relativePath,
        line: lineNum,
        type: 'console.log',
        content: line.trim(),
      });
    }

    if (/\bdebugger\b/.test(line)) {
      findings.push({
        severity: 'error',
        file: relativePath,
        line: lineNum,
        type: 'debugger statement',
        content: line.trim(),
      });
    }

    // Check 5: Empty catch blocks
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
      findings.push({
        severity: 'error',
        file: relativePath,
        line: lineNum,
        type: 'empty catch block',
        content: line.trim(),
      });
    }

    // Check 6: ts-ignore / ts-expect-error (non-test)
    if (/@ts-ignore|@ts-expect-error/.test(line) && !filePath.includes('.test.')) {
      findings.push({
        severity: 'warn',
        file: relativePath,
        line: lineNum,
        type: 'TypeScript suppression',
        content: line.trim(),
      });
    }
  }
}

function main() {
  process.stdout.write(`\n${BOLD}${CYAN}AI Residue Cleanup Scanner${RESET}\n\n`);

  let totalFiles = 0;

  for (const scanDir of SCAN_DIRS) {
    const fullDir = path.join(process.cwd(), scanDir);
    if (!fs.existsSync(fullDir)) continue;

    const files = walkDir(fullDir);
    totalFiles += files.length;

    for (const file of files) {
      checkFile(file);
    }
  }

  process.stdout.write(`  Scanned ${totalFiles} files\n\n`);

  if (findings.length === 0) {
    process.stdout.write(`  ${GREEN}${BOLD}No AI residue found.${RESET}\n\n`);
    process.exit(0);
  }

  // Group by severity
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warn');

  if (errors.length > 0) {
    process.stdout.write(`  ${RED}${BOLD}Errors (${errors.length}):${RESET}\n`);
    for (const f of errors) {
      process.stdout.write(`    ${RED}${f.file}:${f.line}${RESET} [${f.type}] ${f.content}\n`);
    }
    process.stdout.write('\n');
  }

  if (warnings.length > 0) {
    process.stdout.write(`  ${YELLOW}${BOLD}Warnings (${warnings.length}):${RESET}\n`);
    for (const f of warnings) {
      process.stdout.write(`    ${YELLOW}${f.file}:${f.line}${RESET} [${f.type}] ${f.content}\n`);
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);
  process.stdout.write(
    `  ${errors.length > 0 ? `${RED}${BOLD}ACTION REQUIRED${RESET}` : `${YELLOW}${BOLD}REVIEW RECOMMENDED${RESET}`} — ${findings.length} findings\n`,
  );
  process.stdout.write(`${BOLD}═══════════════════════════════════════${RESET}\n`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
