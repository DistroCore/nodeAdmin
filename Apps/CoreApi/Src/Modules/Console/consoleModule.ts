import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../Infrastructure/infrastructureModule';
import { ConsoleController } from './consoleController';

@Module({
  imports: [InfrastructureModule],
  controllers: [ConsoleController],
})
export class ConsoleModule {}
