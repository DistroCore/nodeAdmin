import { Module } from '@nestjs/common';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { ConsoleController, MetricsController } from './consoleController';

@Module({
  imports: [InfrastructureModule],
  controllers: [ConsoleController, MetricsController],
  providers: [DatabaseService, ConversationRepository],
})
export class ConsoleModule {}
