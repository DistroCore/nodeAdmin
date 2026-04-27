#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const SOURCE_ROOT = path.resolve(__dirname, '..', 'apps', 'coreApi', 'src');
const IMPORT_PATTERN =
  /(?:import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\))/g;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      files.push(...walk(fullPath));
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function getLayer(filePath) {
  const name = path.basename(filePath);
  if (name.endsWith('Controller.ts')) return 'controller';
  if (name.endsWith('Service.ts')) return 'service';
  if (name.endsWith('Repository.ts')) return 'repository';
  if (name.endsWith('Guard.ts')) return 'guard';
  if (filePath.split(path.sep).includes('dto')) return 'dto';
  return null;
}

function getModuleScope(filePath) {
  const relativePath = path.relative(SOURCE_ROOT, filePath);
  const parts = relativePath.split(path.sep);
  if (parts.length < 2) {
    return parts[0] || '';
  }
  if (parts[0] === 'modules') {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  if (parts[0] === 'infrastructure') {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return parts[0];
}

function resolveImport(fromFile, importTarget) {
  const basePath = path.resolve(path.dirname(fromFile), importTarget);
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.js`, path.join(basePath, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getViolationReason(importerLayer, importedLayer) {
  if (importerLayer === 'controller' && importedLayer === 'repository') {
    return 'Controllers must depend on Services, not Repositories';
  }
  if (importerLayer === 'repository' && ['controller', 'service'].includes(importedLayer)) {
    return 'Repositories must not depend on Controllers or Services';
  }
  if (importerLayer === 'service' && importedLayer === 'controller') {
    return 'Services must not depend on Controllers';
  }
  if (importerLayer === 'dto' && ['service', 'repository'].includes(importedLayer)) {
    return 'DTOs must not depend on Services or Repositories';
  }
  return null;
}

function collectViolations(filePath) {
  const importerLayer = getLayer(filePath);
  if (!importerLayer) {
    return [];
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const matches = source.matchAll(IMPORT_PATTERN);
  const violations = [];

  for (const match of matches) {
    const importTarget = match[1] || match[2] || match[3];
    if (!importTarget || !importTarget.startsWith('.')) {
      continue;
    }

    const resolvedPath = resolveImport(filePath, importTarget);
    if (!resolvedPath || path.extname(resolvedPath) !== '.ts') {
      continue;
    }
    if (getModuleScope(filePath) !== getModuleScope(resolvedPath)) {
      continue;
    }

    const importedLayer = getLayer(resolvedPath);
    const reason = getViolationReason(importerLayer, importedLayer);
    if (!reason) {
      continue;
    }

    violations.push({
      filePath,
      importStatement: match[0].replace(/\s+/g, ' ').trim(),
      reason,
    });
  }

  return violations;
}

function printViolations(violations) {
  for (const violation of violations) {
    const relativePath = path.relative(path.resolve(__dirname, '..'), violation.filePath);
    process.stdout.write(`\n${RED}${BOLD}✗ Layer violation${RESET}\n`);
    process.stdout.write(`  ${CYAN}File:${RESET} ${relativePath}\n`);
    process.stdout.write(`  ${YELLOW}Import:${RESET} ${violation.importStatement}\n`);
    process.stdout.write(`  ${RED}Why:${RESET} ${violation.reason}\n`);
  }
}

function main() {
  process.stdout.write(`\n${BOLD}${CYAN}Checking backend layer dependencies...${RESET}\n`);

  if (!fs.existsSync(SOURCE_ROOT)) {
    process.stderr.write(`${RED}${BOLD}Source directory not found:${RESET} ${SOURCE_ROOT}\n`);
    process.exit(1);
  }

  const violations = walk(SOURCE_ROOT).flatMap(collectViolations);

  if (violations.length > 0) {
    printViolations(violations);
    process.stdout.write(`\n${RED}${BOLD}${violations.length} layer violations found${RESET}\n`);
    process.exit(1);
  }

  process.stdout.write(`${GREEN}${BOLD}✓ Layer dependencies OK${RESET}\n`);
}

main();
