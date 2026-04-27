const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const SOURCE_ROOTS = ['apps/coreApi/src', 'apps/adminPortal/src'];
const BUSINESS_ROOTS = [
  'apps/coreApi/src/modules',
  'apps/coreApi/src/services',
  'apps/coreApi/src/infrastructure',
  'apps/adminPortal/src/components/business',
  'apps/adminPortal/src/services',
  'apps/adminPortal/src/hooks',
  'apps/adminPortal/src/stores',
  'apps/adminPortal/src/lib',
];
const COMPONENT_ROOTS = ['apps/adminPortal/src/components/business', 'apps/adminPortal/src/components/ui'];
const FRAMEWORK_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.setup.ts',
  'playwright.config.ts',
  'postcss.config.js',
  'tailwind.config.ts',
  'eslint.config.cjs',
]);

const EXCLUDED_DIRS = new Set(['__tests__', 'node_modules', 'dist', 'Dist', '.git']);

const violations = [];

function toPosix(targetPath) {
  return targetPath.split(path.sep).join('/');
}

function walk(dirPath, onEntry) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    onEntry(fullPath, entry);
    if (entry.isDirectory()) walk(fullPath, onEntry);
  }
}

function isLowercaseDirectory(name) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function isLowerCamelCase(name) {
  return /^[a-z][A-Za-z0-9]*$/.test(name);
}

function isPascalCase(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function isHookName(name) {
  return /^use[A-Z0-9]/.test(name);
}

function toLowerCamelCase(name) {
  const parts = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').match(/[A-Za-z0-9]+/g) || [name];
  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      return index === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
    })
    .join('');
}

function toPascalCase(name) {
  return name ? name[0].toUpperCase() + name.slice(1) : name;
}

function addViolation(relativePath, message, suggestion) {
  violations.push({ relativePath: toPosix(relativePath), message, suggestion });
}

function isFrameworkFile(fileName) {
  return (
    FRAMEWORK_FILES.has(fileName) ||
    /^\.eslintrc\./.test(fileName) ||
    /^prettier\.config\./.test(fileName) ||
    /^vitest\.workspace\./.test(fileName)
  );
}

function isExemptBusinessFile(fileName) {
  return (
    isFrameworkFile(fileName) ||
    /\.(test|spec)\.tsx?$/.test(fileName) ||
    /\.d\.ts$/.test(fileName) ||
    /\.decorator\.ts$/.test(fileName) ||
    /\.module\.ts$/.test(fileName)
  );
}

function checkDirectories() {
  for (const root of SOURCE_ROOTS) {
    walk(path.join(ROOT, root), (fullPath, entry) => {
      if (!entry.isDirectory() || isLowercaseDirectory(entry.name)) return;
      addViolation(
        path.relative(ROOT, fullPath),
        `Directory name "${entry.name}" must be lowercase`,
        entry.name.toLowerCase(),
      );
    });
  }
}
function checkBusinessFiles() {
  for (const root of BUSINESS_ROOTS) {
    walk(path.join(ROOT, root), (fullPath, entry) => {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || isExemptBusinessFile(entry.name)) return;
      const extension = path.extname(entry.name);
      const baseName = path.basename(entry.name, extension);
      if (isLowerCamelCase(baseName)) return;
      addViolation(
        path.relative(ROOT, fullPath),
        `Business file "${entry.name}" must use lowerCamelCase`,
        `${toLowerCamelCase(baseName)}${extension}`,
      );
    });
  }
}
function checkComponentExports() {
  const exportPatterns = [
    /export\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s+default\s+function\s*([A-Za-z0-9_]*)/g,
    /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*React\.forwardRef\b/g,
    /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/g,
    /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*function\b/g,
  ];

  for (const root of COMPONENT_ROOTS) {
    walk(path.join(ROOT, root), (fullPath, entry) => {
      if (!entry.isFile() || path.extname(entry.name) !== '.tsx') return;
      const source = fs.readFileSync(fullPath, 'utf8');
      const relativePath = path.relative(ROOT, fullPath);
      const localFunctions = new Set(
        Array.from(source.matchAll(/(?:function|const|let|var)\s+([A-Za-z0-9_]+)\b/g), (match) => match[1]),
      );

      for (const pattern of exportPatterns) {
        for (const match of source.matchAll(pattern)) {
          const exportName = match[1];
          if (!exportName) {
            addViolation(relativePath, 'Default exported component function must be named in PascalCase');
          } else if (isHookName(exportName)) {
            continue;
          } else if (!isPascalCase(exportName)) {
            addViolation(
              relativePath,
              `Exported component function "${exportName}" must use PascalCase`,
              toPascalCase(exportName),
            );
          }
        }
      }

      for (const match of source.matchAll(/export\s+default\s+([A-Za-z0-9_]+)\s*;/g)) {
        const exportName = match[1];
        if (localFunctions.has(exportName) && !isHookName(exportName) && !isPascalCase(exportName)) {
          addViolation(
            relativePath,
            `Default exported component "${exportName}" must use PascalCase`,
            toPascalCase(exportName),
          );
        }
      }
    });
  }
}
function printResults() {
  process.stdout.write(`\n${CYAN}${BOLD}Checking naming conventions...${RESET}\n`);
  if (violations.length === 0) {
    process.stdout.write(`\n${GREEN}${BOLD}✓ All naming conventions satisfied${RESET}\n`);
    return;
  }

  process.stdout.write(`\n${RED}${BOLD}✗ Naming convention violations${RESET}\n`);
  for (const violation of violations) {
    process.stdout.write(`${RED}•${RESET} ${CYAN}${violation.relativePath}${RESET} — ${violation.message}\n`);
    if (violation.suggestion) process.stdout.write(`  ${YELLOW}Suggestion:${RESET} ${violation.suggestion}\n`);
  }
  process.stdout.write(`\n${RED}${BOLD}${violations.length} violations found${RESET}\n`);
}

checkDirectories();
checkBusinessFiles();
checkComponentExports();
printResults();
process.exit(violations.length === 0 ? 0 : 1);
