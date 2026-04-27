import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/authModule';
import { ConnectionRegistry } from '../../infrastructure/connectionRegistry';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';
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
    ConversationRepository,
    InMemoryMessageStore,
    ImMessageRepository,
    ImConversationService,
    ImMessageService,
    ImPresenceService,
  ],
})
export class ImModule {}
