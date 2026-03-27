import { Module } from '@nestjs/common';
import { HealthController } from './healthController';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
