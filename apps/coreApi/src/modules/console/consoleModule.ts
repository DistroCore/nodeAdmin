import { Module } from '@nestjs/common';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { TenantsModule } from '../tenants/tenantsModule';
import { ConsoleController, MetricsController } from './consoleController';

@Module({
  imports: [InfrastructureModule, TenantsModule],
  controllers: [ConsoleController, MetricsController],
  providers: [DatabaseService, ConversationRepository],
})
export class ConsoleModule {}
