import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyzeService } from './analyzeService';
import { DocSyncService } from './docSyncService';
@ApiTags('modernizer')
@ApiBearerAuth()
@Controller('modernizer')
export class ModernizerController {
  constructor(
    private readonly analyzeService: AnalyzeService,
    private readonly docSyncService: DocSyncService,
  ) {}

  @Get('analyze')
  @ApiOperation({ summary: 'Run code quality analysis' })
  async analyze() {
    return this.analyzeService.analyze();
  }

  @Get('docs')
  @ApiOperation({ summary: 'Generate API endpoint documentation' })
  async docs() {
    return this.docSyncService.generateDocs();
  }
}
