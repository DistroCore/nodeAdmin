import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyzeService } from './analyzeService';
import { DocSyncService } from './docSyncService';
import { ModernizerController } from './modernizerController';

describe('ModernizerController', () => {
  let controller: ModernizerController;
  let analyzeService: { analyze: ReturnType<typeof vi.fn> };
  let docSyncService: { generateDocs: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    analyzeService = { analyze: vi.fn() };
    docSyncService = { generateDocs: vi.fn() };
    controller = new ModernizerController(
      analyzeService as unknown as AnalyzeService,
      docSyncService as unknown as DocSyncService,
    );
  });

  describe('analyze', () => {
    it('should delegate the analyze GET endpoint to analyzeService.analyze', async () => {
      const mockResult = {
        issues: [
          {
            file: 'test.ts',
            line: 1,
            category: 'console-log' as const,
            message: 'test',
            severity: 'error' as const,
          },
        ],
        summary: { total: 1, byCategory: { 'console-log': 1 } },
      };
      analyzeService.analyze.mockReturnValue(mockResult);

      const result = await controller.analyze();
      expect(analyzeService.analyze).toHaveBeenCalledWith();
      expect(result).toEqual(mockResult);
    });
  });

  describe('docs', () => {
    it('should delegate the docs GET endpoint to docSyncService.generateDocs', async () => {
      const mockDocs = '# API Endpoints\n\n**Total endpoints: 5**\n';
      docSyncService.generateDocs.mockReturnValue(mockDocs);

      const result = await controller.docs();
      expect(docSyncService.generateDocs).toHaveBeenCalledWith();
      expect(result).toBe(mockDocs);
    });
  });
});
