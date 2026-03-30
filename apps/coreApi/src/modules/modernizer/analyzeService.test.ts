import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { AnalyzeService } from './analyzeService';

function createFileEntry(name: string) {
  return {
    isDirectory: () => false,
    isFile: () => true,
    name,
  };
}

function mockSourceFiles(files: Record<string, string>): void {
  vi.mocked(fs.existsSync).mockImplementation((target) => {
    if (typeof target !== 'string') {
      return false;
    }

    return target === '/fake/project/src' || target in files;
  });

  vi.mocked(fs.readdirSync).mockImplementation((target) => {
    if (target !== '/fake/project/src') {
      return [];
    }

    return Object.keys(files).map((filePath) => createFileEntry(filePath.split('/').at(-1) ?? ''));
  });

  vi.mocked(fs.readFileSync).mockImplementation((target) => {
    if (typeof target !== 'string') {
      return '';
    }

    return files[target] ?? '';
  });
}

describe('AnalyzeService', () => {
  let service: AnalyzeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyzeService();
  });

  it('returns an empty result when the src directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(service.analyze('/fake/project')).toEqual({
      issues: [],
      summary: {
        byCategory: {},
        total: 0,
      },
    });
  });

  it('detects the console-log analysis category', () => {
    mockSourceFiles({
      '/fake/project/src/app.ts': 'console.log("hello");\n',
    });

    const result = service.analyze('/fake/project');

    expect(result.issues).toEqual([
      expect.objectContaining({
        category: 'console-log',
        file: 'src/app.ts',
        line: 1,
        severity: 'error',
      }),
    ]);
    expect(result.summary.byCategory['console-log']).toBe(1);
  });

  it('detects the todo analysis category for TODO and FIXME comments', () => {
    mockSourceFiles({
      '/fake/project/src/todo.ts': '// TODO: revisit\n// FIXME: broken\n',
    });

    const result = service.analyze('/fake/project');

    expect(result.issues.map((issue) => issue.category)).toEqual(['todo', 'todo']);
    expect(result.summary.byCategory.todo).toBe(2);
  });

  it('detects the missing-validation analysis category', () => {
    mockSourceFiles({
      '/fake/project/src/controller.ts': '@Body() payload: RawPayload\n',
    });

    const result = service.analyze('/fake/project');

    expect(result.issues).toEqual([
      expect.objectContaining({
        category: 'missing-validation',
        file: 'src/controller.ts',
        line: 1,
        severity: 'warning',
      }),
    ]);
  });

  it('detects the unused-import analysis category', () => {
    mockSourceFiles({
      '/fake/project/src/unused.ts': "import { UnusedThing } from './dep';\nconst value = 1;\n",
    });

    const result = service.analyze('/fake/project');

    expect(result.issues).toEqual([
      expect.objectContaining({
        category: 'unused-import',
        file: 'src/unused.ts',
        line: 1,
      }),
    ]);
  });
});
