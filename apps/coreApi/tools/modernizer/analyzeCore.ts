/**
 * Modernizer core analysis logic — shared between NestJS module and CLI.
 * No framework dependencies. Pure functions only.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type AnalysisCategory = 'console-log' | 'todo' | 'missing-validation' | 'unused-import';
export type AnalysisSeverity = 'info' | 'warning' | 'error';

export interface AnalysisIssue {
  file: string;
  line: number;
  category: AnalysisCategory;
  message: string;
  severity: AnalysisSeverity;
}

export interface AnalysisSummary {
  total: number;
  byCategory: Record<string, number>;
}

export interface AnalysisResult {
  issues: AnalysisIssue[];
  summary: AnalysisSummary;
}

const CONSOLE_REGEX = /\bconsole\.(log|warn|error)\s*\(/;
const TODO_REGEX = /\/\/\s*(TODO|FIXME)\b/i;
const BODY_NO_VALIDATION_REGEX = /@Body\(\)\s+(\w+):\s+(?!Create|Update|List|Login|Register|Change)(\w+)/;
const IMPORT_REGEX = /^import\s+(?:\{([^}]+)\}|(\w+))\s+from/;

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '__tests__']);
const IGNORED_SUFFIXES = new Set(['.test.ts', '.spec.ts', '.d.ts']);

export function analyzeProject(srcDir: string): AnalysisResult {
  const issues: AnalysisIssue[] = [];

  if (!fs.existsSync(srcDir)) {
    return { issues: [], summary: { total: 0, byCategory: {} } };
  }

  scanDirectory(srcDir, issues, srcDir);

  const byCategory: Record<string, number> = {};
  for (const issue of issues) {
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
  }

  return { issues, summary: { total: issues.length, byCategory } };
}

function scanDirectory(dir: string, issues: AnalysisIssue[], root: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath, issues, root);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (IGNORED_SUFFIXES.has(entry.name) || entry.name.endsWith('.test.ts')) continue;
      scanFile(fullPath, issues, root);
    }
  }
}

function scanFile(filePath: string, issues: AnalysisIssue[], root: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(root, filePath).replace(/\\/g, '/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (CONSOLE_REGEX.test(line)) {
      const match = line.match(/\bconsole\.(log|warn|error)/);
      issues.push({
        file: relativePath,
        line: lineNum,
        category: 'console-log',
        message: `Found console.${match ? match[1] : 'log'} call — use NestJS Logger instead`,
        severity: 'error',
      });
    }

    const todoMatch = TODO_REGEX.exec(line);
    if (todoMatch) {
      issues.push({
        file: relativePath,
        line: lineNum,
        category: 'todo',
        message: `${todoMatch[1].toUpperCase()} comment found`,
        severity: 'info',
      });
    }

    if (BODY_NO_VALIDATION_REGEX.test(line)) {
      issues.push({
        file: relativePath,
        line: lineNum,
        category: 'missing-validation',
        message: '@Body() parameter may be missing class-validator DTO',
        severity: 'warning',
      });
    }
  }

  checkUnusedImports(lines, relativePath, issues);
}

function checkUnusedImports(lines: string[], filePath: string, issues: AnalysisIssue[]): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const importMatch = IMPORT_REGEX.exec(line);
    if (!importMatch) continue;

    const namedImports = importMatch[1];
    const defaultImport = importMatch[2];

    if (namedImports) {
      const names = namedImports
        .split(',')
        .map((n: string) =>
          n
            .trim()
            .split(/\s+as\s+/)
            .pop()!
            .trim(),
        )
        .filter(Boolean);

      const fullContent = lines.join('\n');
      for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'g');
        const matches = fullContent.match(regex);
        const count = matches ? matches.length : 0;

        if (count <= 1) {
          issues.push({
            file: filePath,
            line: i + 1,
            category: 'unused-import',
            message: `Import "${name}" appears to be unused`,
            severity: 'info',
          });
        }
      }
    } else if (defaultImport) {
      const fullContent = lines.join('\n');
      const escaped = defaultImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'g');
      const matches = fullContent.match(regex);
      const count = matches ? matches.length : 0;

      if (count <= 1) {
        issues.push({
          file: filePath,
          line: i + 1,
          category: 'unused-import',
          message: `Default import "${defaultImport}" appears to be unused`,
          severity: 'info',
        });
      }
    }
  }
}
