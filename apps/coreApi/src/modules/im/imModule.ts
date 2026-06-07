import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { AuthModule } from '../auth/authModule';
import { ConnectionRegistry } from '../../infrastructure/connectionRegistry';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import { InMemoryMessageStore } from '../../infrastructure/inMemoryMessageStore';
import { ImMessageRepository } from '../../infrastructure/database/imMessageRepository';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { WsTenantGuard } from './guards/wsTenantGuard';
import { ImConversationController } from './imConversationController';
import { ImGateway } from './imGateway';
import { ImConversationService } from './services/imConversationService';
import { ImMessageService } from './services/imMessageService';
import { ImPresenceService } from './services/imPresenceService';
import { ImUploadController } from './imUploadController';

@Module({
  imports: [AuthModule, InfrastructureModule],
  controllers: [ImConversationController, ImUploadController],
  providers: [
    ImGateway,
    WsTenantGuard,
    ConnectionRegistry,
    InMemoryMessageStore,
    // Repositories receive the drizzle client / pg Pool directly (not DatabaseService) to keep the
    // controller→service→repository layering clean; the Service dependency lives here in the module.
    {
      provide: ConversationRepository,
      useFactory: (databaseService: DatabaseService) => new ConversationRepository(databaseService.drizzle),
      inject: [DatabaseService],
    },
    {
      provide: ImMessageRepository,
      useFactory: (store: InMemoryMessageStore, databaseService: DatabaseService) =>
        new ImMessageRepository(store, (databaseService.drizzle?.$client as Pool | undefined) ?? null),
      inject: [InMemoryMessageStore, DatabaseService],
    },
    ImConversationService,
    ImMessageService,
    ImPresenceService,
  ],
})
export class ImModule {}
