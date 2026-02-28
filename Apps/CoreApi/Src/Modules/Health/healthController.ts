import { Controller, Get } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../../package.json');

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): { service: string; status: string; timestamp: string; version: string } {
    return {
      service: 'coreApi',
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: pkg.version,
    };
  }
}
