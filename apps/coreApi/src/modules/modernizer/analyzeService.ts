import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

type AnalysisCategory = 'console-log' | 'todo' | 'missing-validation' | 'unused-import';
type AnalysisSeverity = 'info' | 'warning' | 'error';

interface AnalysisIssue {
  file: string;
  line: number;
  category: AnalysisCategory;
  message: string;
  severity: AnalysisSeverity;
}

interface AnalysisSummary {
  total: number;
  byCategory: Record<string, number>;
}

interface AnalysisResult {
  issues: AnalysisIssue[];
  summary: AnalysisSummary;
}

const CONSOLE_REGEX = /\bconsole\.(log|warn|error)\s*\(/;
const TODO_REGEX = /\/\/\s*(TODO|FIXME)\b/i;
const BODY_NO_VALIDATION_REGEX = /@Body\(\)\s+(\w+):\s+(?!Create|Update|List|Login|Register|Change)(\w+)/;
const IMPORT_REGEX = /^import\s+(?:\{([^}]+)\}|(\w+))\s+from/;

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '__tests__']);
const IGNORED_SUFFIXES = new Set(['.test.ts', '.spec.ts', '.d.ts']);

@Injectable()
export class AnalyzeService {
  private readonly logger = new Logger(AnalyzeService.name);

  /**
   * Scan the project source directory and return all detected issues.
   */
  analyze(projectRoot?: string): AnalysisResult {
    const root = projectRoot ?? this.resolveProjectRoot();
    const issues: AnalysisIssue[] = [];
    const coreApiRoot = path.join(root, 'apps', 'coreApi');

    const srcDir = path.join(coreApiRoot, 'src');
    if (!fs.existsSync(srcDir)) {
      this.logger.warn(`Source directory not found: ${srcDir}`);
      return { issues: [], summary: { total: 0, byCategory: {} } };
    }

    this.scanDirectory(srcDir, issues, coreApiRoot);

    const byCategory: Record<string, number> = {};
    for (const issue of issues) {
      byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
    }

    return {
      issues,
      summary: { total: issues.length, byCategory },
    };
  }

  private resolveProjectRoot(): string {
    // __dirname = .../apps/coreApi/src/modules/modernizer
    return path.resolve(__dirname, '..', '..', '..', '..', '..');
  }

  private scanDirectory(dir: string, issues: AnalysisIssue[], root: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.scanDirectory(fullPath, issues, root);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        if (IGNORED_SUFFIXES.has(entry.name) || entry.name.endsWith('.test.ts')) continue;
        this.scanFile(fullPath, issues, root);
      }
    }
  }

  private scanFile(filePath: string, issues: AnalysisIssue[], root: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(root, filePath).replace(/\\/g, '/');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for console.log/warn/error
      if (CONSOLE_REGEX.test(line)) {
        issues.push({
          file: relativePath,
          line: lineNum,
          category: 'console-log',
          message: `Found console.${this.extractConsoleMethod(line)} call — use NestJS Logger instead`,
          severity: 'error',
        });
      }

      // Check for TODO/FIXME comments
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

      // Check for @Body() without validation DTO
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

    // Check for unused imports (simplified: detect imports whose names appear only once)
    this.checkUnusedImports(lines, relativePath, issues);
  }

  private extractConsoleMethod(line: string): string {
    const match = line.match(/\bconsole\.(log|warn|error)/);
    return match ? match[1] : 'log';
  }

  private checkUnusedImports(lines: string[], filePath: string, issues: AnalysisIssue[]): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const importMatch = IMPORT_REGEX.exec(line);
      if (!importMatch) continue;

      const namedImports = importMatch[1]; // { A, B, C }
      const defaultImport = importMatch[2]; // X

      if (namedImports) {
        const names = namedImports
          .split(',')
          .map((n) =>
            n
              .trim()
              .split(/\s+as\s+/)
              .pop()!
              .trim(),
          )
          .filter(Boolean);

        const fullContent = lines.join('\n');
        for (const name of names) {
          // Count occurrences excluding the import line itself
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'g');
          const matches = fullContent.match(regex);
          const count = matches ? matches.length : 0;

          // Should appear at least twice (once in import, once in usage)
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
}
